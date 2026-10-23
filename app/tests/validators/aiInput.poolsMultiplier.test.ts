import { describe, expect, it } from "bun:test";
import { maxPoolsMultiplier } from "@/libs/profile";
import { insertAiSchema } from "@/validators/aiInput";

// THENINJARPG-2Z2: the AI editor accepted pool modifiers whose pools overflow the
// smallint unsigned pool columns, so the save failed with a raw database error.
const makeAi = (level: number, poolsMultiplier: number) => ({
  userId: "R9JRTtK3cZubEWUMbEkfL",
  username: "Rust Ferret",
  gender: "Unknown",
  level,
  poolsMultiplier,
  regeneration: 60,
  statsMultiplier: 40,
  strength: 10,
  intelligence: 10,
  willpower: 10,
  speed: 10,
  offence: 10,
  defence: 10,
  ninjutsuMastery: 10,
  genjutsuMastery: 10,
  taijutsuMastery: 10,
  bukijutsuMastery: 10,
  bloodlineMastery: 10,
  sageMastery: 10,
  isSummon: false,
  effects: [],
});

describe("insertAiSchema poolsMultiplier", () => {
  it("accepts the largest multiplier whose pools fit the columns", () => {
    expect(maxPoolsMultiplier(120)).toBe(10);
    expect(insertAiSchema.safeParse(makeAi(120, 10)).success).toBe(true);
  });

  it("explains the limit when the multiplier would overflow the pools", () => {
    const result = insertAiSchema.safeParse(makeAi(120, 15));
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["poolsMultiplier"],
        message:
          "Pool modifier 15 at level 120 would push HP/CP/SP above the maximum of 65,535. Use at most 10 at this level.",
      }),
    ]);
  });
});
