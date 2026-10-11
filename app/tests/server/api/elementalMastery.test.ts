import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { ELEMENTAL_MASTERY_CAP, MAX_DAILY_TRAININGS } from "@/drizzle/constants";
import { bloodline, gameSetting, trainingLog, userData, userQueue, userVote } from "@/drizzle/schema";
import { masteryTotal } from "@/libs/masteryProgression";
import { fetchUpdatedUser } from "@/server/api/routers/profile";
import { getMasteryQueue } from "@/libs/queue";
import { trainRouter } from "@/server/api/routers/train";
import { IncreaseDamageGivenTag } from "@/validators/combat";
import { getUserElements } from "@/validators/user";
import { insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const ID = "elemental-trainee";
const api = () => callerFor(trainRouter, ID);
const readUser = async () => (await (await getTestDatabase()).select().from(userData).where(eq(userData.userId, ID)))[0]!;
const patch = async (data: Partial<typeof userData.$inferInsert>) => (await getTestDatabase()).update(userData).set(data).where(eq(userData.userId, ID));
const session = async (element: "Wind" = "Wind") => ({ stat: element, startedAt: (await readUser()).masteryTrainingStartedAt! });

describeWithDatabase("elemental mastery guarded progression", () => {
  beforeEach(async () => {
    await resetTables(userData, userQueue, userVote, trainingLog, bloodline, gameSetting);
    await insertUsers([{ userId: ID, username: ID, rank: "JONIN", status: "AWAKE", isOutlaw: true, primaryElement: "Fire", secondaryElement: "Water", earnedExperience: 600_000, trainingSpeed: "1hr" }]);
    await (await getTestDatabase()).insert(userVote).values({ id: "vote-elemental", userId: ID, secret: "secret01", lastVoteAt: new Date() });
  });

  it("rejects innate, bloodline-provided and capped elements without spending XP", async () => {
    const caller = await api();
    expect((await caller.startMasteryTraining({ stat: "Fire" })).success).toBe(false);
    expect((await caller.investElementalExperience({ element: "Water", amount: 100 })).success).toBe(false);
    await (await getTestDatabase()).insert(bloodline).values({ id: "wind-line", name: "Wind Line", image: "/test.png", rank: "C", description: "test", effects: [IncreaseDamageGivenTag.parse({ elements: ["Wind"] })] });
    await patch({ bloodlineId: "wind-line", elementalMastery: { Earth: ELEMENTAL_MASTERY_CAP } });
    expect((await caller.startMasteryTraining({ stat: "Wind" })).success).toBe(false);
    expect((await caller.investElementalExperience({ element: "Wind", amount: 100 })).success).toBe(false);
    expect((await caller.investElementalExperience({ element: "Earth", amount: 100 })).success).toBe(false);
    expect((await readUser()).earnedExperience).toBe(600_000);
  });

  it("invests independently, unlocks only at cap and selects one active element", async () => {
    const caller = await api();
    const before = await readUser();
    expect((await caller.investElementalExperience({ element: "Wind", amount: 100 })).success).toBe(true);
    expect((await caller.selectTrainedElement({ element: "Wind" })).success).toBe(false);
    expect(getUserElements(await readUser() as never)).not.toContain("Wind");
    expect((await caller.investElementalExperience({ element: "Wind", amount: ELEMENTAL_MASTERY_CAP })).success).toBe(true);
    expect((await caller.investElementalExperience({ element: "Earth", amount: ELEMENTAL_MASTERY_CAP })).success).toBe(true);
    expect((await caller.selectTrainedElement({ element: "Wind" })).success).toBe(true);
    expect(getUserElements(await readUser() as never)).toContain("Wind");
    expect((await caller.selectTrainedElement({ element: "Earth" })).success).toBe(true);
    const after = await readUser();
    expect(getUserElements(after as never)).toEqual(["Fire", "Water", "Earth", "None"]);
    expect(after.elementalMastery).toEqual({ Wind: ELEMENTAL_MASTERY_CAP, Earth: ELEMENTAL_MASTERY_CAP });
    expect(after.earnedExperience).toBe(0);
    expect(after.experience).toBe(before.experience);
    expect(masteryTotal(after)).toBe(masteryTotal(before));
  });

  it("finishes a fractional timed balance with one whole unused XP point", async () => {
    await patch({ elementalMastery: { Wind: ELEMENTAL_MASTERY_CAP - 0.5 } });
    expect((await (await api()).investElementalExperience({ element: "Wind", amount: 1 })).success).toBe(true);
    const user = await readUser();
    expect(user.elementalMastery.Wind).toBe(ELEMENTAL_MASTERY_CAP);
    expect(user.earnedExperience).toBe(599_999);
  });

  it("guards concurrent XP spending and rejects overspending", async () => {
    await patch({ earnedExperience: 100 });
    const caller = await api();
    expect((await caller.investElementalExperience({ element: "Wind", amount: 101 })).success).toBe(false);
    const results = await Promise.all([caller.investElementalExperience({ element: "Wind", amount: 100 }), caller.investElementalExperience({ element: "Earth", amount: 100 })]);
    expect(results.filter(result => result.success)).toHaveLength(1);
    const user = await readUser();
    expect(user.earnedExperience).toBe(0);
    expect(Object.values(user.elementalMastery).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("caps timed collection, freezes speed and prevents replay/concurrent collection", async () => {
    await patch({ elementalMastery: { Wind: ELEMENTAL_MASTERY_CAP - 5 } });
    const caller = await api();
    expect((await caller.startMasteryTraining({ stat: "Wind" })).success).toBe(true);
    expect((await caller.startMasteryTraining({ stat: "Earth" })).success).toBe(false);
    const startedAt = new Date(Date.now() - 3_600_000);
    await patch({ masteryTrainingStartedAt: startedAt });
    const before = await readUser();
    const results = await Promise.all([caller.stopMasteryTraining({ stat: "Wind", startedAt }), caller.stopMasteryTraining({ stat: "Wind", startedAt })]);
    expect(results.filter(result => result.success)).toHaveLength(1);
    const after = await readUser();
    expect(after.elementalMastery.Wind).toBe(ELEMENTAL_MASTERY_CAP);
    expect(after.experience).toBe(before.experience);
    expect(after.dailyTrainings).toBe(before.dailyTrainings + 1);
    expect(after.currentlyTrainingMastery).toBeNull();
    expect((await caller.stopMasteryTraining({ stat: "Wind", startedAt })).success).toBe(false);
    const logs = await (await getTestDatabase()).select().from(trainingLog).where(eq(trainingLog.userId, ID));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ amount: 5, speed: "1hr", stat: "Wind" });
  });

  it("keeps the active interval fixed while another interval is requested", async () => {
    const caller = await api();
    await caller.updateTrainingSpeed({ speed: "15min" });
    await caller.startMasteryTraining({ stat: "Wind" });
    expect((await caller.updateTrainingSpeed({ speed: "24hrs" })).success).toBe(false);
    await patch({ masteryTrainingStartedAt: new Date(Date.now() - 900_000) });
    expect((await caller.stopMasteryTraining(await session())).success).toBe(true);
    const user = await readUser();
    expect(user.elementalMastery.Wind).toBeGreaterThan(0);
    expect(user.elementalMastery.Wind).toBeLessThan(1000);
  });

  it("retains progress after a bloodline swap but suppresses duplicate activation", async () => {
    const caller = await api();
    await patch({ elementalMastery: { Wind: ELEMENTAL_MASTERY_CAP, Earth: ELEMENTAL_MASTERY_CAP }, activeTrainedElement: "Wind" });
    const effects = [IncreaseDamageGivenTag.parse({ elements: ["Wind"] })];
    await (await getTestDatabase()).insert(bloodline).values({ id: "wind-line", name: "Wind Line", image: "/test.png", rank: "C", description: "test", effects });
    await patch({ bloodlineId: "wind-line" });
    expect((await caller.selectTrainedElement({ element: "Wind" })).success).toBe(false);
    expect((await caller.selectTrainedElement({ element: "Earth" })).success).toBe(true);
    expect((await readUser()).elementalMastery.Wind).toBe(ELEMENTAL_MASTERY_CAP);
    const publicElements = getUserElements({ ...await readUser(), bloodline: { effects } } as never);
    expect(publicElements.filter(element => element === "Wind")).toHaveLength(1);
    expect(publicElements).toContain("Earth");
  });

  it("cannot cash out newly provided elements and can cancel their old session", async () => {
    const caller = await api();
    await caller.startMasteryTraining({ stat: "Wind" });
    await patch({ primaryElement: "Wind", masteryTrainingStartedAt: new Date(Date.now() - 3_600_000) });
    expect((await caller.stopMasteryTraining(await session())).success).toBe(true);
    expect((await readUser()).elementalMastery.Wind ?? 0).toBe(0);
    expect((await readUser()).currentlyTrainingMastery).toBeNull();
  });

  it("enforces awake, banned interval and daily training limits", async () => {
    const caller = await api();
    await patch({ status: "ASLEEP" });
    expect((await caller.startMasteryTraining({ stat: "Wind" })).success).toBe(false);
    expect((await caller.investElementalExperience({ element: "Wind", amount: 1 })).success).toBe(false);
    expect((await caller.selectTrainedElement({ element: null })).success).toBe(false);
    await patch({ status: "AWAKE", isBanned: true });
    expect((await caller.startMasteryTraining({ stat: "Wind" })).success).toBe(false);
    await patch({ isBanned: false, dailyTrainings: MAX_DAILY_TRAININGS });
    expect((await caller.startMasteryTraining({ stat: "Wind" })).success).toBe(false);
  });
  it("shares the timed queue with disciplines, settles offline and rejects stale edits", async () => {
    const caller = await api();
    await patch({ federalStatus: "SILVER", elementalMastery: { Wind: ELEMENTAL_MASTERY_CAP - 1, Earth: ELEMENTAL_MASTERY_CAP - 1 } });
    await caller.updateTrainingSpeed({ speed: "15min" });
    expect((await caller.startMasteryTraining({ stat: "Wind" })).success).toBe(true);
    const entries = [{ stat: "Earth" as const, speed: "15min" as const }, { stat: "ninjutsuMastery" as const, speed: "1hr" as const }];
    expect((await caller.updateMasteryTrainingQueue({ expectedEntries: [], entries })).success).toBe(true);
    expect((await caller.updateMasteryTrainingQueue({ expectedEntries: [], entries: [] })).success).toBe(false);
    const before = await readUser();
    await patch({ status: "ASLEEP", masteryTrainingStartedAt: new Date(Date.now() - 1_801_000) });
    const { user } = await fetchUpdatedUser({ client: await getTestDatabase(), userId: ID });
    expect(user!.elementalMastery).toEqual({ Wind: ELEMENTAL_MASTERY_CAP, Earth: ELEMENTAL_MASTERY_CAP });
    expect(user!.currentlyTrainingMastery).toBe("ninjutsuMastery");
    expect(user!.trainingSpeed).toBe("1hr");
    expect(getMasteryQueue(user!)).toEqual([]);
    expect(user!.experience).toBe(before.experience);
    expect(masteryTotal(user!)).toBe(masteryTotal(before));
    expect(user!.dailyTrainings).toBe(before.dailyTrainings + 2);
    const second = await fetchUpdatedUser({ client: await getTestDatabase(), userId: ID });
    expect(second.user!.elementalMastery).toEqual(user!.elementalMastery);
    expect(second.user!.dailyTrainings).toBe(user!.dailyTrainings);
  });

});
