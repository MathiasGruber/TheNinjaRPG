import { RankedDivisions } from "@/drizzle/constants";
import { gte, desc } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userData } from "@/drizzle/schema";

export const getPvpRank = async (
  userId: string,
  rankedLp: number
): Promise<string> => {
  try {
    const topSannins = await drizzleDB
      .select({ userId: userData.userId })
      .from(userData)
      .where(gte(userData.rankedLp, 900))
      .orderBy(desc(userData.rankedLp))
      .limit(10);

    // Check if the user is in the top 10
    const isTopSannin = topSannins.some(player => player.userId === userId);

    if (isTopSannin) return "Sannin"; // Only top 10 get Sannin
    if (rankedLp >= 900) return "Legend"; // Others default to Legend

    // Find the highest rank the user qualifies for
    return (
      RankedDivisions.slice()
        .reverse()
        .find(rank => rankedLp >= rank.rankedLp)?.name || "Wood"
    );
  } catch (error) {
    console.error("Error fetching PvP rank:", error);
    return "Wood"; // Default to lowest rank if an error occurs
  }
};
