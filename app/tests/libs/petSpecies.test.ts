import { z } from "zod";
import { describe, expect, it } from "bun:test";
import { PET_ABILITY_SLOTS_BY_RARITY, PetRarities } from "@/drizzle/constants";
import { ActionEndTurn } from "@/validators/ai";
import { AllTags, SuperRefineEffects, SuperRefinePassiveEffects, BarrierTag, IncreaseStatTag, MoveTag, SummonTag } from "@/validators/combat";
import { PetSpeciesValidator } from "@/validators/petSpecies";
import { petAiProfileSchema, updatePetAiSchema } from "@/validators/pets";

const species = { name: "Mist fox", description: "A fox with silver ears.", rarity: "COMMON" as const, isActive: true };

describe("authored companion species contracts", () => {
  it("defaults optional behavior without changing the author's species identity", () => {
    expect(PetSpeciesValidator.parse(species)).toEqual({ ...species, role: "ASSAULT", defaultJutsuIds: [], aiRules: [], includeDefaultRules: true, effects: [], skillTarget: "SELF" });
  });

  it.each([...PetRarities])("bounds default moves by %s rarity and rejects duplicate selections", (rarity) => {
    const defaultJutsuIds = Array.from({ length: PET_ABILITY_SLOTS_BY_RARITY[rarity] }, (_, index) => `pet-jutsu-${index}`);
    expect(PetSpeciesValidator.safeParse({ ...species, rarity, defaultJutsuIds }).success).toBe(true);
    expect(PetSpeciesValidator.safeParse({ ...species, rarity, defaultJutsuIds: [...defaultJutsuIds, "extra"] }).success).toBe(false);
    expect(PetSpeciesValidator.safeParse({ ...species, rarity, defaultJutsuIds: ["same", "same"] }).success).toBe(false);
  });

  it("shares supported AI behavior with owner configuration", () => {
    for (const [action, expected] of [[ActionEndTurn.parse({}), true], [{ type: "use_highest_power_action", effect: "heal", target: "CLOSEST_ALLY" }, true], [{ type: "use_specific_item", itemId: "foreign" }, false], [{ type: "use_highest_power_action", effect: "summon" }, false]] as const) {
      const profile = { rules: [{ conditions: [], action }], includeDefaultRules: false };
      expect(petAiProfileSchema.safeParse(profile).success).toBe(expected);
      expect(PetSpeciesValidator.safeParse({ ...species, aiRules: profile.rules, includeDefaultRules: false }).success).toBe(expected);
      expect(updatePetAiSchema.safeParse({ ...profile, petId: "owned" }).success).toBe(expected);
    }
  });

  it("validates game tags with standard passive targeting and empty-ground requirements", () => {
    const standardEffects = z.array(AllTags).superRefine(SuperRefineEffects).superRefine(SuperRefinePassiveEffects);
    for (const schema of AllTags.options) {
      const effect = schema.parse({});
      expect(PetSpeciesValidator.safeParse({ ...species, effects: [effect] }).success).toBe(standardEffects.safeParse([effect]).success);
    }
    for (const effect of [MoveTag.parse({}), SummonTag.parse({ aiId: "external-ai" }), IncreaseStatTag.parse({ elements: ["Fire"], power: 150 })]) {
      expect(PetSpeciesValidator.safeParse({ ...species, effects: [effect] }).success).toBe(true);
    }
    expect(PetSpeciesValidator.safeParse({ ...species, effects: [IncreaseStatTag.parse({ target: "COORDINATES" })] }).success).toBe(false);
    expect(PetSpeciesValidator.safeParse({ ...species, skillTarget: "ALLIES" }).success).toBe(false);
  });

  it.each(["SELF", "ENEMIES"] as const)("rejects barriers that cannot target empty ground in %s species skills", (skillTarget) => {
    const parsed = PetSpeciesValidator.safeParse({ ...species, skillTarget,
      effects: [BarrierTag.parse({ staticAssetPath: "barrier" })],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues).toContainEqual(expect.objectContaining({
      path: ["effects", 0, "type"],
      message: "Barrier tags require an empty-ground combat action.",
    }));
  });
});
