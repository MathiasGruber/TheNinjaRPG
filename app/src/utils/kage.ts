import { hasRequiredRank } from "@/libs/train";
import { KAGE_PRESTIGE_REQUIREMENT, KAGE_RANK_REQUIREMENT } from "@/drizzle/constants";
import type { UserData } from "@/drizzle/schema";
import type { UserWithRelations } from "@/server/api/routers/profile";

/**
 * Checks if a user can challenge the Kage.
 * @param user - The user data.
 * @returns True if the user can challenge the Kage, false otherwise.
 */
export const canChallengeKage = (user: UserData) => {
  if (
    user.villagePrestige >= KAGE_PRESTIGE_REQUIREMENT &&
    hasRequiredRank(user.rank, KAGE_RANK_REQUIREMENT)
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
