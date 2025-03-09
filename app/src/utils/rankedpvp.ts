import { RankedDivisions } from "@/drizzle/constants";

// Get PvP Rank by LP
export const getPvpRank = (rating: number): string => {
  return (
    RankedDivisions
      .slice()
      .reverse()
      .find(rank => rating >= rank.lp)?.name || "Wood"
  );
};
