import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { conversation, dungeon, dungeonMember, dungeonRun, quest, questHistory, questParty, user2conversation, userData, village, villageStructure } from "@/drizzle/schema";
import { coopRouter } from "@/server/api/routers/coop";
import { Pusher } from "@/libs/pusher";
import { AllObjectives } from "@/validators/objectives";
import { ObjectiveReward } from "@/validators/rewards";
import { dungeonContent } from "../../setup/dungeon";
import { insertQuests, insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

describeWithDatabase("co-op activity adapters", () => {
  beforeEach(async () => {
    await resetTables(conversation, dungeon, dungeonMember, dungeonRun, quest, questHistory, questParty, user2conversation, userData, village, villageStructure);
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (typeof init?.body !== "string" || !init.body.includes("trpc-ratelimit")) return realFetch(input, init);
      const commands = JSON.parse(init.body) as unknown[];
      const resultFor = (command: unknown[]) => ({ result: command[0] === "evalsha" || command[0] === "eval" ? [59, 60] : 1 });
      return Response.json(Array.isArray(commands[0]) ? commands.map((command) => resultFor(command as unknown[])) : resultFor(commands));
    });
    await insertUsers([{ userId: "leader", username: "leader", status: "AWAKE", rank: "JONIN", level: 50, experience: 20_000_000, villageId: "home", sector: 1, longitude: 10, latitude: 10, regenAt: new Date(), updatedAt: new Date() }]);
    const db = await getTestDatabase();
    await db.insert(village).values({ id: "home", name: "Home", kageId: "leader", sector: 1 });
    await db.insert(villageStructure).values({ id: "admin", villageId: "home", name: "Administrative Building", route: "/adminbuilding", image: "" });
    await db.insert(dungeon).values({ id: "definition", content: dungeonContent(), updatedAt: new Date() });
    await insertQuests([{ id: "team-quest", questType: "event", teamEnabled: true, hidden: false, maxAttempts: 3, maxCompletes: 3, retryDelay: "none", content: { objectives: [AllObjectives.parse({ id: "train", task: "stats_trained", value: 100 })], reward: ObjectiveReward.parse({}), sceneBackground: "", sceneCharacters: [] } }]);
  });
  afterEach(() => vi.restoreAllMocks());
  it.each(["quest", "dungeon"] as const)("retains independent membership scopes when %s is created first", async (first) => {
    const caller = await callerFor(coopRouter, "leader");
    const createQuest = () => caller.quest.create({ questId: "team-quest", isPublic: true });
    const createDungeon = () => caller.dungeon.create({ id: "definition" });
    expect((await (first === "quest" ? createQuest() : createDungeon())).success).toBe(true);
    expect((await (first === "quest" ? createDungeon() : createQuest())).success).toBe(true);
    const db = await getTestDatabase();
    const team = (await db.query.questParty.findFirst())!;
    const run = (await db.query.dungeonRun.findFirst())!;
    expect((await caller.quest.overview()).current?.id).toBe(team.id);
    expect((await caller.dungeon.getState()).runs[0]?.id).toBe(run.id);
    expect((await createQuest()).success).toBe(false);
    expect((await createDungeon()).success).toBe(false);
    expect((await caller.dungeon.act({ id: run.id, action: "leave" })).success).toBe(true);
    expect((await caller.quest.overview()).current?.id).toBe(team.id);
    expect((await db.query.userData.findFirst({ where: eq(userData.userId, "leader") }))?.questPartyId).toBe(team.id);
    expect((await caller.quest.leave({ partyId: team.id })).success).toBe(true);
    expect(await db.query.questHistory.findFirst({ where: eq(questHistory.questId, "team-quest") })).toMatchObject({ endAt: null, completed: 0 });
  });
});
