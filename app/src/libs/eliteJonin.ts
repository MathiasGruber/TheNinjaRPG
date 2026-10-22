import {
  getUserCaps,
  MAX_EXPERIENCE_LEVEL,
  MAX_PLAYER_LEVEL,
} from "@/drizzle/constants";
import type { UserData } from "@/drizzle/schema";
import { calcCP, calcEnergy, calcHP, calcSP } from "@/libs/profile";

/** Return the blocking reason, or null for the next earned Elite level; XP never qualifies. */
export const eliteJoninMilestoneBlockMessage = (
  user: Pick<UserData, "rank" | "level">,
  targetLevel: number,
): string | null => {
  if (user.rank !== "ELITE JONIN") return "Milestones require Elite Jonin rank.";
  if (
    !Number.isInteger(targetLevel) ||
    targetLevel <= MAX_EXPERIENCE_LEVEL ||
    targetLevel > MAX_PLAYER_LEVEL
  )
    return "Invalid Elite Jonin milestone level.";
  if (user.level !== targetLevel - 1)
    return `This milestone requires level ${targetLevel - 1}.`;
  return null;
};

/**
 * Build fixed combat-stat gains and normal pool growth without granting skill points.
 * The caller validates eligibility and commits this patch with its guarded account claim.
 */
export const eliteJoninMilestoneUpdate = (
  user: Pick<
    UserData,
    "offence" | "defence" | "strength" | "speed" | "intelligence" | "willpower"
  >,
  targetLevel: number,
  statGain: number,
) => {
  const caps = getUserCaps("ELITE JONIN");
  // A milestone must not reduce an existing stored stat that is already above its cap.
  const gain = (value: number, cap: number) =>
    Math.max(value, Math.min(value + statGain, cap));
  return {
    level: targetLevel,
    maxHealth: calcHP(targetLevel),
    maxChakra: calcCP(targetLevel),
    maxStamina: calcSP(targetLevel),
    maxEnergy: calcEnergy(targetLevel),
    offence: gain(user.offence, caps.stats_cap),
    defence: gain(user.defence, caps.stats_cap),
    strength: gain(user.strength, caps.gens_cap),
    speed: gain(user.speed, caps.gens_cap),
    intelligence: gain(user.intelligence, caps.gens_cap),
    willpower: gain(user.willpower, caps.gens_cap),
  };
};
