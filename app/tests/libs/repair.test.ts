import { describe, expect, it } from "bun:test";
import type { UserItemWithRelations } from "@/drizzle/schema";
import { getRepairKits, needsInventoryRepair } from "@/libs/repair";
import { RepairTag } from "@/validators/combat";

describe("furniture repair exclusion", () => {
  it("does not include damaged furniture in bulk repair", () => {
    const row = {
      storedAtHome: false, isInAuction: false, durability: 10,
      item: { itemType: "FURNITURE", maxDurability: 100 },
    };
    expect(needsInventoryRepair(row)).toBe(false);
    expect(needsInventoryRepair({ ...row, item: { ...row.item, itemType: "ARMOR" } })).toBe(true);
  });

  it("does not consume furniture carrying a stale repair effect as a repair kit", () => {
    const row = {
      id: "chair-row", quantity: 1, storedAtHome: false, isInAuction: false,
      craftingFinishedAt: null,
      item: { itemType: "FURNITURE", effects: [RepairTag.parse({ power: 100 })] },
    } as unknown as UserItemWithRelations;
    expect(getRepairKits([row])).toEqual([]);
    expect(getRepairKits([{ ...row, item: { ...row.item, itemType: "CONSUMABLE" } }])).toHaveLength(1);
  });
});
