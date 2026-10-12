import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { aiProfile, battle, battleHistory, quest, questHistory, questParty, userData, village, villageStructure } from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { fetchUpdatedUser } from "@/routers/profile";
import { questPartyRouter } from "@/routers/questParty";
import { questsRouter } from "@/routers/quests";
import { AllObjectives } from "@/validators/objectives";
import { ObjectiveReward } from "@/validators/rewards";
import { insertQuestHistory, insertQuests, insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

describeWithDatabase("quest team eligibility and terminal failure", () => {
  beforeEach(async () => {
    await resetTables(questParty, quest, questHistory, userData, village, villageStructure, aiProfile, battle, battleHistory);
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
});
