import { PET_MAX_ABILITY_SLOTS, PET_RANKS, type UserRank } from "@/drizzle/constants";
import type { Jutsu, SkillTree, UserPet } from "@/drizzle/schema";
import type { CombatQueryUserJutsu, CombatQueryUserSkill } from "@/libs/combat/types";
import { getMaxPetRank, getPetLevel } from "@/libs/pets/progression";
import { hasRequiredRank } from "@/libs/train";
import type { ZodAllTags } from "@/validators/combat";

/** Purchased slots share one rank-bounded budget across active and passive abilities. */
export const getPetAbilityCapacity = (pet: Pick<UserPet, "rank">) => ({
  maxSlots: Math.min(PET_MAX_ABILITY_SLOTS, 1 + Math.floor((pet.rank - 1) / 3)),
  budget: pet.rank + 1,
});

export const getPetJutsuCost = (jutsu: Pick<Jutsu, "jutsuRank">) =>
  ({ D: 1, C: 2, B: 3, A: 4, S: 5, H: Number.POSITIVE_INFINITY })[jutsu.jutsuRank];

export const getPetSkillCost = (skill: Pick<SkillTree, "tier">) =>
  Math.max(1, skill.tier);

/** Catalog abilities may affect combatants without introducing new content dependencies. */
const activeEffects = new Set<ZodAllTags["type"]>([
  "damage",
  "heal",
  "shield",
  "increasestat",
  "decreasestat",
  "increasedamagegiven",
  "decreasedamagegiven",
  "increasedamagetaken",
  "decreasedamagetaken",
  "clear",
  "cleanse",
  "move",
]);
const passiveEffects = new Set<ZodAllTags["type"]>([
  "increasestat",
  "increasedamagegiven",
  "decreasedamagetaken",
  "increasemaxpools",
  "increaseaggro",
  "decreaseaggro",
]);
const masteryRequirements = [
  "requiredNinjutsuMastery",
  "requiredGenjutsuMastery",
  "requiredTaijutsuMastery",
  "requiredBukijutsuMastery",
  "requiredBloodlineMastery",
  "requiredSageMastery",
] as const;

/** Pets have no inherited elements, equipment, bloodline, mastery unlocks or content grants. */
export const isPetJutsuAllowed = (jutsu: Jutsu) =>
  !jutsu.hidden &&
  !jutsu.injectableInBattle &&
  jutsu.jutsuType === "NORMAL" &&
  jutsu.jutsuRank !== "H" &&
  !jutsu.bloodlineId &&
  !jutsu.bloodlineReskinId &&
  !jutsu.reskinParentJutsuId &&
  !jutsu.villageId &&
  !jutsu.requiredSkillId &&
  !jutsu.requiredBloodlineItemId &&
  jutsu.jutsuWeapon === "NONE" &&
  (!jutsu.elementClassification || jutsu.elementClassification === "None") &&
  masteryRequirements.every((key) => !jutsu[key]) &&
  [
    jutsu.healthCost,
    jutsu.chakraCost,
    jutsu.staminaCost,
    jutsu.healthCostReducePerLvl,
    jutsu.chakraCostReducePerLvl,
    jutsu.staminaCostReducePerLvl,
    jutsu.range,
    jutsu.cooldown,
  ].every((value) => Number.isFinite(value) && value >= 0) &&
  Number.isFinite(jutsu.actionCostPerc) &&
  jutsu.actionCostPerc >= 10 &&
  jutsu.actionCostPerc <= 100 &&
  jutsu.effects.length > 0 &&
  jutsu.effects.every((effect) => isAllowedEffect(effect, activeEffects));

/** Only standalone, published self passives can be transferred to a companion. */
export const isPetSkillAllowed = (skill: SkillTree) =>
  !skill.hidden &&
  skill.pathType === "SKILL" &&
  skill.skillType === "DEFAULT" &&
  skill.target === "SELF" &&
  !skill.bloodlineId &&
  skill.requiredSkillIds.length === 0 &&
  Number.isInteger(skill.tier) &&
  skill.tier >= 1 &&
  skill.effects.length > 0 &&
  skill.effects.every(
    (effect) =>
      effect.target !== "COORDINATES" && isAllowedEffect(effect, passiveEffects),
  );

