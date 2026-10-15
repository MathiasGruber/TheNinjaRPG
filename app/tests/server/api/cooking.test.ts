import { REGEN_SECONDS } from "@/drizzle/constants";
import { combatEnergyRecoverySql } from "@/libs/combat/database";
import { combatCacheEnergy } from "@/libs/combat/userCache";
import { makeCompleteBattle } from "../../libs/combat/helpers/battleScenario";
import { queueEnergy } from "../../setup/queues";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as Sentry from "@sentry/nextjs";
import { and, eq } from "drizzle-orm";
import { craftingRequirement, item, userCookingJob, userData, userItem, userQueue, userRaidBuff, userVote } from "@/drizzle/schema";
import { occupationRouter } from "@/server/api/routers/occupation";
import { itemRouter } from "@/server/api/routers/item";
import { fetchUpdatedUser } from "@/server/api/routers/profile";
import type { DrizzleClient } from "@/server/db";
import { settleCookingExperience } from "@/server/utils/cooking";
import { settleCraftingQueue } from "@/server/utils/userQueue";
import { IncreaseStatTag, IncreaseRegenerationTag } from "@/validators/combat";
import { MEAL_ITEM_DEFAULTS } from "@/validators/cooking";
import { insertItems, insertUsers, insertUserItems } from "../../setup/factories";
import { failStatements } from "../../setup/statements";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const userId = "cook";
const past = () => new Date(Date.now() - 60000);
const readUser = async () => (await getTestDatabase()).query.userData.findFirst({ where: eq(userData.userId, userId) });
const materials = async () => (await getTestDatabase()).query.userItem.findMany({ where: and(eq(userItem.userId, userId), eq(userItem.itemId, "rice")) });

