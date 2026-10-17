import { describe, expect, it } from "bun:test";
import type { Jutsu, SkillTree } from "@/drizzle/schema";
import {
  getPetAbilityCapacity, getPetJutsuCost, getPetSkillCost, isPetJutsuAllowed,
  isPetSkillAllowed, selectPetBattleAbilities, validatePetAbilities,
  type PetAbilityLoadout,
} from "@/libs/pets/abilities";
import { DamageTag, SummonTag } from "@/validators/combat";
import { ownedPetSkill, petJutsuFixture, petSkillFixture } from "./helpers/abilities";

const pet = (patch: Partial<PetAbilityLoadout> = {}): PetAbilityLoadout => ({
  rank: 4, experience: 100000, abilitySlots: 2,
  jutsuIds: ["pet-strike"], skillIds: ["pet-muscle"], ...patch,
});
const validate = (patch: Partial<PetAbilityLoadout> = {},
  jutsus = [petJutsuFixture()], skills = [petSkillFixture()]) =>
  validatePetAbilities({ pet: pet(patch), owner: { rank: "ELDER" }, jutsus, skills });

describe("pet ability eligibility and shared power budget", () => {
  it("unlocks rank capacity gradually while counting paid slots separately", () => {
    expect([1, 3, 4, 6, 7, 9, 10].map((rank) => getPetAbilityCapacity({ rank }).maxSlots))
      .toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect(validate()).toBeNull();
    expect(validate({ abilitySlots: 1 })).toContain("slots");
    expect(validate({ rank: 1, abilitySlots: 4 })).toContain("slots");
  });

  it("shares the rarity/tier budget between jutsus and skills", () => {
    expect(getPetJutsuCost({ jutsuRank: "S" })).toBe(5);
    expect(getPetJutsuCost({ jutsuRank: "H" })).toBe(Number.POSITIVE_INFINITY);
    expect(getPetSkillCost({ tier: 3 })).toBe(3);
    expect(validate({}, [petJutsuFixture({ jutsuRank: "S" })], [petSkillFixture()]))
      .toContain("power budget");
    expect(validate({}, [petJutsuFixture({ jutsuRank: "A" })], [petSkillFixture()]))
      .toBeNull();
  });

  it("rechecks published/active choices and rejects duplicate selections", () => {
    expect(validate({}, [], [petSkillFixture()])).toContain("no longer available");
    expect(validate({}, [petJutsuFixture()], [])).toContain("no longer activated");
    expect(validate({ jutsuIds: ["pet-strike", "pet-strike"], skillIds: [] })).toContain("only once");
  });

  it("checks the pet's own level and rank instead of borrowing the owner's", () => {
    expect(validate({ rank: 1, experience: 0, skillIds: [] }, [petJutsuFixture({ requiredRank: "GENIN" })]))
      .toContain("higher pet rank or level");
    expect(validate({ rank: 1, experience: 0, skillIds: [] }, [petJutsuFixture({ requiredLevel: 2 })]))
      .toContain("higher pet rank or level");
    expect(validatePetAbilities({ pet: pet(), owner: { rank: "STUDENT" }, jutsus: [], skills: [] }))
      .toContain("Your rank");
  });

  it("retains elite jutsu eligibility when the pet evolves from rank nine to ten", () => {
    const jutsu = petJutsuFixture({ requiredRank: "ELITE JONIN" });
    expect(validate({ rank: 9, skillIds: [] }, [jutsu], [])).toBeNull();
    expect(validate({ rank: 10, skillIds: [] }, [jutsu], [])).toBeNull();
  });

  it.each([
    { hidden: true }, { injectableInBattle: true }, { jutsuType: "EVENT" }, { jutsuType: "NORMAL" },
    { jutsuRank: "H" }, { bloodlineId: "line" }, { villageId: "village" },
    { requiredSkillId: "skill" }, { requiredBloodlineItemId: "item" },
    { requiredTaijutsuMastery: 1 }, { jutsuWeapon: "SWORD" },
    { elementClassification: "Fire" }, { chakraCost: -1 }, { actionCostPerc: 0 },
    { effects: [SummonTag.parse({ aiId: "not-preloaded" })] },
    { effects: [DamageTag.parse({ calculation: "percentage", power: 101 })] },
    { effects: [DamageTag.parse({ elements: ["Fire"] })] },
  ] satisfies Partial<Jutsu>[])("rejects content dependencies or invalid jutsu mechanics: %j", (patch) => {
    expect(isPetJutsuAllowed(petJutsuFixture(patch))).toBe(false);
  });

  it.each([
    { hidden: true }, { target: "ALLIES" }, { target: "ENEMIES" },
    { skillType: "SPECIAL" }, { pathType: "BLOODRIGHT" }, { bloodlineId: "line" },
    { requiredSkillIds: ["prerequisite"] },
    { effects: [SummonTag.parse({ aiId: "not-preloaded" })] },
  ] satisfies Partial<SkillTree>[])("rejects non-standalone or non-self passive skills: %j", (patch) => {
    expect(isPetSkillAllowed(petSkillFixture(patch))).toBe(false);
  });

  it("drops unavailable choices independently at battle initiation", () => {
    const selected = selectPetBattleAbilities({
      pet: pet({ jutsuIds: ["forgotten", "pet-strike"], skillIds: ["pet-muscle"] }),
      owner: { rank: "ELDER" }, jutsus: [petJutsuFixture()], skills: [ownedPetSkill()],
    });
    expect(selected.jutsus.map((entry) => entry.id)).toEqual(["pet-strike"]);
    expect(selected.skills.map((entry) => entry.skillId)).toEqual(["pet-muscle"]);
    expect(selectPetBattleAbilities({ pet: pet(), owner: { rank: "ELDER" },
      jutsus: [], skills: [{ ...ownedPetSkill(), activated: false }] }))
      .toEqual({ jutsus: [], skills: [] });
  });
});