/** The caller supplies only learned jutsus and purchased, activated skills belonging to the owner. */
export const validatePetAbilities = ({
  pet,
  owner,
  jutsus,
  skills,
}: {
  pet: PetAbilityLoadout;
  owner: { rank: UserRank };
  jutsus: Jutsu[];
  skills: SkillTree[];
}): string | null => {
  if (
    !Number.isInteger(pet.rank) ||
    pet.rank < 1 ||
    pet.rank > getMaxPetRank(owner.rank)
  )
    return "Your rank does not support this pet's abilities.";
  const { maxSlots, budget } = getPetAbilityCapacity(pet);
  if (!Number.isInteger(pet.abilitySlots) || pet.abilitySlots < 1)
    return "Your pet's ability slots are invalid.";
  if (
    new Set(pet.jutsuIds).size !== pet.jutsuIds.length ||
    new Set(pet.skillIds).size !== pet.skillIds.length
  )
    return "Equip each ability only once.";
  if (pet.jutsuIds.length + pet.skillIds.length > Math.min(pet.abilitySlots, maxSlots))
    return "This loadout exceeds your pet's purchased or rank-limited ability slots.";
  let spent = 0;
  for (const id of pet.jutsuIds) {
    const jutsu = jutsus.find((entry) => entry.id === id);
    if (!jutsu) return "A selected jutsu is no longer learned by your character.";
    if (!isPetJutsuAllowed(jutsu)) return `${jutsu.name} is not compatible with pets.`;
    if (
      !PET_RANKS.some(
        (rank) =>
          rank.rank <= pet.rank &&
          hasRequiredRank(rank.minUserRank, jutsu.requiredRank),
      ) ||
      jutsu.requiredLevel > getPetLevel(pet)
    )
      return `${jutsu.name} requires a higher pet rank or level.`;
    spent += getPetJutsuCost(jutsu);
  }
  for (const id of pet.skillIds) {
    const skill = skills.find((entry) => entry.id === id);
    if (!skill) return "A selected skill is no longer activated by your character.";
    if (!isPetSkillAllowed(skill)) return `${skill.name} is not compatible with pets.`;
    spent += getPetSkillCost(skill);
  }
  return spent > budget
    ? "This loadout exceeds your pet's ability power budget."
    : null;
};

/** Recheck frozen owner content at initiation, retaining valid choices when another became unavailable. */
export const selectPetBattleAbilities = ({
  pet,
  owner,
  jutsus,
  skills,
}: {
  pet: PetAbilityLoadout;
  owner: { rank: UserRank };
  jutsus: CombatQueryUserJutsu[];
  skills: CombatQueryUserSkill[];
}) => {
  const selected = { ...pet, jutsuIds: [] as string[], skillIds: [] as string[] };
  const availableJutsus = jutsus.map((entry) => entry.jutsu);
  const availableSkills = skills
    .filter((entry) => entry.activated)
    .map((entry) => entry.skill);
  for (const id of pet.jutsuIds) {
    const candidate = { ...selected, jutsuIds: [...selected.jutsuIds, id] };
    if (
      !validatePetAbilities({
        pet: candidate,
        owner,
        jutsus: availableJutsus,
        skills: availableSkills,
      })
    )
      selected.jutsuIds.push(id);
  }
  for (const id of pet.skillIds) {
    const candidate = { ...selected, skillIds: [...selected.skillIds, id] };
    if (
      !validatePetAbilities({
        pet: candidate,
        owner,
        jutsus: availableJutsus,
        skills: availableSkills,
      })
    )
      selected.skillIds.push(id);
  }
  return {
    jutsus: selected.jutsuIds.flatMap((id) => {
      const entry = jutsus.find((row) => row.jutsuId === id);
      return entry ? [entry] : [];
    }),
    skills: selected.skillIds.flatMap((id) => {
      const entry = skills.find((row) => row.skillId === id && row.activated);
      return entry ? [entry] : [];
    }),
  };
};

const isAllowedEffect = (effect: ZodAllTags, allowed: Set<ZodAllTags["type"]>) =>
  allowed.has(effect.type) &&
  Number.isFinite(effect.power) &&
  effect.power >= 0 &&
  Number.isFinite(effect.powerPerLevel) &&
  effect.powerPerLevel >= 0 &&
  (effect.calculation !== "percentage" || effect.power <= 100) &&
  (!("elements" in effect) || !effect.elements?.some((element) => element !== "None"));

export type PetAbilityLoadout = Pick<
  UserPet,
  "rank" | "experience" | "abilitySlots" | "jutsuIds" | "skillIds"
>;
