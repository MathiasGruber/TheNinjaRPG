import type { BattleUserState, UserEffect } from "./types";

export const getHealingModifiers = (
  effect: UserEffect,
  origin: BattleUserState | undefined,
  target: BattleUserState,
) => {
  let healingGivenModifier = 1;

  // Get skill tree effects for both users
  const originSkillTree = origin?.skillTree?.selectedSkills ?? [];

  // Calculate healing given modifier for origin
  if (origin) {
    for (const skill of originSkillTree) {
      if (skill.type === "HEALING") {
        healingGivenModifier *= 1 + skill.boost / 100;
      }
    }
  }

  return healingGivenModifier;
};
