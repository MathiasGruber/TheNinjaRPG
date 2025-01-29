import type { BattleUserState, UserEffect } from "./types";

export const getSkillTreeModifiers = (
  effect: UserEffect,
  origin: BattleUserState | undefined,
  target: BattleUserState,
) => {
  let damageGivenModifier = 1;
  let damageTakenModifier = 1;

  // Get skill tree effects for both users
  const originSkillTree = origin?.skillTree?.selectedSkills ?? [];
  const targetSkillTree = target?.skillTree?.selectedSkills ?? [];

  // Calculate damage given modifier for origin
  if (origin) {
    for (const skill of originSkillTree) {
      if (skill.type === "NINJUTSU_DAMAGE" && effect.statTypes?.includes("Ninjutsu")) {
        damageGivenModifier *= 1 + skill.boost / 100;
      } else if (skill.type === "TAIJUTSU_DAMAGE" && effect.statTypes?.includes("Taijutsu")) {
        damageGivenModifier *= 1 + skill.boost / 100;
      } else if (skill.type === "BUKIJUTSU_DAMAGE" && effect.statTypes?.includes("Bukijutsu")) {
        damageGivenModifier *= 1 + skill.boost / 100;
      } else if (skill.type === "GENJUTSU_DAMAGE" && effect.statTypes?.includes("Genjutsu")) {
        damageGivenModifier *= 1 + skill.boost / 100;
      } else if (skill.type === "ELEMENTAL_DAMAGE" && effect.elements?.length) {
        damageGivenModifier *= 1 + skill.boost / 100;
      }
    }
  }

  // Calculate damage taken modifier for target
  for (const skill of targetSkillTree) {
    if (skill.type === "ALL_DEFENSE") {
      damageTakenModifier *= 1 - skill.boost / 100;
    } else if (skill.type === "ELEMENTAL_DEFENSE" && effect.elements?.length) {
      damageTakenModifier *= 1 - skill.boost / 100;
    } else if (skill.type === "ABSORB") {
      damageTakenModifier *= 1 - skill.boost / 100;
    } else if (skill.type === "REFLECT") {
      // Reflect is handled separately in the reflect tag
      continue;
    }
  }

  return {
    damageGivenModifier,
    damageTakenModifier,
  };
};
