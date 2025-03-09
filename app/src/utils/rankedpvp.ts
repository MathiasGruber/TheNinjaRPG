import { RankedDivisions } from "@/drizzle/constants";
import { eq, gte, desc } from "drizzle-orm";
import { db } from "@/drizzle/db"; // Import your database connection
import { UserData } from "@/drizzle/schema"; // Ensure correct schema import

export const getPvpRank = async (drizzle: typeof db, userId: string, rankedLp: number): Promise<string> => {
  // Fetch top 10 players with rankedLp >= 900 using Drizzle ORM
  const topSannins = await drizzle
    .select({ userId: UserData.userId })
    .from(UserData)
    .where(gte(UserData.rankedLp, 900)) // Get users with 900+ LP
    .orderBy(desc(UserData.rankedLp)) // Order by highest LP
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
