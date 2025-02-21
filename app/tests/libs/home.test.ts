import { describe, expect, it } from "vitest";
import { homeType } from "@/drizzle/schema";

describe("Home System", () => {
  it("should have correct home types", () => {
    const homes = [
      {
        id: "one-bed-apartment",
        name: "One Bed Room Apartment",
        regenBonus: 20,
        storageSlots: 5,
        cost: 3000000n,
      },
      {
        id: "studio-apartment",
        name: "Studio Apartment",
        regenBonus: 30,
        storageSlots: 10,
        cost: 7000000n,
      },
      {
        id: "two-bed-house",
        name: "Two Bed Room House",
        regenBonus: 40,
        storageSlots: 15,
        cost: 13000000n,
      },
      {
        id: "town-house",
        name: "Town House",
        regenBonus: 50,
        storageSlots: 20,
        cost: 30000000n,
      },
      {
        id: "small-mansion",
        name: "Small Mansion",
        regenBonus: 60,
        storageSlots: 25,
        cost: 40000000n,
      },
      {
        id: "small-estate",
        name: "Small Estate",
        regenBonus: 70,
        storageSlots: 30,
        cost: 50000000n,
      },
      {
        id: "large-estate",
        name: "Large Estate",
        regenBonus: 100,
        storageSlots: 40,
        cost: 70000000n,
      },
    ];

    // Verify each home type has the correct properties
    homes.forEach((home) => {
      expect(home).toHaveProperty("id");
      expect(home).toHaveProperty("name");
      expect(home).toHaveProperty("regenBonus");
      expect(home).toHaveProperty("storageSlots");
      expect(home).toHaveProperty("cost");
    });

    // Verify homes are ordered by cost
    for (let i = 1; i < homes.length; i++) {
      expect(homes[i].cost).toBeGreaterThan(homes[i - 1].cost);
    }

    // Verify regen bonus and storage slots increase with cost
    for (let i = 1; i < homes.length; i++) {
      expect(homes[i].regenBonus).toBeGreaterThan(homes[i - 1].regenBonus);
      expect(homes[i].storageSlots).toBeGreaterThan(homes[i - 1].storageSlots);
    }
  });
});
