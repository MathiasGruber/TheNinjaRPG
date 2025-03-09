import { RankedDivisions } from "@/drizzle/constants";
import { eq, gte, desc } from "drizzle-orm";
import { drizzle } from "@/server/db"; // Ensure correct import
import { userData } from "@/drizzle/schema"; // Correct schema reference

export const getPvpRank = async (userId: string, rankedLp: number): Promise<string> => {
  // Fetch top 10 players with rankedLp >= 900
  const topSannins = await drizzle
    .select({ userId: userData.userId }) // Use correct schema reference
    .from(userData)
    .where(gte(userData.rankedLp, 900)) // Get users with 900+ LP
    .orderBy(desc(userData.rankedLp)) // Order by highest LP
    .limit(10); // Only top 10 players

  // Check if the user is in the top 10
  const isTopSannin = topSannins.some(player => player.userId === userId);

  if (isTopSannin) return "Sannin"; // Only top 10 get Sannin
  if (rankedLp >= 900) return "Legend"; // Others default to Legend

  // Find the highest rank the user qualifies for
  return (
    RankedDivisions
      .slice()
      .reverse()
      .find(rank => rankedLp >= rank.rankedLp)?.name || "Wood"
  );
};
