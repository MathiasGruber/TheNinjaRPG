import { describe, expect, it } from "bun:test";
import { CACHE_MAX_GRANTED_ITEMS } from "@/drizzle/constants";
import { cacheItemChance, resolveWeightedCache } from "@/libs/weightedCache";
import { NonCombatConsumeRewardTag } from "@/validators/combat";
import { type WeightedCache, weightedCacheSchema } from "@/validators/weightedCache";

const cache = (): WeightedCache => ({
  version: 1, displayName: "Chakra Pill Cache",
  rolls: [{ count: 1, probability: 5000 }, { count: 2, probability: 5000 }],
  tiers: [
    { name: "Draft", probability: 0, entries: [] },
    { name: "Common", probability: 7500, entries: [{ items: [{ itemId: "pill", quantity: 2 }] }, { items: [{ itemId: "ore", quantity: 1 }] }] },
    { name: "Rare", probability: 2500, entries: [{ items: [{ itemId: "pill", quantity: 3 }, { itemId: "gem", quantity: 2 }, { itemId: "pill", quantity: 1 }] }] },
  ],
});
const sequence = (...values: number[]) => { let index = 0; return () => { const value = values[index++]; if (value === undefined) throw new Error("Unexpected extra random draw"); return value; }; };

describe("weighted cache selection", () => {
  it("chooses the roll count once, honors boundaries and skips zero-weight tiers", () => {
    expect(resolveWeightedCache(cache(), sequence(0.499999, 0, 0)).items).toEqual([{ itemId: "pill", quantity: 2 }]);
    const result = resolveWeightedCache(cache(), sequence(0.5, 0.749999, 0.5, 0.75, 0));
    expect(result.rollCount).toBe(2);
    expect(result.selections.map((selection) => [selection.tierName, selection.entryIndex])).toEqual([["Common", 1], ["Rare", 0]]);
    expect(result.items).toEqual([{ itemId: "ore", quantity: 1 }, { itemId: "pill", quantity: 4 }, { itemId: "gem", quantity: 2 }]);
  });
  it("permits repeated selections and combines quantities and bundles", () => {
    const result = resolveWeightedCache(cache(), sequence(0.999999, 0.99, 0.99, 0.99, 0.99));
    expect(result.items).toEqual([{ itemId: "pill", quantity: 8 }, { itemId: "gem", quantity: 4 }]);
    expect(result.selections).toHaveLength(2);
  });
  it("gives equal intervals to every entry within a tier", () => {
    const entries = [0, 0.499999, 0.5, 0.999999].map((value) => resolveWeightedCache(cache(), sequence(0, 0, value)).selections[0]?.entryIndex);
    expect(entries).toEqual([0, 0, 1, 1]);
  });
  it("calculates the chance of at least one item over the roll-count distribution", () => {
    // Pill: 75% × 1/2 + 25% = 62.5% per roll; average of one and two rolls.
    expect(cacheItemChance(cache(), "pill")).toBeCloseTo(74.21875);
    expect(cacheItemChance(cache(), "missing")).toBe(0);
  });
});

describe("weighted cache validation and legacy compatibility", () => {
  it("preserves standard rewards and inactive cache settings", () => {
    const draft = cache(); draft.rolls = [];
    const standard = NonCombatConsumeRewardTag.parse({ reward_money: 25, weightedCache: draft, rewardMode: "standard" });
    expect(standard.reward_money).toBe(25);
    expect(standard.weightedCache).toEqual(draft);
    expect(NonCombatConsumeRewardTag.parse({ reward_items: [{ ids: ["pill"], number: 50, quantity: 3 }] }).reward_items).toEqual([{ ids: ["pill"], number: 50, quantity: 3 }]);
  });
  it("requires a supported valid config only in active cache mode", () => {
    expect(NonCombatConsumeRewardTag.safeParse({ rewardMode: "weightedCache" }).success).toBe(false);
    expect(NonCombatConsumeRewardTag.safeParse({ rewardMode: "weightedCache", weightedCache: cache() }).success).toBe(true);
  });
  for (const [label, edit] of [
    ["roll total", (c: WeightedCache) => { c.rolls[0]!.probability = 4999; }],
    ["tier total", (c: WeightedCache) => { c.tiers[1]!.probability = 7499; }],
    ["negative chance", (c: WeightedCache) => { c.rolls[0]!.probability = -1; }],
    ["infinite chance", (c: WeightedCache) => { c.rolls[0]!.probability = Number.POSITIVE_INFINITY; }],
    ["NaN chance", (c: WeightedCache) => { c.rolls[0]!.probability = Number.NaN; }],
    ["sub-basis-point chance", (c: WeightedCache) => { c.rolls[0]!.probability = 5000.1; }],
    ["zero rolls", (c: WeightedCache) => { c.rolls[0]!.count = 0; }],
    ["fractional rolls", (c: WeightedCache) => { c.rolls[0]!.count = 1.5; }],
    ["excessive rolls", (c: WeightedCache) => { c.rolls[0]!.count = 21; }],
    ["empty selectable tier", (c: WeightedCache) => { c.tiers[1]!.entries = []; }],
    ["empty entry", (c: WeightedCache) => { c.tiers[1]!.entries[0]!.items = []; }],
    ["empty reference", (c: WeightedCache) => { c.tiers[1]!.entries[0]!.items[0]!.itemId = ""; }],
    ["zero quantity", (c: WeightedCache) => { c.tiers[1]!.entries[0]!.items[0]!.quantity = 0; }],
    ["fractional quantity", (c: WeightedCache) => { c.tiers[1]!.entries[0]!.items[0]!.quantity = 1.5; }],
    ["excessive quantity", (c: WeightedCache) => { c.tiers[1]!.entries[0]!.items[0]!.quantity = 101; }],
    ["unsupported version", (c: WeightedCache) => { (c as { version: number }).version = 2; }],
    ["empty display name", (c: WeightedCache) => { c.displayName = " "; }],
  ] as const) it(`rejects ${label}`, () => { const invalid = cache(); edit(invalid); expect(weightedCacheSchema.safeParse(invalid).success).toBe(false); });
  it("caps the worst-case grant rather than only the selected outcome", () => {
    const invalid = cache(); invalid.rolls = [{ count: 20, probability: 10_000 }];
    invalid.tiers[1]!.entries[0]!.items = [{ itemId: "pill", quantity: 100 }, { itemId: "gem", quantity: 100 }];
    expect(weightedCacheSchema.safeParse(invalid).success).toBe(false);
    expect(CACHE_MAX_GRANTED_ITEMS).toBe(2000);
  });
});
