import { hasRequiredRank } from "@/libs/train";
import type { UserData } from "@/drizzle/schema";

export const PRESTIGE_REQUIREMENT = 5; // Should be 30
export const RANK_REQUIREMENT = "JONIN";
export const PRESTIGE_COST = 1; // Should be 5

export const canChallengeKage = (user: UserData) => {
  if (
    user.villagePrestige >= PRESTIGE_REQUIREMENT &&
    hasRequiredRank(user.rank, RANK_REQUIREMENT)
  ) {
    return true;
  }
  return false;
};
