import { describe, expect, it } from "bun:test";
import { nonCombatConsume } from "@/libs/item";
import {
  ItemValidator,
  NonCombatQuestTag,
  getTagSchema,
  tagTypes,
} from "@/validators/combat";
import { QuestValidator } from "@/validators/objectives";

const validItem = {
  name: "Farm item",
  image: "item.webp",
  description: "Farm item",
  battleDescription: "Farm item",
  stackSize: 1,
  chakraCost: 0,
  healthCost: 0,
  staminaCost: 0,
  healthCostReducePerLvl: 0,
  chakraCostReducePerLvl: 0,
  staminaCostReducePerLvl: 0,
  actionCostPerc: 100,
  maxImbueNumber: 1,
  maxDurability: 100,
  hidden: false,
  cooldown: 0,
  cost: 1,
  repsCost: 0,
  seichiSilverCost: 0,
  range: 0,
  maxEquips: 0,
  method: "SINGLE" as const,
  target: "SELF" as const,
  itemType: "MATERIAL" as const,
  weaponType: "NONE" as const,
  rarity: "COMMON" as const,
  slot: "NONE" as const,
  requiredNinjutsuMastery: null,
  requiredGenjutsuMastery: null,
  requiredTaijutsuMastery: null,
  requiredBukijutsuMastery: null,
  requiredBloodlineMastery: null,
  requiredSageMastery: null,
  requiredStrength: null,
  requiredSpeed: null,
  requiredIntelligence: null,
  requiredWillpower: null,
  expireFromStoreAt: null,
  effects: [],
  farmYieldItemId: null,
  farmExtractSeedItemId: null,
  crystalTargetTypes: null,
  bloodlineId: null,
};

const effect = NonCombatQuestTag.parse({ questId: "special-quest" });
const scroll = {
  ...validItem,
  itemType: "CONSUMABLE",
  destroyOnUse: true,
  preventBattleUsage: true,
  effects: [effect],
};

describe("Special quest item authoring", () => {
  it("offers the tag and a default editable quest ID", () => {
    expect(tagTypes).toContain("noncombatquest");
    expect(getTagSchema("noncombatquest").parse({})).toMatchObject({
      type: "noncombatquest",
      questId: "",
    });
  });
  it("accepts a noncombat scroll and recognizes it as consumable", () => {
    const result = ItemValidator.safeParse(scroll);
    expect(result.success).toBe(true);
    if (result.success)
      expect(nonCombatConsume(result.data as never, {} as never)).toBe(true);
  });
  it.each([
    { preventBattleUsage: false },
    { destroyOnUse: false },
    { target: "CHARACTER" },
    { method: "AOE" },
    { itemType: "WEAPON" },
  ])("rejects an invalid quest item: %j", (change) => {
    expect(ItemValidator.safeParse({ ...scroll, ...change }).success).toBe(false);
  });
  it("requires a quest ID and only one grant per item", () => {
    expect(
      ItemValidator.safeParse({ ...scroll, effects: [NonCombatQuestTag.parse({})] })
        .success,
    ).toBe(false);
    expect(
      ItemValidator.safeParse({ ...scroll, effects: [effect, effect] }).success,
    ).toBe(false);
    expect(NonCombatQuestTag.safeParse({ questId: "   " }).success).toBe(false);
  });
  it("allows Special authoring with a retry period and zero completion caps", () => {
    const result = QuestValidator.safeParse({
      name: "Special Quest",
      image: "https://example.com/quest.webp",
      description: "A special contract.",
      successDescription: "Contract complete.",
      questRank: "D",
      tierLevel: null,
      questType: "special",
      content: { objectives: [], reward: {} },
      hidden: false,
      consecutiveObjectives: false,
      startsAt: null,
      endsAt: null,
      maxAttempts: 0,
      maxCompletes: 0,
      retryDelay: "daily",
    });
    expect(result.error?.issues).toBeUndefined();
  });
});
