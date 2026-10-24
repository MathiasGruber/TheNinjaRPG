import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { DMG_SETTING_DEFAULTS, BATTLE_ARENA_DAILY_LIMIT } from "@/drizzle/constants";
import {
  aiProfile, battle, battleHistory, gameSetting, jutsu, quest, questHistory,
  userCookingJob, userData, userJutsu, userQueue, userVote, village,
} from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { combatRouter } from "@/server/api/routers/combat";
import { fetchUpdatedUser } from "@/server/api/routers/profile";
import type { DrizzleClient } from "@/server/db";
import { withRequestScope } from "@/server/requestScope";
import { SimpleObjective } from "@/validators/objectives";
import { ObjectiveReward } from "@/validators/rewards";
import { insertQuests, insertUsers } from "../../setup/factories";
import { beforeStatements } from "../../setup/statements";
import {
  callerForDatabase, describeWithDatabase, getTestDatabase, recordQueries, resetTables,
} from "../../setup/testDatabase";

const userId = "arena-ready";
const aiId = "arena-ai";
const launch = (client: DrizzleClient, input: { aiId: string; autoCombat?: boolean } = { aiId }) =>
  withRequestScope(() => callerForDatabase(combatRouter, userId, client).startArenaBattle(input));

const notificationReads = (statements: string[]) => statements.filter((statement) =>
  /from `(?:Poll|MpvpBattleQueue)`|from `Quest` `quest`/.test(statement));

