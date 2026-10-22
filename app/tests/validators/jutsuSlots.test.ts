import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  AllTags,
  IncreaseJutsuSlots,
  ItemValidator,
  SuperRefinePassiveEffects,
} from "@/validators/combat";

const scroll = {
  name: "Jutsu slot scroll",
  image: "scroll.webp",
  description: "A permanent extra slot",
  battleDescription: "",
  hidden: false,
  itemType: "CONSUMABLE",
  target: "SELF",
  method: "SINGLE",
  destroyOnUse: true,
  preventBattleUsage: true,
  rarity: "COMMON",
  slot: "NONE",
  weaponType: "NONE",
  stackSize: 1,
  maxDurability: 100,
  maxImbueNumber: 1,
  chakraCost: 0,
  healthCost: 0,
  staminaCost: 0,
  healthCostReducePerLvl: 0,
  chakraCostReducePerLvl: 0,
  staminaCostReducePerLvl: 0,
  actionCostPerc: 100,
  cooldown: 0,
  range: 0,
  maxEquips: 0,
  cost: 1,
  repsCost: 0,
  seichiSilverCost: 0,
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
  farmYieldItemId: null,
  farmExtractSeedItemId: null,
  crystalTargetTypes: null,
  bloodlineId: null,
  effects: [IncreaseJutsuSlots.parse({ power: 1 })],
};

describe("IncreaseJutsuSlots", () => {
  it("registers a permanent static self-only integer grant", () => {
    expect(AllTags.parse({ type: "increasejutsuslots" })).toMatchObject({
      power: 1,
      powerPerLevel: 0,
      target: "SELF",
      calculation: "static",
    });
    expect(IncreaseJutsuSlots.safeParse({ power: 2 }).success).toBe(true);
  });
  it("rejects invalid quantities, scaling and combat duration", () => {
    for (const patch of [
      { power: 0 },
      { power: -1 },
      { power: 1.5 },
      { power: 3 },
      { power: Infinity },
      { power: NaN },
      { calculation: "percentage" },
      { powerPerLevel: 1 },
      { rounds: 3 },
      { target: "INHERIT" },
    ]) {
      expect(IncreaseJutsuSlots.safeParse(patch).success).toBe(false);
    }
  });
  it("accepts only an appropriately configured consumable", () => {
    expect(ItemValidator.parse(scroll)).toMatchObject({ effects: scroll.effects });
    for (const patch of [
      { itemType: "ARMOR" },
      { itemType: "MEAL" },
      { preventBattleUsage: false },
      { destroyOnUse: false },
      { target: "CHARACTER" },
      { method: "AOE_CIRCLE" },
    ])
      expect(ItemValidator.safeParse({ ...scroll, ...patch }).success).toBe(false);
    expect(
      z.array(AllTags).superRefine(SuperRefinePassiveEffects).safeParse(scroll.effects)
        .success,
    ).toBe(false);
  });
  it("bounds the combined grant across every tag on one item", () => {
    expect(
      ItemValidator.safeParse({
        ...scroll,
        effects: [
          IncreaseJutsuSlots.parse({ power: 1 }),
          IncreaseJutsuSlots.parse({ power: 1 }),
        ],
      }).success,
    ).toBe(true);
    expect(
      ItemValidator.safeParse({
        ...scroll,
        effects: [
          IncreaseJutsuSlots.parse({ power: 2 }),
          IncreaseJutsuSlots.parse({ power: 1 }),
        ],
      }).success,
    ).toBe(false);
  });
});