describeWithDatabase("Cooking production and consumption", () => {
  beforeEach(async () => {
    await resetTables(userCookingJob, userRaidBuff, userQueue, userItem, craftingRequirement, item, userVote, userData);
    const db = await getTestDatabase();
    await insertUsers([{ userId, username: "Cook", status: "AWAKE", level: 50, rank: "JONIN", isOutlaw: true, occupation: null, federalStatus: "GOLD", regenAt: new Date(), updatedAt: new Date() }]);
    await db.insert(userVote).values({ id: "cook-vote", userId, secret: "secret01", lastVoteAt: new Date() });
    await insertItems([
      { id: "rice", name: "Rice", stackSize: 100, canStack: true },
      { id: "meal", name: "Rice Bowl", ...MEAL_ITEM_DEFAULTS, itemType: "MEAL", canBeCrafted: true, canBeTraded: true, canStack: true, stackSize: 100, cookingTimeSeconds: 60, cookingOutputQuantity: 3, cookingExperience: 10, mealDurationSeconds: 120, effects: [IncreaseStatTag.parse({ power: 10, statTypes: ["Ninjutsu"] })] },
      { id: "meal2", name: "Healing Soup", ...MEAL_ITEM_DEFAULTS, itemType: "MEAL", stackSize: 100, mealDurationSeconds: 90, effects: [IncreaseRegenerationTag.parse({ power: 20 })] },
    ]);
    await db.insert(craftingRequirement).values({ id: "recipe-rice", craftItemId: "meal", requirementItemId: "rice", quantity: 2 });
    await insertUserItems([{ id: "rice-stack", userId, itemId: "rice", quantity: 20 }]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("lets every occupation cook, multiplies outputs, and awards XP once at completion", async () => {
    const db = await getTestDatabase();
    const caller = await callerFor(occupationRouter, userId);
    expect((await caller.craftItem({ itemId: "meal", quantity: 2 })).success).toBe(true);
    expect((await readUser())?.cookingExperience).toBe(0);
    expect((await readUser())?.craftingExperience).toBe(0);
    const outputs = await db.query.userItem.findMany({ where: eq(userItem.itemId, "meal") });
    expect(outputs.reduce((sum, row) => sum + row.quantity, 0)).toBe(6);
    expect((await materials())[0]?.quantity).toBe(16);
    const jobs = await db.query.userCookingJob.findMany();
    expect(await settleCookingExperience(db, userId, jobs)).toBe(false);
    await db.update(userCookingJob).set({ finishesAt: past() });
    const due = await db.query.userCookingJob.findMany();
    await Promise.all([settleCookingExperience(db, userId, due), settleCookingExperience(db, userId, due)]);
    expect((await readUser())?.cookingExperience).toBe(60);
    expect(await db.query.userCookingJob.findMany()).toHaveLength(0);
  });

  it("shares capacity with Crafting, reserves waiting ingredients and refunds cancellation once", async () => {
    const db = await getTestDatabase();
    await db.update(userData).set({ occupation: "CRAFTING" }).where(eq(userData.userId, userId));
    await insertItems([{ id: "crafted", name: "Craft", canBeCrafted: true }]);
    await db.insert(craftingRequirement).values({ id: "craft-rice", craftItemId: "crafted", requirementItemId: "rice", quantity: 1 });
    const caller = await callerFor(occupationRouter, userId);
    expect((await caller.craftItem({ itemId: "meal", quantity: 1 })).success).toBe(true);
    expect((await caller.craftItem({ itemId: "crafted", quantity: 1 })).success).toBe(true);
    const queue = await db.query.userQueue.findMany();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.itemId).toBe("crafted");
    expect((await materials())[0]?.quantity).toBe(17);
    const results = await Promise.all([caller.cancelQueuedCraft({ queueId: queue[0]!.id }), caller.cancelQueuedCraft({ queueId: queue[0]!.id })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect((await materials()).reduce((sum, row) => sum + row.quantity, 0)).toBe(18);
  });

  it("settles queued offline cooking and completion XP through profile refresh", async () => {
    const db = await getTestDatabase();
    const caller = await callerFor(occupationRouter, userId);
    await caller.craftItem({ itemId: "meal", quantity: 1 });
    await caller.craftItem({ itemId: "meal", quantity: 1 });
    await db.update(userItem).set({ craftingFinishedAt: new Date(Date.now() - 600000) }).where(eq(userItem.itemId, "meal"));
    await db.update(userCookingJob).set({ finishesAt: new Date(Date.now() - 600000) });
    await db.update(userQueue).set({ startsAt: new Date(Date.now() - 600000), finishesAt: new Date(Date.now() - 420000) });
    await fetchUpdatedUser({ client: db, userId });
    expect((await readUser())?.cookingExperience).toBe(60);
    expect(await db.query.userQueue.findMany()).toHaveLength(0);
    expect((await db.query.userItem.findMany({ where: eq(userItem.itemId, "meal") })).reduce((sum, row) => sum + row.quantity, 0)).toBe(6);
  });

  it("returns the loaded profile after a Cooking XP failure and retries the receipt exactly once", async () => {
    const db = await getTestDatabase();
    const receipt = { id: "cooking-retry", userId, experience: 30, finishesAt: past() };
    await db.insert(userCookingJob).values(receipt);
    const failing = new Proxy(db, {
      get(target, key, receiver) {
        if (key !== "transaction") return Reflect.get(target, key, receiver);
        return (callback: Parameters<typeof db.transaction>[0]) => target.transaction((tx) =>
          callback(failStatements(tx as unknown as DrizzleClient, userData) as typeof tx),
        );
      },
    });
    const warning = vi.spyOn(Sentry, "captureException").mockReturnValue("warning-event");

    const failed = await fetchUpdatedUser({ client: failing, userId });
    expect(failed.user?.userId).toBe(userId);
    expect(failed.user?.cookingExperience).toBe(0);
    expect((await readUser())?.cookingExperience).toBe(0);
    expect(await db.query.userCookingJob.findMany()).toEqual([receipt]);
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ message: "Statement failed on purpose" }), {
      level: "warning", tags: { source: "settleCookingExperience" },
    });

    const retried = await fetchUpdatedUser({ client: db, userId });
    expect(retried.user?.cookingExperience).toBe(30);
    expect(retried.requiresUserRefresh).toBe(true);
    expect(await db.query.userCookingJob.findMany()).toEqual([]);
    expect((await fetchUpdatedUser({ client: db, userId })).user?.cookingExperience).toBe(30);
    expect((await readUser())?.cookingExperience).toBe(30);
  });

  it("keeps profile reconciliation after Cooking XP commits but the refreshed profile read fails", async () => {
    const db = await getTestDatabase();
    await db.update(userData).set({ primaryElement: "Fire", secondaryElement: "Water" }).where(eq(userData.userId, userId));
    await db.insert(userCookingJob).values({ id: "cooking-reread", userId, experience: 30, finishesAt: past() });
    const read = db.query.userData.findFirst.bind(db.query.userData);
    const error = new Error("Refreshed profile unavailable");
    let profileReads = 0;
    vi.spyOn(db.query.userData, "findFirst").mockImplementation(((config: Parameters<typeof read>[0]) => {
      if (config?.with && ++profileReads === 2) throw error;
      return read(config);
    }) as never);
    const warning = vi.spyOn(Sentry, "captureException").mockReturnValue("warning-event");

    const result = await fetchUpdatedUser({ client: db, userId });
    expect(result.user?.userId).toBe(userId);
    expect(result.user?.cookingExperience).toBe(0);
    expect(result.requiresUserRefresh).toBe(true);
    expect(profileReads).toBe(2);
    expect(warning).toHaveBeenCalledWith(error, {
      level: "warning", tags: { source: "settleCookingExperience" },
    });
    expect((await readUser())?.cookingExperience).toBe(30);
    expect(await db.query.userCookingJob.findMany()).toEqual([]);
    expect((await fetchUpdatedUser({ client: db, userId })).user?.cookingExperience).toBe(30);
    expect((await readUser())?.cookingExperience).toBe(30);
  });

  it("rejects rank, ingredient and shared-capacity failures before taking ingredients", async () => {
    const db = await getTestDatabase();
    const caller = await callerFor(occupationRouter, userId);
    await db.update(item).set({ cookingMinLevel: 25 }).where(eq(item.id, "meal"));
    expect((await caller.craftItem({ itemId: "meal", quantity: 1 })).success).toBe(false);
    await db.update(item).set({ cookingMinLevel: 1 }).where(eq(item.id, "meal"));
    await db.update(userData).set({ federalStatus: "NONE" }).where(eq(userData.userId, userId));
    await caller.craftItem({ itemId: "meal", quantity: 1 });
    await caller.craftItem({ itemId: "meal", quantity: 1 });
    expect((await caller.craftItem({ itemId: "meal", quantity: 1 })).success).toBe(false);
    expect((await materials())[0]?.quantity).toBe(16);
  });

  it("rejects duplicate consumption, extends the same meal and replaces a different one", async () => {
    const db = await getTestDatabase();
    await insertUserItems([{ id: "edible", userId, itemId: "meal", quantity: 3 }, { id: "soup", userId, itemId: "meal2", quantity: 1 }]);
    const caller = await callerFor(itemRouter, userId);
    const results = await Promise.all([caller.consume({ userItemId: "edible", expectedQuantity: 3 }), caller.consume({ userItemId: "edible", expectedQuantity: 3 })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const initial = (await db.query.userRaidBuff.findMany())[0]!;
    expect((await caller.consume({ userItemId: "edible", expectedQuantity: 2 })).success).toBe(true);
    const extended = (await db.query.userRaidBuff.findMany())[0]!;
    expect(extended.expiresAt.getTime() - initial.expiresAt.getTime()).toBe(120000);
    expect((await caller.consume({ userItemId: "soup", expectedQuantity: 1 })).success).toBe(true);
    const replaced = await db.query.userRaidBuff.findMany();
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.itemId).toBe("meal2");
    expect(replaced[0]!.expiresAt.getTime()).toBeLessThan(extended.expiresAt.getTime());
    expect(await db.query.userItem.findFirst({ where: eq(userItem.id, "soup") })).toBeUndefined();
    expect((await caller.consume({ userItemId: "edible", expectedQuantity: 3 })).success).toBe(false);
  });

  it("settles expired regeneration before the normal five-minute throttle and includes queued Energy", async () => {
    const db = await getTestDatabase();
    const now = new Date();
    const step = REGEN_SECONDS * 1000;
    await db.update(userData).set({ regeneration: 10, regenAt: new Date(now.getTime() - 4 * step), updatedAt: now, curHealth: 0, maxHealth: 1000, curChakra: 0, maxChakra: 1000, curStamina: 0, maxStamina: 1000, curEnergy: 0, maxEnergy: 1000 }).where(eq(userData.userId, userId));
    await db.insert(userRaidBuff).values({ id: "expired-regen", userId, effects: [IncreaseRegenerationTag.parse({ power: 50 })], createdAt: new Date(now.getTime() - 5 * step), expiresAt: new Date(now.getTime() - 1.5 * step) });
    await queueEnergy(userId, [{ stat: "offence", energy: 20 }]);
    const result = await fetchUpdatedUser({ client: db, userId });
    expect(result.user?.curHealth).toBe(50);
    expect(result.user?.curEnergy).toBeCloseTo(30);
    expect(result.user?.regeneration).toBe(10);
    expect((await readUser())?.curHealth).toBe(50);
  });

  it("bounds battle Energy recovery by the meal expiry in SQL and the completion cache", async () => {
    const db = await getTestDatabase();
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date(from.getTime() + 2 * REGEN_SECONDS * 1000);
    const periods = [{ startsAt: from.getTime(), endsAt: from.getTime() + REGEN_SECONDS * 1000, bonus: 5 }];
    const snapshot = makeCompleteBattle({ extraState: { energyCapacity: { [userId]: 100 }, energyRegeneration: { [userId]: 10 }, energyRegenerationPeriods: { [userId]: periods } } });
    await db.update(userData).set({ curEnergy: 0, regenAt: from }).where(eq(userData.userId, userId));
    await db.update(userData).set({ curEnergy: combatEnergyRecoverySql(snapshot, userId, 0, to) }).where(eq(userData.userId, userId));
    expect((await readUser())?.curEnergy).toBe(25);
    expect(combatCacheEnergy({ curEnergy: 0, regenAt: from.toISOString() }, 100, 10, to, 0, periods)).toBe(25);
  });

  it.each(["ASLEEP", "BATTLE", "TRAVEL"] as const)("prevents eating while %s", async (status) => {
    const db = await getTestDatabase();
    await insertUserItems([{ id: "edible", userId, itemId: "meal", quantity: 1 }]);
    await db.update(userData).set({ status, ...(status === "BATTLE" ? { battleId: "busy" } : {}) }).where(eq(userData.userId, userId));
    const caller = await callerFor(itemRouter, userId);
    expect((await caller.consume({ userItemId: "edible", expectedQuantity: 1 })).success).toBe(false);
    expect((await db.query.userItem.findFirst({ where: eq(userItem.id, "edible") }))?.quantity).toBe(1);
    expect(await db.query.userRaidBuff.findMany()).toHaveLength(0);
  });
});
