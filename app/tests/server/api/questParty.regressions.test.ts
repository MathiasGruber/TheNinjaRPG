import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { aiProfile, battle, battleHistory, quest, questHistory, questParty, overworldAiPlacement, item, userItem, userData, village, villageStructure } from "@/drizzle/schema";
import * as Sentry from "@sentry/nextjs";
import { getNewTrackers, getReward } from "@/libs/quest";
import { Pusher } from "@/libs/pusher";
import { fetchUpdatedUser } from "@/routers/profile";
import { questPartyRouter } from "@/routers/questParty";
import { overworldAiRouter } from "@/routers/overworldAi";
import { commitQuestObjectiveRewards, questsRouter } from "@/routers/quests";
import type { DrizzleClient } from "@/server/db";
import { AllObjectives } from "@/validators/objectives";
import { ObjectiveReward } from "@/validators/rewards";
import { insertItems, insertQuestHistory, insertQuests, insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

describeWithDatabase("quest team eligibility and terminal failure", () => {
  beforeEach(async () => {
    await resetTables(questParty, quest, questHistory, userData, village, villageStructure, aiProfile, battle, battleHistory, overworldAiPlacement, item, userItem);
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (typeof init?.body !== "string" || !init.body.includes("trpc-ratelimit")) return realFetch(input, init);
      const commands = JSON.parse(init.body) as unknown[];
      const resultFor = (command: unknown[]) => ({ result: command[0] === "evalsha" || command[0] === "eval" ? [59, 60] : 1 });
      return Response.json(Array.isArray(commands[0]) ? commands.map((command) => resultFor(command as unknown[])) : resultFor(commands));
    });
    const client = await getTestDatabase();
    await client.insert(village).values({ id: "home", name: "Home", kageId: "leader", sector: 50 });
    await client.insert(villageStructure).values({ id: "admin", villageId: "home", name: "Administrative Building", route: "/adminbuilding", image: "" });
    await insertUsers(["leader", "helper"].map((userId) => ({ userId, username: userId, status: "AWAKE", rank: "JONIN", level: 50, experience: 20_000_000, villageId: "home", sector: 50, longitude: 10, latitude: 10, money: 100, regenAt: new Date(), updatedAt: new Date() })));
  });
  afterEach(() => vi.restoreAllMocks());

  it("keeps lifetime-completed helpers active across profile reads and encounter preload without reopening or paying their receipt", async () => {
    const client = await getTestDatabase();
    await insertUsers([{ userId: "enemy", username: "enemy", isAi: true, level: 10, rank: "GENIN" }]);
    await client.insert(aiProfile).values({ id: "Default", userId: "enemy", rules: [] });
    await insertQuests([{ id: "team-quest", questType: "event", teamEnabled: true, hidden: false, maxAttempts: 2, maxCompletes: 2, retryDelay: "none", content: { objectives: [AllObjectives.parse({ id: "goal", task: "start_battle", opponentAIs: [{ ids: ["enemy"], number: 1 }] })], reward: ObjectiveReward.parse({ reward_money: 100 }), sceneBackground: "", sceneCharacters: [] } }]);
    const endAt = new Date("2026-10-01T00:00:00Z");
    await insertQuestHistory([{ id: "receipt", userId: "helper", questId: "team-quest", questType: "event", completed: 0, previousCompletes: 1, previousAttempts: 1, endAt }]);
    const leader = await callerFor(questPartyRouter, "leader");
    expect((await leader.create({ questId: "team-quest", isPublic: true })).success).toBe(true);
    const party = await client.query.questParty.findFirst();
    if (!party) throw new Error("Missing team fixture");
    expect((await (await callerFor(questPartyRouter, "helper")).join({ partyId: party.id })).success).toBe(true);
    const fresh = await fetchUpdatedUser({ client, userId: "helper" });
    expect(fresh.user?.userQuests.find((entry) => entry.questId === "team-quest")?.id).toBe(`party-${party.id}`);
    expect(fresh.user?.questData?.find((entry) => entry.id === "team-quest")?.party?.id).toBe(party.id);
    expect((await leader.startEncounter({ partyId: party.id })).success).toBe(true);
    const savedBattle = await client.query.battle.findFirst();
    if (!savedBattle) throw new Error("Missing battle fixture");
    expect(savedBattle.extraState.userQuests.helper?.find((entry) => entry.questId === "team-quest")?.id).toBe(`party-${party.id}`);
    expect(savedBattle.extraState.questData.helper?.find((entry) => entry.id === "team-quest")?.party?.id).toBe(party.id);
    const finishedTracker = structuredClone(party.tracker);
    finishedTracker.goals.forEach((goal) => { goal.done = true; });
    await client.update(questParty).set({ tracker: finishedTracker, version: party.version + 1 }).where(eq(questParty.id, party.id));
    await client.update(userData).set({ status: "AWAKE", battleId: null }).where(eq(userData.userId, "helper"));
    const claimed = await (await callerFor(questsRouter, "helper")).checkRewards({ questId: "team-quest" });
    expect(claimed.success).toBe(true);
    const receipt = await client.query.questHistory.findFirst({ where: eq(questHistory.id, "receipt") });
    expect(receipt).toMatchObject({ completed: 0, previousCompletes: 1, previousAttempts: 2, endAt });
    expect((await client.query.userData.findFirst({ where: eq(userData.userId, "helper") }))?.money).toBe(100);
  });

  it("fails every member when a bound NPC was deleted without a failure branch and denies final rewards", async () => {
    const client = await getTestDatabase();
    await insertQuests([{ id: "team-quest", questType: "event", teamEnabled: true, hidden: false, maxAttempts: 2, retryDelay: "none", content: { objectives: [AllObjectives.parse({ id: "goal", task: "defeat_opponents", overworldPlacementId: "deleted-placement", opponentAIs: [{ ids: ["enemy"], number: 1 }], sector: 50, longitude: 10, latitude: 10 })], reward: ObjectiveReward.parse({ reward_money: 100 }), sceneBackground: "", sceneCharacters: [] } }]);
    expect((await (await callerFor(questPartyRouter, "leader")).create({ questId: "team-quest", isPublic: true })).success).toBe(true);
    const party = await client.query.questParty.findFirst();
    if (!party) throw new Error("Missing team fixture");
    expect((await (await callerFor(questPartyRouter, "helper")).join({ partyId: party.id })).success).toBe(true);
    const location = await (await callerFor(questsRouter, "leader")).checkLocationQuest();
    expect(location.notifications?.some((message) => message.includes("destination was removed"))).toBe(true);
    expect((await client.query.questParty.findFirst({ where: eq(questParty.id, party.id) }))?.tracker.failed).toBe(true);
    const teammate = await fetchUpdatedUser({ client, userId: "helper" });
    expect(teammate.user?.questData?.find((entry) => entry.id === "team-quest")?.failed).toBe(true);
    await (await callerFor(questsRouter, "helper")).checkRewards({ questId: "team-quest" });
    const histories = await client.query.questHistory.findMany({ where: eq(questHistory.questId, "team-quest") });
    expect(histories).toHaveLength(2);
    expect(histories.every((entry) => entry.completed === 0 && entry.endAt !== null)).toBe(true);
    expect((await client.query.userData.findMany({ where: eq(userData.villageId, "home") })).map((entry) => entry.money)).toEqual([100, 100]);
  });

  for (const mode of ["bound-other-tile", "bound-same-tile", "generic"] as const) {
    it(`starts the selected eligible combat objective (${mode})`, async () => {
      const client = await getTestDatabase();
      await insertUsers(["enemy-first", "enemy-selected"].map((userId) => ({ userId, username: userId, isAi: true, level: 10, rank: "GENIN" })));
      await client.insert(aiProfile).values({ id: "Default", userId: "enemy-selected", rules: [] });
      if (mode !== "generic") {
        await client.insert(overworldAiPlacement).values({ id: "selected-npc", aiTemplateUserId: "enemy-selected", interactionType: "HOSTILE", sectorList: [], sector: 50, longitude: 10, latitude: 10, positionVersion: 0 });
      }
      await insertQuests([{ id: "team-quest", questType: "event", teamEnabled: true, hidden: false, consecutiveObjectives: false, maxAttempts: 2, retryDelay: "none", content: { objectives: [
        AllObjectives.parse({ id: "first", task: "defeat_opponents", opponentAIs: [{ ids: ["enemy-first"], number: 1 }], sector: 50, longitude: mode === "bound-same-tile" ? 10 : 5, latitude: 10 }),
        AllObjectives.parse({ id: "selected", task: "defeat_opponents", overworldPlacementId: mode === "generic" ? undefined : "selected-npc", opponentAIs: [{ ids: ["enemy-selected"], number: 1 }], sector: 50, longitude: 10, latitude: 10 }),
      ], reward: ObjectiveReward.parse({}), sceneBackground: "", sceneCharacters: [] } }]);
      const leader = await callerFor(questPartyRouter, "leader");
      expect((await leader.create({ questId: "team-quest", isPublic: true })).success).toBe(true);
      const party = await client.query.questParty.findFirst();
      if (!party) throw new Error("Missing team fixture");
      const result = mode === "generic"
        ? await leader.startEncounter({ partyId: party.id })
        : await (await callerFor(overworldAiRouter, "leader")).interactWithOverworldAi({ placementId: "selected-npc", positionVersion: 0 });
      expect(result.success).toBe(true);
      const savedBattle = await client.query.battle.findFirst();
      expect(savedBattle?.usersState.some((entry) => entry.controllerId === "enemy-selected")).toBe(true);
      expect(savedBattle?.usersState.some((entry) => entry.controllerId === "enemy-first")).toBe(false);
    });
  }

  for (const failure of ["CAS misses", "database error"] as const) {
    it(`finishes a claimed payout and consequences and recovers terminal progress after party publication ${failure}`, async () => {
      const client = await getTestDatabase();
      const reported = vi.spyOn(Sentry, "captureException").mockReturnValue("reported");
      vi.spyOn(Math, "random").mockReturnValue(0);
      await insertItems([{ id: "herb", canBeGathered: true }]);
      await client.update(userData).set({ occupation: "GATHERING" }).where(eq(userData.userId, "leader"));
      await insertQuests([
        { id: "next-quest", questType: "event", hidden: false, maxAttempts: 3, maxCompletes: 3, retryDelay: "none" },
        { id: "team-quest", questType: "event", teamEnabled: true, hidden: false, consecutiveObjectives: false, maxAttempts: 3, maxCompletes: 3, retryDelay: "none", content: { objectives: [
          AllObjectives.parse({ id: "goal", task: "stats_trained", value: 10, reward_money: 25 }),
        ], reward: ObjectiveReward.parse({ reward_money: 100, reward_gathering_items: true }), sceneBackground: "", sceneCharacters: [] } },
      ]);
      expect((await (await callerFor(questPartyRouter, "leader")).create({ questId: "team-quest", isPublic: true })).success).toBe(true);
      const { user } = await fetchUpdatedUser({ client, userId: "leader" });
      if (!user) throw new Error("Missing leader fixture");
      user.questData = getNewTrackers(user, [{ task: "stats_trained", increment: 10 }]).trackers;
      const reward = getReward(user, "team-quest");
      expect(reward.resolved).toBe(true);
      reward.consequences.push({ type: "start_quest", ids: ["next-quest"] });
      let failedWrites = 0;
      const injected = new Proxy(client, {
        get(target, property, receiver) {
          if (property === "update") return (table: unknown) => table === questParty ? {
            set: () => ({ where: async () => {
              failedWrites++;
              if (failure === "database error") throw new Error("Injected party write failure");
              return { rowsAffected: 0 };
            } }),
          } : target.update(table as typeof userData);
          return Reflect.get(target, property, receiver);
        },
      }) as DrizzleClient;
      const result = await commitQuestObjectiveRewards({ client: injected, userId: "leader", user, ...reward });
      expect(result.outcome).toBe("claimed");
      expect(failedWrites).toBe(failure === "CAS misses" ? 5 : 1);
      expect(reported).toHaveBeenCalledTimes(1);
      const receipt = await client.query.questHistory.findFirst({ where: eq(questHistory.questId, "team-quest") });
      expect(receipt).toMatchObject({ completed: 1, previousCompletes: 1 });
      expect(receipt?.endAt).not.toBeNull();
      const saved = await client.query.userData.findFirst({ where: eq(userData.userId, "leader") });
      expect(saved?.money).toBe(225);
      const gathered = await client.query.userItem.findMany({ where: eq(userItem.userId, "leader") });
      expect(gathered).toHaveLength(1);
      expect(gathered[0]).toMatchObject({ itemId: "herb", quantity: 1 });
      expect(saved?.questData?.find((entry) => entry.id === "team-quest")?.goals.find((entry) => entry.id === "goal")).toMatchObject({ done: true, value: 10, collected: true });
      expect(saved?.questData?.find((entry) => entry.id === "team-quest")?.party?.contributions.find((entry) => entry.id === "goal")).toMatchObject({ done: true, value: 10 });
      const nextReceipt = await client.query.questHistory.findFirst({ where: eq(questHistory.questId, "next-quest") });
      expect(nextReceipt?.endAt).toBeNull();
      expect((await client.query.questParty.findFirst())?.tracker.goals.find((entry) => entry.id === "goal")).toMatchObject({ done: false, value: 0 });
      expect((await commitQuestObjectiveRewards({ client, userId: "leader", user, ...reward })).outcome).toBe("already_completed");
      await fetchUpdatedUser({ client, userId: "leader" });
      const canonical = await client.query.questParty.findFirst();
      expect(canonical?.tracker.goals.find((entry) => entry.id === "goal")).toMatchObject({ done: true, value: 10 });
      const replay = await (await callerFor(questsRouter, "leader")).checkRewards({ questId: "team-quest" });
      expect(replay.rewards?.reward_money).toBe(0);
      expect((await client.query.userData.findFirst({ where: eq(userData.userId, "leader") }))?.money).toBe(225);
      expect(await client.query.userItem.findMany({ where: eq(userItem.userId, "leader") })).toEqual(gathered);
      expect(await client.query.questHistory.findFirst({ where: eq(questHistory.questId, "team-quest") })).toEqual(receipt);
      expect(await client.query.questHistory.findFirst({ where: eq(questHistory.questId, "next-quest") })).toEqual(nextReceipt);
      expect((await client.query.questParty.findFirst())?.tracker.goals.find((entry) => entry.id === "goal")?.value).toBe(10);
    });
  }
});
