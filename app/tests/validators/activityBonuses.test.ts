import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  AllTags,
  activityBonusPowerLabel,
  activityBonusTypes,
  BloodlineValidator,
  DecreaseCookingTime,
  DecreaseCraftingTime,
  DecreaseFarmingTime,
  DecreaseGatheringTime,
  IncreaseHuntingYield,
  rejectActivityBonuses,
  SkillTreeValidator,
} from "@/validators/combat";
import { RaidDamageThresholdValidator } from "@/validators/objectives";

describe("static activity tag contracts", () => {
  for (const schema of [
    DecreaseGatheringTime,
    DecreaseFarmingTime,
    DecreaseCraftingTime,
    DecreaseCookingTime,
    IncreaseHuntingYield,
  ]) {
    const name = schema.parse({}).type;
    it(`${name} stores exact integer power and self-only static defaults`, () => {
      expect(AllTags.parse({ type: name, power: 10 })).toMatchObject({
        type: name,
        power: 10,
        powerPerLevel: 0,
        calculation: "static",
        target: "SELF",
      });
      expect(schema.safeParse({ power: 0 }).success).toBe(true);
    });
    it(`${name} rejects scaling and combat controls`, () => {
      for (const patch of [
        { power: -1 },
        { power: 0.5 },
        { power: Infinity },
        { power: NaN },
        { power: -Infinity },
        { powerPerLevel: 1 },
        { powerPerLevel: -1 },
        { calculation: "percentage" },
        { target: "INHERIT" },
        { rounds: 1 },
        { rounds: 0 },
        { friendlyFire: "ENEMIES" },
      ]) {
        expect(schema.safeParse(patch).success).toBe(false);
      }
    });
  }
  it("registers the five correct spellings and rejects the obsolete spelling", () => {
    expect(activityBonusTypes).toHaveLength(5);
    expect(AllTags.safeParse({ type: "decreasescraftingtime" }).success).toBe(false);
  });
  it("rejects unsupported passive sources", () => {
    const effects = [DecreaseGatheringTime.parse({})];
    expect(
      z.array(AllTags).superRefine(rejectActivityBonuses).safeParse(effects).success,
    ).toBe(false);
    expect(RaidDamageThresholdValidator.shape.effects.safeParse(effects).success).toBe(
      false,
    );
  });
  it("accepts bloodlines and skills and describes powers in static units", () => {
    const effects = [DecreaseGatheringTime.parse({ power: 10 })];
    expect(
      BloodlineValidator.safeParse({
        name: "Gatherer",
        image: "",
        description: "Gatherer",
        rank: "D",
        regenIncrease: 0,
        villageId: null,
        effects,
      }).success,
    ).toBe(true);
    expect(
      SkillTreeValidator.safeParse({
        name: "Gatherer",
        image: "",
        description: "Gatherer",
        requiredSkillIds: [],
        costSkillPoints: 1,
        tier: 1,
        effects,
      }).success,
    ).toBe(true);
    expect(activityBonusPowerLabel(effects[0]!)).toBe("Reduction (seconds)");
    expect(activityBonusPowerLabel(IncreaseHuntingYield.parse({}))).toBe(
      "Additional quantity per dropped material",
    );
  });
});
