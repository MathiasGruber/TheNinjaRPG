import { describe, expect, it } from "bun:test";
import { CRAFTING_REQUIRED_EXP } from "@/drizzle/constants";
import {
  formatCraftingRank,
  getCraftingRank,
  getMissingCraftingRank,
} from "@/libs/crafting";

describe("getMissingCraftingRank", () => {
  // Experience of the support-ticket player (Apprentice crafter)
  const apprentice = getCraftingRank(1_175_305);

  it("treats the ticket player as an Apprentice", () => {
    expect(apprentice).toBe("APPRENTICE");
  });

  it.each([
    { rarity: "EPIC", rank: "MASTER" },
    { rarity: "LEGENDARY", rank: "FORGEMASTER" },
  ] as const)("requires $rank for Apprentice $rarity gear", ({ rarity, rank }) => {
    expect(getMissingCraftingRank({ itemType: "ARMOR", rarity }, apprentice)).toBe(
      rank,
    );
    expect(getMissingCraftingRank({ itemType: "WEAPON", rarity }, apprentice)).toBe(
      rank,
    );
  });

  it.each(["COMMON", "RARE"] as const)("allows Apprentice %s gear", (rarity) => {
    expect(getMissingCraftingRank({ itemType: "WEAPON", rarity }, apprentice)).toBe(
      null,
    );
  });

  it("requires Apprentice for Novice rare items", () => {
    expect(
      getMissingCraftingRank({ itemType: "WEAPON", rarity: "RARE" }, "NOVICE"),
    ).toBe("APPRENTICE");
  });

  it("allows Forgemasters to craft every rarity", () => {
    const rank = getCraftingRank(CRAFTING_REQUIRED_EXP.FORGEMASTER);
    for (const rarity of ["COMMON", "RARE", "EPIC", "LEGENDARY"] as const) {
      expect(getMissingCraftingRank({ itemType: "ARMOR", rarity }, rank)).toBe(null);
    }
  });

  it("applies the rarity gate to consumables", () => {
    expect(
      getMissingCraftingRank({ itemType: "CONSUMABLE", rarity: "EPIC" }, apprentice),
    ).toBe("MASTER");
    expect(
      getMissingCraftingRank({ itemType: "CONSUMABLE", rarity: "RARE" }, apprentice),
    ).toBe(null);
  });

  it("never gates meals by crafting rank", () => {
    expect(
      getMissingCraftingRank({ itemType: "MEAL", rarity: "LEGENDARY" }, "NOVICE"),
    ).toBe(null);
  });
});

describe("formatCraftingRank", () => {
  it("formats rank names for display", () => {
    expect(formatCraftingRank("FORGEMASTER")).toBe("Forgemaster");
    expect(formatCraftingRank("UNKNOWN")).toBe("Unknown");
  });
});
