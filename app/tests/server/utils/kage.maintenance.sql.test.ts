import { afterEach, beforeEach, expect, it, setSystemTime } from "bun:test";
import { eq } from "drizzle-orm";
import { KAGE_PRESTIGE_REQUIREMENT } from "@/drizzle/constants";
import { battle, kageDefendedChallenges, userData, village, war } from "@/drizzle/schema";
import { kageRouter } from "@/server/api/routers/kage";
import { maintainKageDefenses, syncKageDefense } from "@/server/utils/kage";
import { insertUsers } from "../../setup/factories";
import { beforeStatements } from "../../setup/statements";
import { callerFor, describeWithDatabase, getTestDatabase, recordQueries, resetTables } from "../../setup/testDatabase";

const now = new Date("2026-10-12T12:00:00Z");
const villageId = "maintenance-home";

describeWithDatabase("Kage defense maintenance", () => {
  beforeEach(async () => {
    setSystemTime(now);
    await resetTables(battle, kageDefendedChallenges, userData, village, war);
    const db = await getTestDatabase();
    await db.insert(village).values({
      id: villageId, name: "Maintenance home", kageId: "maintenance-kage",
      leaderUpdatedAt: now, kageScheduleAvailableAt: now,
    });
    await insertUsers(["maintenance-kage", "maintenance-challenger"].map((userId) => ({
      userId, username: userId, villageId, rank: "JONIN", status: "AWAKE",
      villagePrestige: KAGE_PRESTIGE_REQUIREMENT, joinedVillageAt: new Date("2026-01-01"),
    })));
    await syncKageDefense(db, villageId);
  });
  afterEach(() => setSystemTime());

  it.each([false, true])("heartbeats idle tenures without transactions (published: %s)", async (published) => {
    const db = await getTestDatabase();
    if (published) await (await callerFor(kageRouter, "maintenance-kage")).publishSchedule({
      villageId, windows: [{ day: 2, hour: 14 }, { day: 4, hour: 14 }],
    });
    const original = (await db.query.village.findFirst())!;
    setSystemTime(new Date(now.getTime() + 60_000));
    const recorded = await recordQueries(() => maintainKageDefenses(db));
    expect(recorded.statements).toHaveLength(2);
    expect(recorded.statements.some((s) => /start transaction|begin|commit/i.test(s))).toBe(false);
    const updated = (await db.query.village.findFirst())!;
    expect(updated.kageScheduleVersion).toBe(original.kageScheduleVersion + 1);
    expect(updated.kageSchedule).toEqual({ ...original.kageSchedule!, observedAt: new Date().toISOString() });
  });

  it("keeps completed defenses out of active maintenance", async () => {
    const db = await getTestDatabase();
    await db.insert(kageDefendedChallenges).values({
      id: "maintenance-history", villageId, userId: "maintenance-challenger",
      kageId: "maintenance-kage", status: "COMPLETED", notBefore: now,
      startedAt: now, resolvedAt: now, didWin: 0, rounds: 3,
    });
    expect((await recordQueries(() => maintainKageDefenses(db))).statements).toHaveLength(2);
  });

  it("never overwrites a concurrent publication with its idle snapshot", async () => {
    const db = await getTestDatabase();
    const windows = [{ day: 2, hour: 14 }, { day: 4, hour: 14 }];
    const raced = beforeStatements(db, village, [async () => {
      expect((await (await callerFor(kageRouter, "maintenance-kage")).publishSchedule({ villageId, windows })).success).toBe(true);
    }]);
    await maintainKageDefenses(raced);
    expect((await db.query.village.findFirst())?.kageSchedule?.windows).toEqual(windows);
  });

  it("does not write the prior tenure's heartbeat after concurrent succession", async () => {
    const db = await getTestDatabase();
    const original = (await db.query.village.findFirst())!;
    const raced = beforeStatements(db, village, [async () => {
      await db.update(village).set({ kageId: "maintenance-challenger", leaderUpdatedAt: new Date(now.getTime() + 1), kageSchedule: null }).where(eq(village.id, villageId));
    }]);
    await maintainKageDefenses(raced);
    const home = (await db.query.village.findFirst())!;
    expect(home.kageSchedule).toBeNull();
    expect(home.kageScheduleVersion).toBe(original.kageScheduleVersion);
  });

  it("still reconciles active challenges and settles attendance once", async () => {
    const db = await getTestDatabase();
    const scheduledAt = new Date(now.getTime() - 6 * 60_000);
    await db.insert(kageDefendedChallenges).values({
      id: "maintenance-due", villageId, userId: "maintenance-challenger",
      kageId: "maintenance-kage", tenure: now, status: "SCHEDULED", notBefore: scheduledAt,
      scheduledAt, checkedInAt: scheduledAt,
    });
    await maintainKageDefenses(db);
    await maintainKageDefenses(db);
    expect((await db.query.kageDefendedChallenges.findFirst())?.status).toBe("FORFEITED");
    expect((await db.query.village.findFirst())?.kageSchedule?.missedStarts).toBe(1);
  });

  it("enforces an expired publication deadline after healthy idle heartbeats", async () => {
    const db = await getTestDatabase();
    const home = (await db.query.village.findFirst())!;
    const deadline = new Date(home.kageSchedule!.setupDueAt!);
    setSystemTime(new Date(deadline.getTime() - 60_000));
    await db.update(village).set({ kageSchedule: { ...home.kageSchedule!, observedAt: new Date().toISOString() } }).where(eq(village.id, villageId));
    await maintainKageDefenses(db);
    setSystemTime(deadline);
    await maintainKageDefenses(db);
    expect((await db.query.village.findFirst())?.kageId).not.toBe("maintenance-kage");
  });

  it("freezes publication deadlines across a service gap", async () => {
    const db = await getTestDatabase();
    const original = (await db.query.village.findFirst())!.kageSchedule!;
    setSystemTime(new Date(now.getTime() + 25 * 3600_000));
    await maintainKageDefenses(db);
    const home = (await db.query.village.findFirst())!;
    expect(home.kageId).toBe("maintenance-kage");
    expect(new Date(home.kageSchedule!.setupDueAt!).getTime()).toBe(new Date(original.setupDueAt!).getTime() + 25 * 3600_000);
  });

  it("preserves war pauses and freezes setup until the first post-war observation", async () => {
    const db = await getTestDatabase();
    await db.insert(war).values({ id: "maintenance-war", attackerVillageId: villageId, defenderVillageId: "maintenance-enemy", type: "VILLAGE_WAR", status: "ACTIVE", startedAt: now });
    setSystemTime(new Date(now.getTime() + 60_000));
    await maintainKageDefenses(db);
    expect((await db.query.village.findFirst())?.kageSchedule?.paused).toBe(true);
    await db.update(war).set({ status: "DRAW", endedAt: new Date() }).where(eq(war.id, "maintenance-war"));
    setSystemTime(new Date(now.getTime() + 120_000));
    await maintainKageDefenses(db);
    const state = (await db.query.village.findFirst())!.kageSchedule!;
    expect(state.paused).toBe(false);
    expect(new Date(state.setupDueAt!).getTime()).toBe(now.getTime() + 24 * 3600_000 + 120_000);
  });

  it("freezes publication across a war between healthy observations without extending it twice", async () => {
    const db = await getTestDatabase();
    const home = (await db.query.village.findFirst())!;
    const deadline = new Date(home.kageSchedule!.setupDueAt!);
    await db.update(village).set({ kageSchedule: { ...home.kageSchedule!, observedAt: new Date(deadline.getTime() - 30_000).toISOString() } }).where(eq(village.id, villageId));
    await db.insert(war).values({ id: "maintenance-short-war", attackerVillageId: villageId, defenderVillageId: "maintenance-enemy", type: "VILLAGE_WAR", status: "DEFENDER_VICTORY", startedAt: new Date(deadline.getTime() - 10_000), endedAt: new Date(deadline.getTime() + 10_000) });
    setSystemTime(new Date(deadline.getTime() + 15_000));
    const recorded = await recordQueries(() => maintainKageDefenses(db));
    expect(recorded.statements.some((s) => /start transaction|begin/i.test(s))).toBe(true);
    const updated = (await db.query.village.findFirst())!;
    const extendedDeadline = new Date(deadline.getTime() + 45_000);
    expect(updated.kageId).toBe("maintenance-kage");
    expect(updated.kageSchedule?.paused).toBe(false);
    expect(updated.kageSchedule?.setupDueAt).toBe(extendedDeadline.toISOString());
    setSystemTime(new Date(deadline.getTime() + 30_000));
    await maintainKageDefenses(db);
    expect((await db.query.village.findFirst())?.kageSchedule?.setupDueAt).toBe(extendedDeadline.toISOString());
    setSystemTime(extendedDeadline);
    await maintainKageDefenses(db);
    expect((await db.query.village.findFirst())?.kageId).not.toBe("maintenance-kage");
  });

  it("preserves a war committed between an idle snapshot and its heartbeat", async () => {
    const db = await getTestDatabase();
    const home = (await db.query.village.findFirst())!;
    const deadline = new Date(home.kageSchedule!.setupDueAt!);
    const observation = new Date(deadline.getTime() - 30_000);
    await db.update(village).set({ kageSchedule: { ...home.kageSchedule!, observedAt: new Date(deadline.getTime() - 60_000).toISOString() } }).where(eq(village.id, villageId));
    setSystemTime(observation);
    const raced = beforeStatements(db, village, [async () => {
      await db.insert(war).values({ id: "maintenance-raced-war", attackerVillageId: villageId, defenderVillageId: "maintenance-enemy", type: "VILLAGE_WAR", status: "ACTIVE", startedAt: new Date(observation.getTime() - 1000) });
    }]);
    await maintainKageDefenses(raced);
    const observed = (await db.query.village.findFirst())!.kageSchedule!;
    expect(observed.observedAt).toBe(observation.toISOString());
    expect(observed.paused).toBe(false);
    await db.update(war).set({ status: "DEFENDER_VICTORY", endedAt: new Date(deadline.getTime() - 10_000) }).where(eq(war.id, "maintenance-raced-war"));
    setSystemTime(new Date(deadline.getTime() + 15_000));
    await maintainKageDefenses(db);
    const updated = (await db.query.village.findFirst())!;
    expect(updated.kageId).toBe("maintenance-kage");
    expect(updated.kageSchedule?.setupDueAt).toBe(new Date(deadline.getTime() + 45_000).toISOString());
  });

  it("initializes a changed tenure instead of copying its predecessor's state", async () => {
    const db = await getTestDatabase();
    const tenure = new Date(now.getTime() + 60_000);
    setSystemTime(tenure);
    await db.update(village).set({ kageId: "maintenance-challenger", leaderUpdatedAt: tenure }).where(eq(village.id, villageId));
    await maintainKageDefenses(db);
    const state = (await db.query.village.findFirst())!.kageSchedule!;
    expect(state.kageId).toBe("maintenance-challenger");
    expect(state.tenure).toBe(tenure.toISOString());
    expect(new Date(state.setupDueAt!).getTime()).toBe(tenure.getTime() + 24 * 3600_000);
  });
});
