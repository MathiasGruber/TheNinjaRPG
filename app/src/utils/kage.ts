import { hasRequiredRank } from "@/libs/train";
import type { UserData } from "@/drizzle/schema";
import type { UserWithRelations } from "@/server/api/routers/profile";

export const KAGE_PRESTIGE_REQUIREMENT = 4000;
export const RANK_REQUIREMENT = "JONIN";
export const KAGE_PRESTIGE_COST = 1000;
export const FRIENDLY_PRESTIGE_COST = 10000;
export const WAR_FUNDS_COST = 100;

/**
 * Checks if a user can challenge the Kage.
 * @param user - The user data.
 * @returns True if the user can challenge the Kage, false otherwise.
 */
export const canChallengeKage = (user: UserData) => {
  if (
    user.villagePrestige >= KAGE_PRESTIGE_REQUIREMENT &&
    hasRequiredRank(user.rank, RANK_REQUIREMENT)
  ) {
    return true;
  }
  return false;
};

/**
 * Checks if a user is the Kage of their village.
 * @param user - The user object.
 * @returns True if the user is the Kage of their village, false otherwise.
 */
export const isKage = (user: NonNullable<UserWithRelations>) => {
  return user?.village && user.userId === user.village?.kageId;
};
