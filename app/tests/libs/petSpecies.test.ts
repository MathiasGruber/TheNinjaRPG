import { describe, expect, it } from "bun:test";
import { PET_ABILITY_SLOTS_BY_RARITY, PetRarities } from "@/drizzle/constants";
import { ActionEndTurn } from "@/validators/ai";
import { IncreaseStatTag, MoveTag, SummonTag } from "@/validators/combat";
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

  it("accepts supported passive tags but rejects coordinates and external dependencies", () => {
    expect(PetSpeciesValidator.safeParse({ ...species, effects: [IncreaseStatTag.parse({})] }).success).toBe(true);
    for (const effect of [IncreaseStatTag.parse({ target: "COORDINATES" }), MoveTag.parse({}), SummonTag.parse({ aiId: "external-ai" })]) {
      expect(PetSpeciesValidator.safeParse({ ...species, effects: [effect] }).success).toBe(false);
    }
    expect(PetSpeciesValidator.safeParse({ ...species, skillTarget: "ALLIES" }).success).toBe(false);
  });
});