describeWithDatabase("arena readiness reads", () => {
  beforeEach(async () => {
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    await resetTables(battle, battleHistory, aiProfile, gameSetting, questHistory, quest,
      userCookingJob, userQueue, userJutsu, jutsu, userVote, userData, village);
    const client = await getTestDatabase();
    const now = new Date();
    await insertUsers([
      { userId, rank: "JONIN", level: 50, status: "AWAKE", isOutlaw: true,
        sector: 0, money: 1000, updatedAt: now, regenAt: now, defaultAutoCombat: true,
        primaryElement: "Fire", secondaryElement: "Water" },
      { userId: aiId, isAi: true, isSummon: false, inArena: true, rank: "JONIN", level: 50 },
    ]);
    await client.insert(userVote).values({ id: "vote", userId, secret: "secret01", lastVoteAt: now });
    await client.insert(village).values({ id: "arena", name: "Arena", sector: 0, kageId: "" });
    await client.insert(aiProfile).values({ id: "Default", userId: "default-ai", rules: [] });
    await client.insert(gameSetting).values(Object.entries(DMG_SETTING_DEFAULTS).map(([name, value]) =>
      ({ id: name, name, value, time: now })));
  });
  afterEach(() => vi.restoreAllMocks());

  it("omits display alerts and reads achievements once across readiness and battle preload", async () => {
    const client = await getTestDatabase();
    const { result, statements } = await recordQueries(() => launch(client));
    expect(result.success).toBe(true);
    expect(notificationReads(statements)).toEqual([]);
    expect(statements.filter((statement) => /from `Quest` where/.test(statement) &&
      statement.includes("`Quest`.`questType` =") && statement.includes("`Quest`.`hidden`"))).toHaveLength(1);
    const saved = (await client.query.battle.findFirst())!;
    expect(saved.battleType).toBe("ARENA");
    expect(saved.usersState.find((user) => user.controllerId === userId)?.isAutoCombat).toBe(true);
  });

  it("retains display alert reads for ordinary profile callers", async () => {
    const client = await getTestDatabase();
    const { statements } = await recordQueries(() => fetchUpdatedUser({ client, userId }));
    expect(notificationReads(statements)).toHaveLength(3);
  });

  it("starts the AI lookup while the readiness participant read is still pending", async () => {
    const client = await getTestDatabase();
    let release = () => {};
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let aiReadStarted = false;
    let readinessReadStarted = false;
    let signalReadiness = () => {};
    const readiness = new Promise<void>((resolve) => { signalReadiness = resolve; });
    const original = client.query.userData.findFirst.bind(client.query.userData);
    vi.spyOn(client.query.userData, "findFirst").mockImplementation(((options: Parameters<typeof original>[0]) => {
      if (options?.with) {
        readinessReadStarted = true;
        signalReadiness();
        return pending.then(() => original(options)) as ReturnType<typeof original>;
      }
      if (options?.where && typeof options.where !== "function")
        aiReadStarted ||= new MySqlDialect().sqlToQuery(options.where).params.includes(aiId);
      return original(options);
    }) as typeof original);
    const started = launch(client);
    try {
      // Wait for the readiness read to be held without relying on database timings.
      await readiness;
      expect(readinessReadStarted).toBe(true);
      expect(aiReadStarted).toBe(true);
    } finally {
      release();
      await started;
    }
  });

  it("settles due queues, cooking receipts and regeneration before freezing combatants", async () => {
    const client = await getTestDatabase();
    const past = new Date(Date.now() - 360_000);
    await client.update(userData).set({ updatedAt: past, regenAt: past, regeneration: 100,
      curHealth: 1, maxHealth: 1000, cookingExperience: 0 }).where(eq(userData.userId, userId));
    await client.insert(userCookingJob).values({ id: "cooked", userId, experience: 7, finishesAt: past });
    await client.insert(jutsu).values({ id: "retired", name: "Retired", description: "",
      battleDescription: "", effects: [], target: "SELF", range: 0, requiredRank: "STUDENT",
      jutsuRank: "D", jutsuType: "NORMAL", image: "", hidden: true });
    await client.insert(userQueue).values({ id: "due", userId, kind: "JUTSU", position: 1,
      jutsuId: "retired", reservedRyo: 100, durationSeconds: 60, startsAt: past, finishesAt: past });
    expect((await launch(client, { aiId, autoCombat: false })).success).toBe(true);
    const saved = (await client.query.battle.findFirst())!;
    const actor = saved.usersState.find((user) => user.controllerId === userId)!;
    expect(actor.curHealth).toBeGreaterThan(1);
    expect(actor.isAutoCombat).toBe(false);
    const owner = (await client.query.userData.findFirst({ where: eq(userData.userId, userId) }))!;
    expect(owner.cookingExperience).toBe(7);
    expect(owner.money).toBe(1100);
    expect(await client.query.userCookingJob.findMany()).toEqual([]);
    expect(await client.query.userQueue.findMany()).toEqual([]);
  });

  it("retains quest progression while omitting display alerts", async () => {
    const client = await getTestDatabase();
    await insertQuests([{ id: "arena-level", questType: "achievement", content: {
      objectives: [SimpleObjective.parse({ id: "level", task: "user_level", value: 50 })],
      reward: ObjectiveReward.parse({}), sceneBackground: "", sceneCharacters: [],
    } }]);
    expect((await launch(client)).success).toBe(true);
    const owner = (await client.query.userData.findFirst({ where: eq(userData.userId, userId) }))!;
    expect(owner.questData.some((tracker) => tracker.id === "arena-level")).toBe(true);
  });

  it("keeps the final participant claim when another action changes status after readiness", async () => {
    const client = await getTestDatabase();
    const raced = beforeStatements(client, userData, [() => client.update(userData)
      .set({ status: "ASLEEP" }).where(eq(userData.userId, userId))]);
    expect((await launch(raced)).success).toBe(false);
    expect(await client.query.battle.findMany()).toEqual([]);
    expect(await client.query.userData.findFirst({ where: eq(userData.userId, userId) }))
      .toMatchObject({ status: "ASLEEP", battleId: null });
  });

  it.each([
    { isBanned: true },
    { dailyArenaFights: BATTLE_ARENA_DAILY_LIMIT },
  ])("preserves arena rejection for %j", async (patch) => {
    const client = await getTestDatabase();
    await client.update(userData).set(patch).where(eq(userData.userId, userId));
    expect((await launch(client)).success).toBe(false);
    expect(await client.query.battle.findMany()).toEqual([]);
  });

  it("rejects AI templates no longer available in the arena", async () => {
    const client = await getTestDatabase();
    await client.update(userData).set({ inArena: false }).where(eq(userData.userId, aiId));
    expect(await launch(client)).toMatchObject({ success: false, message: "No AI found" });
    expect(await client.query.battle.findMany()).toEqual([]);
  });
});
