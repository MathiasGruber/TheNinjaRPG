import { RankedDivisions } from "@/drizzle/constants";

// Get PvP Rank by LP
export const getPvpRank = (rating: number): string => {
  return (
    RANKED_DIVISIONS
      .slice()
      .reverse()
      .find(rank => rating >= rank.lp)?.name || "Wood"
  );
};
