import { describe, expect, it } from "bun:test";
import { MAX_EXTRA_JUTSU_SLOTS } from "@/drizzle/constants";
import type { Item, UserData } from "@/drizzle/schema";
import { nonCombatConsume } from "@/libs/item";
import {
  getJutsuSlotIncreaseError,
  getJutsuSlotIncreaseLimit,
} from "@/libs/jutsuSlots";
import { IncreaseJutsuSlots } from "@/validators/combat";

describe("shared extra jutsu slot capacity", () => {
  it("allows both sources to fill the same two-slot counter", () => {
    expect(getJutsuSlotIncreaseError(0)).toBeNull();
    expect(getJutsuSlotIncreaseError(1)).toBeNull();
    expect(getJutsuSlotIncreaseError(0, MAX_EXTRA_JUTSU_SLOTS)).toBeNull();
    expect(getJutsuSlotIncreaseLimit()).toBe(MAX_EXTRA_JUTSU_SLOTS - 1);
    expect(getJutsuSlotIncreaseLimit(2)).toBe(0);
  });
  it("rejects an already filled counter and grants that cannot fit completely", () => {
    expect(getJutsuSlotIncreaseError(2)).toContain("maximum of 2 extra jutsu slots");
    expect(getJutsuSlotIncreaseError(1, 2)).toContain("would exceed");
  });
  it.each([0, -1, 0.5, Infinity, NaN, MAX_EXTRA_JUTSU_SLOTS + 1])(
    "rejects an invalid grant of %s",
    (amount) => {
      expect(getJutsuSlotIncreaseError(0, amount)).toContain("invalid quantity");
    },
  );
  it("recognizes the consumable even at capacity so the server can explain the rejection", () => {
    const scroll = {
      itemType: "CONSUMABLE",
      effects: [IncreaseJutsuSlots.parse({})],
    } as Item;
    expect(nonCombatConsume(scroll, { extraJutsuSlots: 2 } as UserData)).toBe(true);
    expect(nonCombatConsume({ ...scroll, itemType: "ARMOR" }, {} as UserData)).toBe(
      false,
    );
  });
});
