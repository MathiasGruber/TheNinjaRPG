import { RankedDivisions } from "@/drizzle/constants";
import { userData } from "@/drizzle/schema.ts"; // Import database connection

export const getPvpRank = async (userId: number, rankedLp: number): Promise<string> => {
  // Fetch top 10 players with rankedLp >= 900
  const topSannins = await db.query(
    `SELECT id FROM UserData WHERE rankedLp >= 900 ORDER BY rankedLp DESC LIMIT 10;`
  );

  // Check if the user is in the top 10
  const isTopSannin = topSannins.some(player => player.id === userId);

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
