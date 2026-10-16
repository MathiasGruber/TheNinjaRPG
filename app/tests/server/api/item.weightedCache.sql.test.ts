import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { actionLog, item, userData, userItem } from "@/drizzle/schema";
import { itemRouter } from "@/server/api/routers/item";
import type { DrizzleClient } from "@/server/db";
import { NonCombatConsumeRewardTag } from "@/validators/combat";
import { insertItems, insertUserItems, insertUsers } from "../../setup/factories";
import { callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

/** Exercise repeated bundle grants across both stackable and non-stackable inventory rows. */
const cacheEffect = () => NonCombatConsumeRewardTag.parse({ rewardMode: "weightedCache", weightedCache: {
  version: 1, displayName: "Chakra Pill Cache",
  rolls: [{ count: 2, probability: 10_000 }],
  tiers: [{ name: "Common", probability: 10_000, entries: [{ items: [{ itemId: "pill", quantity: 3 }, { itemId: "gear", quantity: 2 }] }] }],
} });

/** Inject a failure at the reward insert, after the real consumption claim ran. */
const failingGrantClient = (client: DrizzleClient): DrizzleClient => new Proxy(client, {
  get(target, property, receiver) {
    if (property === "transaction") return (callback: (tx: DrizzleClient) => Promise<unknown>) => target.transaction(async (tx) => callback(new Proxy(tx, {
      get(transaction, key, txReceiver) {
        if (key === "insert") return (table: typeof userItem) => {
          if (table === userItem) throw new Error("Injected grant failure");
          return transaction.insert(table);
        };
        return Reflect.get(transaction, key, txReceiver);
      },
    }) as unknown as DrizzleClient));
    return Reflect.get(target, property, receiver);
  },
});

describeWithDatabase("weighted cache consumption", () => {
  beforeEach(async () => {
    await resetTables(actionLog, userItem, item, userData);
    await insertUsers([{ userId: "opener", username: "Opener", level: 50, status: "AWAKE", isOutlaw: true }]);
    await insertItems([
      { id: "cache", name: "Pill Cache", itemType: "CONSUMABLE", destroyOnUse: true, preventBattleUsage: true, effects: [cacheEffect()] },
      { id: "pill", name: "Chakra Pill", canStack: true, stackSize: 4, hidden: true },
      { id: "gear", name: "Gear", canStack: false },
    ]);
    await insertUserItems([{ id: "cache-stack", userId: "opener", itemId: "cache", quantity: 2 }]);
  });
  it("grants bundles with stack limits and accurate combined quantities, then replays retries", async () => {
    const db = await getTestDatabase(); const caller = callerForDatabase(itemRouter, "opener", db);
    const input = { userItemId: "cache-stack", expectedQuantity: 2, requestId: "opening-request-1" };
    const response = await caller.consume(input);
    expect(response.success).toBe(true);
    if (!response.success || !("cacheRewards" in response)) throw new Error(response.message);
    expect(response.rewards?.reward_items.filter((name) => name === "Chakra Pill")).toHaveLength(6);
    expect(response.rewards?.reward_items.filter((name) => name === "Gear")).toHaveLength(4);
    expect(response.cacheRewards).toEqual([{ displayName: "Chakra Pill Cache", items: [{ name: "Chakra Pill", chance: 100 }, { name: "Gear", chance: 100 }] }]);
    expect(await caller.consume(input)).toEqual(response);
    const rows = await db.select().from(userItem);
    expect(rows.filter((row) => row.itemId === "pill").map((row) => row.quantity).sort()).toEqual([2, 4]);
    expect(rows.filter((row) => row.itemId === "gear")).toHaveLength(4);
    expect(rows.find((row) => row.id === "cache-stack")?.quantity).toBe(1);
    const logs = await db.select().from(actionLog);
    expect(logs).toHaveLength(1);
    expect(JSON.parse((logs[0]?.changes as string[])[0]!)).toMatchObject({ selections: [{ rollCount: 2, selections: [{ tierName: "Common", entryIndex: 0 }, { tierName: "Common", entryIndex: 0 }] }] });
  });
  it("deduplicates concurrent requests and replays the committed opening from a multi-unit stack", async () => {
    const db = await getTestDatabase(); const caller = callerForDatabase(itemRouter, "opener", db);
    const results = await Promise.all(Array.from({ length: 3 }, () => caller.consume({ userItemId: "cache-stack", requestId: "same-opening-request" })));
    // Passive regeneration can reject a stale account snapshot before another request commits.
    const committed = results.find((response) => response.success);
    expect(committed).toBeDefined();
    if (!committed) throw new Error("No request committed the opening");
    for (const _result of results) expect(await caller.consume({ userItemId: "cache-stack", requestId: "same-opening-request" })).toEqual(committed);
    expect((await db.select().from(userItem).where(eq(userItem.id, "cache-stack")))[0]?.quantity).toBe(1);
    expect(await db.select().from(actionLog)).toHaveLength(1);
  });
  it("lets only one concurrent distinct request claim a single cache", async () => {
    const db = await getTestDatabase(); await db.update(userItem).set({ quantity: 1 }).where(eq(userItem.id, "cache-stack"));
    const caller = callerForDatabase(itemRouter, "opener", db);
    const results = await Promise.all(["request-one", "request-two"].map((requestId) => caller.consume({ userItemId: "cache-stack", requestId })));
    expect(results.filter((response) => response.success)).toHaveLength(1);
    expect(await db.select().from(actionLog)).toHaveLength(1);
    expect((await db.select().from(userItem)).filter((row) => row.itemId === "pill").reduce((sum, row) => sum + row.quantity, 0)).toBe(6);
  });
  it("rolls back consumption, partial grants and receipt on failure and permits a safe retry", async () => {
    const db = await getTestDatabase(); const input = { userItemId: "cache-stack", requestId: "failed-opening-request" };
    const failing = callerForDatabase(itemRouter, "opener", failingGrantClient(db));
    await expect(failing.consume(input)).rejects.toThrow("Injected grant failure");
    expect((await db.select().from(userItem))).toHaveLength(1);
    expect((await db.select().from(userItem))[0]?.quantity).toBe(2);
    expect(await db.select().from(actionLog)).toHaveLength(0);
    expect((await callerForDatabase(itemRouter, "opener", db).consume(input)).success).toBe(true);
  });
  it("rejects missing references and malformed stored configurations before consuming", async () => {
    const db = await getTestDatabase(); const caller = callerForDatabase(itemRouter, "opener", db);
    await db.delete(item).where(eq(item.id, "pill"));
    expect((await caller.consume({ userItemId: "cache-stack", requestId: "missing-reference" })).success).toBe(false);
    const effect = cacheEffect(); effect.weightedCache!.rolls[0]!.probability = 9999;
    await db.update(item).set({ effects: [effect] }).where(eq(item.id, "cache"));
    expect((await caller.consume({ userItemId: "cache-stack", requestId: "invalid-configuration" })).success).toBe(false);
    expect((await db.select().from(userItem))[0]?.quantity).toBe(2);
    expect(await db.select().from(actionLog)).toHaveLength(0);
  });
  it("rejects unsupported stored modes instead of granting retained standard rewards", async () => {
    const db = await getTestDatabase();
    const effect = { ...cacheEffect(), reward_money: 99, rewardMode: "weightedCacheV2" };
    await db.update(item).set({ effects: [effect] as never }).where(eq(item.id, "cache"));
    const response = await callerForDatabase(itemRouter, "opener", db).consume({ userItemId: "cache-stack", requestId: "unsupported-reward-mode" });
    expect(response).toMatchObject({ success: false, message: "This item has an unsupported reward mode. Please contact staff." });
    expect((await db.select().from(userItem))[0]?.quantity).toBe(2);
    expect(await db.select().from(actionLog)).toHaveLength(0);
  });
  it("supports multiple cache effects, self-rewards and legacy independent rewards together", async () => {
    const db = await getTestDatabase(); const effect = cacheEffect(); effect.weightedCache!.tiers[0]!.entries = [{ items: [{ itemId: "cache", quantity: 1 }] }];
    await db.update(item).set({ effects: [cacheEffect(), effect, NonCombatConsumeRewardTag.parse({ reward_money: 7, reward_items: [{ ids: ["pill"], number: 100, quantity: 1 }] })] }).where(eq(item.id, "cache"));
    const response = await callerForDatabase(itemRouter, "opener", db).consume({ userItemId: "cache-stack", requestId: "multiple-cache-effects" });
    expect(response.success).toBe(true);
    if (!response.success || !("cacheRewards" in response)) throw new Error(response.message);
    expect(response.rewards?.reward_items.filter((name) => name === "Pill Cache")).toHaveLength(2);
    expect(response.rewards?.reward_items.filter((name) => name === "Chakra Pill")).toHaveLength(7);
    expect(response.rewards?.reward_money).toBe(7);
  });
});

describeWithDatabase("cache grant catalog races", () => {
  it("rolls back the opening if an item disappears between validation and delivery", async () => {
    const db = await getTestDatabase();
    await resetTables(actionLog, userItem, item, userData);
    await insertUsers([{ userId: "opener", username: "Opener", level: 50, status: "AWAKE", isOutlaw: true }]);
    await insertItems([{ id: "cache", itemType: "CONSUMABLE", effects: [cacheEffect()] }, { id: "pill", name: "Pill" }, { id: "gear", name: "Gear" }]);
    await insertUserItems([{ id: "cache-stack", userId: "opener", itemId: "cache", quantity: 1 }]);
    const racing = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "transaction") return async (callback: Parameters<DrizzleClient["transaction"]>[0]) => {
          await db.delete(item).where(eq(item.id, "pill"));
          return target.transaction(callback);
        };
        return Reflect.get(target, property, receiver);
      },
    });
    await expect(callerForDatabase(itemRouter, "opener", racing).consume({ userItemId: "cache-stack", requestId: "deleted-during-delivery" })).rejects.toThrow("Cache reward became unavailable during delivery");
    expect((await db.select().from(userItem))).toHaveLength(1);
    expect((await db.select().from(userItem))[0]?.quantity).toBe(1);
    expect(await db.select().from(actionLog)).toHaveLength(0);
  });
});
