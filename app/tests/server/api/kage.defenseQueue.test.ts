import { afterEach, beforeEach, expect, it, setSystemTime, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { KAGE_PRESTIGE_REQUIREMENT } from "@/drizzle/constants";
import { kageChallenge, kageDefendedChallenges, userData, village, war } from "@/drizzle/schema";
import * as combat from "@/server/api/routers/combat";
import { updateKage } from "@/libs/combat/database";
import { makeBattleUser, makeCompleteBattle } from "../../libs/combat/helpers/battleScenario";
import { kageRouter } from "@/server/api/routers/kage";
import { syncKageDefense, withinKageChallengeLimits } from "@/server/utils/kage";
import { getKageSlots } from "@/utils/kage";
import { insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const now = new Date("2026-10-12T12:00:00Z");
const windows = [{ day: 2, hour: 14 }, { day: 4, hour: 14 }];
const villageId = "defense-home";

describeWithDatabase("scheduled Kage defenses", () => {
  beforeEach(async () => {
    setSystemTime(now);
    await resetTables(kageDefendedChallenges, kageChallenge, kageDefendedChallenges, userData, village, war);
    const db = await getTestDatabase();
    await db.insert(village).values({ id: villageId, name: "Defense home", kageId: "defender", leaderUpdatedAt: now, kageScheduleAvailableAt: now });
    await insertUsers(["defender", "first", "second", "third"].map((id) => ({ userId: id, username: id, villageId, rank: "JONIN", status: "AWAKE", villagePrestige: KAGE_PRESTIGE_REQUIREMENT, joinedVillageAt: new Date("2026-01-01") })));
    expect((await (await callerFor(kageRouter, "defender")).publishSchedule({ villageId, windows })).success).toBe(true);
  });
  afterEach(() => { vi.restoreAllMocks(); setSystemTime(); });

  const join = async (id = "first") => {
    const caller = await callerFor(kageRouter, id);
    await caller.joinDefenseQueue({ villageId });
    return (await caller.getDefenses({ villageId })).hall!.queue.find((m) => m.challengerId === id)!;
  };
  const due = async () => {
    const m = await join();
    setSystemTime(new Date(m.scheduledAt!.getTime() - 60_000));
    const db = await getTestDatabase();
    const v = await db.query.village.findFirst();
    await db.update(village).set({ kageSchedule: { ...v!.kageSchedule!, observedAt: new Date().toISOString() } }).where(eq(village.id, villageId));
    return m;
  };

  it("keeps players awake and atomically rejects duplicate concurrent joins", async () => {
    const caller = await callerFor(kageRouter, "first");
    const results = await Promise.all([caller.joinDefenseQueue({ villageId }), caller.joinDefenseQueue({ villageId })]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    const db = await getTestDatabase();
    expect(await db.query.kageChallenge.findMany()).toHaveLength(1);
    expect((await db.query.userData.findFirst({ where: eq(userData.userId, "first") }))?.status).toBe("AWAKE");
  });
  it("assigns named challengers in FIFO order with advance notice and locks occupied schedules", async () => {
    const first = await join(); const second = await join("second");
    expect(first.scheduledAt!.getTime()).toBeGreaterThanOrEqual(now.getTime() + 86400_000);
    expect(second.scheduledAt!.getTime()).toBeGreaterThan(first.scheduledAt!.getTime());
    const caller = await callerFor(kageRouter, "defender");
    expect((await caller.publishSchedule({ villageId, windows })).success).toBe(false);
  });
  it("rejects invalid weekly windows and unauthorized publishing", async () => {
    const caller = await callerFor(kageRouter, "first");
    expect((await caller.publishSchedule({ villageId, windows })).success).toBe(false);
    await expect(caller.publishSchedule({ villageId, windows: [{ day: 1, hour: 10 }, { day: 1, hour: 12 }] })).rejects.toThrow();
  });
  it("allows one reschedule by either side and retains FIFO priority", async () => {
    const first = await join(); await join("second");
    const caller = await callerFor(kageRouter, "defender");
    expect((await caller.rescheduleDefense({ id: first.id })).success).toBe(true);
    const hall = (await caller.getDefenses({ villageId })).hall!;
    expect(hall.queue.map((m) => m.challengerId)).toEqual(["first", "second"]);
    expect(hall.queue[0]!.scheduledAt!.getTime()).toBeGreaterThan(first.scheduledAt!.getTime());
    expect(hall.queue[1]!.scheduledAt!.getTime()).toBeGreaterThan(hall.queue[0]!.scheduledAt!.getTime());
    expect((await (await callerFor(kageRouter, "first")).rescheduleDefense({ id: first.id })).success).toBe(false);
  });
  it("pauses during war and preserves queue order after war and a leadership change", async () => {
    await join(); await join("second");
    const db = await getTestDatabase();
    await db.insert(war).values({ id: "pause-war", attackerVillageId: villageId, defenderVillageId: "enemy", type: "VILLAGE_WAR", status: "ACTIVE" });
    await syncKageDefense(db, villageId);
    let hall = (await (await callerFor(kageRouter, "first")).getDefenses({ villageId })).hall!;
    expect(hall.schedule?.paused).toBe(true);
    expect(hall.queue.every((m) => !m.scheduledAt)).toBe(true);
    await db.update(war).set({ status: "DRAW", endedAt: now }).where(eq(war.id, "pause-war"));
    await db.update(village).set({ kageId: "third", leaderUpdatedAt: new Date(now.getTime() + 1) }).where(eq(village.id, villageId));
    hall = (await (await callerFor(kageRouter, "first")).getDefenses({ villageId })).hall!;
    expect(hall.schedule?.windows).toHaveLength(0);
    expect(hall.queue.map((m) => m.challengerId)).toEqual(["first", "second"]);
    expect(hall.queue.every((m) => !m.scheduledAt)).toBe(true);
  });
  it("removes an ineligible challenger and never converts ordinary offline time into prestige charges", async () => {
    const m = await join();
    const db = await getTestDatabase();
    await db.update(userData).set({ anbuId: "new-anbu" }).where(eq(userData.userId, "first"));
    await syncKageDefense(db, villageId);
    expect((await db.query.kageChallenge.findFirst({ where: eq(kageChallenge.id, m.id) }))?.status).toBe("CANCELLED");
    expect((await db.query.userData.findFirst({ where: eq(userData.userId, "defender") }))?.villagePrestige).toBe(KAGE_PRESTIGE_REQUIREMENT);
  });
  it("requires check-in near the match and mutual AI consent", async () => {
    const m = await join();
    const challenger = await callerFor(kageRouter, "first");
    const defender = await callerFor(kageRouter, "defender");
    expect((await challenger.checkInDefense({ id: m.id })).success).toBe(false);
    expect((await defender.setDefenseAi({ id: m.id, consent: true })).success).toBe(false);
    expect((await challenger.setDefenseAi({ id: m.id, consent: true })).success).toBe(true);
    expect((await defender.setDefenseAi({ id: m.id, consent: true })).success).toBe(true);
    expect((await challenger.setDefenseAi({ id: m.id, consent: false })).success).toBe(true);
    const db = await getTestDatabase();
    expect((await db.query.kageChallenge.findFirst())?.aiAccepted).toBe(false);
  });
  it("defers hospital stays only when the scheduled match is due", async () => {
    const m = await join(); const db = await getTestDatabase();
    await db.update(userData).set({ status: "HOSPITALIZED" }).where(eq(userData.userId, "first"));
    await syncKageDefense(db, villageId);
    expect((await db.query.kageChallenge.findFirst())?.hospitalDeferred).toBe(false);
    setSystemTime(m.scheduledAt!);
    await syncKageDefense(db, villageId);
    expect((await db.query.kageChallenge.findFirst())?.hospitalDeferred).toBe(true);
    await db.update(userData).set({ status: "AWAKE" }).where(eq(userData.userId, "first"));
    await syncKageDefense(db, villageId);
    expect((await db.query.kageChallenge.findFirst())?.scheduledAt?.getTime()).toBe(m.scheduledAt!.getTime() + 5 * 60_000);
  });
  it("records a missed attended start once, and does not penalize a service outage", async () => {
    const m = await due();
    expect((await (await callerFor(kageRouter, "first")).checkInDefense({ id: m.id })).success).toBe(true);
    const db = await getTestDatabase();
    setSystemTime(new Date(m.scheduledAt!.getTime() + 4 * 60_000)); await syncKageDefense(db, villageId);
    setSystemTime(new Date(m.scheduledAt!.getTime() + 6 * 60_000)); await syncKageDefense(db, villageId); await syncKageDefense(db, villageId);
    expect((await db.query.village.findFirst())?.kageSchedule?.missedStarts).toBe(1);
    expect((await db.query.kageChallenge.findFirst())?.status).toBe("FORFEITED");
    const next = await join("second");
    setSystemTime(new Date(next.scheduledAt!.getTime() + 86400_000));
    await syncKageDefense(db, villageId);
    expect((await db.query.village.findFirst())?.kageSchedule?.missedStarts).toBe(1);
    expect((await db.query.kageChallenge.findFirst({ where: eq(kageChallenge.id, next.id) }))?.status).toBe("SCHEDULED");
  });
  it("does not blame the Kage if a checked-in challenger leaves ordinary play", async () => {
    const m = await due(); const challenger = await callerFor(kageRouter, "first");
    await challenger.checkInDefense({ id: m.id });
    const db = await getTestDatabase();
    await db.update(userData).set({ status: "ASLEEP" }).where(eq(userData.userId, "first"));
    setSystemTime(new Date(m.scheduledAt!.getTime() + 4 * 60_000)); await syncKageDefense(db, villageId);
    setSystemTime(new Date(m.scheduledAt!.getTime() + 6 * 60_000)); await syncKageDefense(db, villageId);
    expect((await db.query.village.findFirst())?.kageSchedule?.missedStarts).toBe(0);
    expect((await db.query.kageChallenge.findFirst())?.status).toBe("FORFEITED");
  });
  it.each([false, true])("keeps queue priority after failed combat creation (throws %s)", async (throws) => {
    const m = await due();
    await (await callerFor(kageRouter, "first")).checkInDefense({ id: m.id });
    setSystemTime(m.scheduledAt!);
    const db = await getTestDatabase();
    const spy = vi.spyOn(combat, "initiateBattle");
    if (throws) spy.mockRejectedValue(new Error("Injected creation failure"));
    else spy.mockResolvedValue({ success: false, message: "Injected creation failure" } as never);
    const start = (await callerFor(kageRouter, "defender")).startDefense({ id: m.id });
    if (throws) await expect(start).rejects.toThrow("Injected creation failure");
    else expect((await start).success).toBe(false);
    setSystemTime(new Date(m.scheduledAt!.getTime() + 6 * 60_000)); await syncKageDefense(db, villageId);
    const stored = await db.query.kageChallenge.findFirst();
    expect(stored?.status).toBe("SCHEDULED"); expect(stored?.startedAt).toBeNull();
    expect(stored?.rescheduled).toBe(false); expect(stored?.scheduledAt!.getTime()).toBeGreaterThan(m.scheduledAt!.getTime());
    expect((await db.query.village.findFirst())?.kageSchedule?.missedStarts).toBe(0);
  });
  it("transfers an NPC title once using the canonical defender and rejects stale tenures", async () => {
    const m = await join(); const db = await getTestDatabase();
    await db.update(kageChallenge).set({ status: "BATTLE", battleId: "defense-battle", startedAt: now }).where(eq(kageChallenge.id, m.id));
    const b = makeCompleteBattle({ id: "defense-battle", battleType: "KAGE_PVP", usersState: [
      makeBattleUser("first", { isAggressor: true, villageId, curHealth: 100 }),
      makeBattleUser("npc-clone", { isAggressor: false, villageId, curHealth: 0, isAi: true }),
    ] });
    b.extraState.kageMatch = { id: m.id, villageId, kageId: "defender", tenure: now.toISOString(), ai: false };
    await updateKage(db, b, {} as never); await updateKage(db, b, {} as never);
    expect((await db.query.village.findFirst())?.kageId).toBe("first");
    expect(await db.query.kageDefendedChallenges.findMany()).toHaveLength(1);
    expect((await db.query.kageDefendedChallenges.findFirst())?.kageId).toBe("defender");
    await db.update(village).set({ kageId: "defender", leaderUpdatedAt: new Date(now.getTime() + 1) }).where(eq(village.id, villageId));
    await updateKage(db, b, {} as never);
    expect((await db.query.village.findFirst())?.kageId).toBe("defender");
  });
  it("keeps hospital recovery from overlapping the following assigned slot", async () => {
    const m = await due(); const next = await join("second"); const db = await getTestDatabase();
    await db.update(userData).set({ status: "HOSPITALIZED" }).where(eq(userData.userId, "first"));
    setSystemTime(m.scheduledAt!); await syncKageDefense(db, villageId);
    setSystemTime(new Date(next.scheduledAt!.getTime() - 3 * 60_000));
    await db.update(userData).set({ status: "AWAKE" }).where(eq(userData.userId, "first"));
    await syncKageDefense(db, villageId);
    const entries = await db.query.kageChallenge.findMany();
    const head = entries.find((m) => m.challengerId === "first")!;
    const tail = entries.find((m) => m.challengerId === "second")!;
    expect(tail.scheduledAt!.getTime() - head.scheduledAt!.getTime()).toBeGreaterThanOrEqual(60 * 60_000);
  });
  it("retains FIFO order when an outage moves the head past a later assignment", async () => {
    const head = await join(); const tail = await join("second"); await join("third"); const db = await getTestDatabase();
    setSystemTime(new Date(head.scheduledAt!.getTime() + 6 * 60_000)); await syncKageDefense(db, villageId);
    const hall = (await (await callerFor(kageRouter, "first")).getDefenses({ villageId })).hall!;
    expect(hall.queue.map((m) => m.challengerId)).toEqual(["first", "second", "third"]);
    expect(hall.queue[0]!.scheduledAt!.toISOString()).toBe("2026-10-15T14:00:00.000Z");
    expect(hall.queue[0]!.scheduledAt!.getTime()).toBeGreaterThan(tail.scheduledAt!.getTime());
    expect(hall.queue[1]!.scheduledAt!.getTime()).toBeGreaterThan(hall.queue[0]!.scheduledAt!.getTime());
  });
  it("freezes an unpublished schedule deadline across service interruptions", async () => {
    const db = await getTestDatabase(); await db.update(village).set({ kageSchedule: null }).where(eq(village.id, villageId));
    await syncKageDefense(db, villageId);
    setSystemTime(new Date(now.getTime() + 86400_000)); await syncKageDefense(db, villageId);
    expect((await db.query.village.findFirst())?.kageId).toBe("defender");
    expect(new Date((await db.query.village.findFirst())!.kageSchedule!.setupDueAt!).getTime()).toBeGreaterThan(Date.now());
  });
  it("removes a Kage who fails to publish within 24 hours without confiscating prestige", async () => {
    const db = await getTestDatabase();
    await db.update(village).set({ kageSchedule: null }).where(eq(village.id, villageId));
    await syncKageDefense(db, villageId);
    const v = (await db.query.village.findFirst())!;
    await db.update(village).set({ kageSchedule: { ...v.kageSchedule!, observedAt: new Date(now.getTime() + 86340_000).toISOString() } }).where(eq(village.id, villageId));
    setSystemTime(new Date(now.getTime() + 86400_000));
    await syncKageDefense(db, villageId);
    expect((await db.query.village.findFirst())?.kageId).toBe("");
    await db.update(userData).set({ rank: "ELDER" }).where(eq(userData.userId, "second"));
    expect((await (await callerFor(kageRouter, "second")).nominateKage({ villageId, userId: "first" })).success).toBe(true);
    expect((await db.query.village.findFirst())?.kageId).toBe("first");
    expect((await db.query.userData.findFirst({ where: eq(userData.userId, "defender") }))?.villagePrestige).toBe(KAGE_PRESTIGE_REQUIREMENT);
  });
});

it("uses UTC days and Monday calendar weeks for challenger caps", () => {
  expect(withinKageChallengeLimits([{ startedAt: new Date("2026-10-12T00:00Z") }], new Date("2026-10-12T23:59Z"))).toBe(false);
  expect(withinKageChallengeLimits([{ startedAt: new Date("2026-10-11T23:59Z") }], new Date("2026-10-12T00:00Z"))).toBe(true);
  expect(withinKageChallengeLimits([13, 14, 15].map((day) => ({ startedAt: new Date(`2026-10-${day}T12:00Z`) })), new Date("2026-10-16T12:00Z"))).toBe(false);
  expect(getKageSlots(windows, now).slice(0, 2).map((d) => d.toISOString())).toEqual(["2026-10-13T14:00:00.000Z", "2026-10-13T15:00:00.000Z"]);
});
