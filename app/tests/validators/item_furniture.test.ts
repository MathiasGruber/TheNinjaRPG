import { describe, expect, it } from "bun:test";
import { ItemValidator } from "@/validators/combat";
import { FURNITURE_ITEM_DEFAULTS, furnitureItemSchema, itemCreateSchema } from "@/validators/item";

const furniture = {
  ...FURNITURE_ITEM_DEFAULTS,
  itemType: "FURNITURE",
  name: "Painted tea cabinet",
  image: "/images/home/furniture/table.webp",
  description: "A cabinet for the residence.",
  rarity: "COMMON",
  hidden: false,
  inShop: false,
  cost: 0,
  repsCost: 0,
  seichiSilverCost: 0,
  expireFromStoreAt: null,
  farmYieldItemId: null,
  farmExtractSeedItemId: null,
};

describe("furniture item content", () => {
  it("creates furniture through the standard item type input", () => {
    expect(itemCreateSchema.parse({ type: "FURNITURE" })).toEqual({ type: "FURNITURE" });
  });

  it("permits free provided furniture and requires a price when offered in the shop", () => {
    expect(ItemValidator.safeParse(furniture).success).toBe(true);
    const forSale = ItemValidator.safeParse({ ...furniture, inShop: true });
    expect(forSale.success).toBe(false);
    if (!forSale.success) expect(forSale.error.issues).toContainEqual(
      expect.objectContaining({ path: ["cost"] }),
    );
    for (const currency of ["cost", "repsCost", "seichiSilverCost"]) {
      expect(ItemValidator.safeParse({ ...furniture, inShop: true, [currency]: 50 }).success).toBe(true);
    }
  });

  it.each([
    { effects: [{ type: "increasemastery", masteryTypes: ["Ninjutsu"], calculation: "static", power: 10, powerPerLevel: 0 }] },
    { slot: "ITEM" },
    { maxEquips: 1 },
    { preventBattleUsage: false },
    { canBeImbued: true },
    { maxImbueNumber: 1 },
    { maxDurability: 100 },
    { canStack: true },
    { stackSize: 2 },
    { chakraCost: 1 },
    { isFarmSeed: true, farmGrowTimeSeconds: 30 },
    { parentItemId: "weapon-parent" },
  ])("rejects gameplay configuration %j", (patch) => {
    expect(ItemValidator.safeParse({ ...furniture, ...patch }).success).toBe(false);
  });

  it("keeps zero-cost and zero-durability exceptions limited to furniture", () => {
    expect(ItemValidator.safeParse({ ...furniture, itemType: "MATERIAL" }).success).toBe(false);
  });

  it.each([
    { farmExtractSeedItemId: "rice-seed" },
    { farmExtractSeedCount: 5 },
    { farmExtractSeedItemId: "rice-seed", farmExtractSeedCount: 5 },
  ])("rejects seed extraction configuration %j", (patch) => {
    const parsed = ItemValidator.safeParse({ ...furniture, ...patch });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      for (const field of Object.keys(patch)) {
        expect(parsed.error.issues).toContainEqual(expect.objectContaining({ path: [field] }));
      }
    }
  });

  it("validates scene bounds and optional supported home actions", () => {
    expect(furnitureItemSchema.parse({ furnitureAction: "" })).toEqual({
      furnitureAction: null, furnitureWidth: 24, furnitureGroundAnchor: 100, furnitureIsFloor: false,
    });
    expect(furnitureItemSchema.safeParse({ furnitureAction: "storage", furnitureWidth: 6, furnitureGroundAnchor: 1 }).success).toBe(true);
    expect(furnitureItemSchema.safeParse({ furnitureWidth: 40, furnitureGroundAnchor: 100 }).success).toBe(true);
    expect(furnitureItemSchema.parse({ furnitureIsFloor: true }).furnitureIsFloor).toBe(true);
    for (const patch of [
      { furnitureWidth: 5 }, { furnitureWidth: 41 },
      { furnitureGroundAnchor: 0 }, { furnitureGroundAnchor: 101 },
      { furnitureAction: "awardRyo" },
    ]) expect(furnitureItemSchema.safeParse(patch).success).toBe(false);
  });
});
