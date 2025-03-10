import { createTRPCRouter, publicProcedure } from "@/api/trpc";
import { drizzleDB } from "@/server/db";
import { RankedDivisions } from "@/drizzle/constants";
import { userData } from "@/drizzle/schema";
import { eq, gte, desc } from "drizzle-orm";
import { z } from "zod";

export const rankedpvpRouter = createTRPCRouter({
  getPvpRank: publicProcedure
    .input(z.object({ userId: z.string(), rankedLp: z.number() }))
    .query(async ({ input }) => {
      const { userId, rankedLp } = input;

      // Fetch top 10 players with rankedLp >= 900
      const topSannins = await drizzleDB
        .select({ userId: userData.userId })
        .from(userData)
        .where(gte(userData.rankedLp, 900))
        .orderBy(desc(userData.rankedLp))
        .limit(10);

      // Check if the user is in the top 10
      const isTopSannin = topSannins.some(player => player.userId === userId);

      if (isTopSannin) return "Sannin";
      if (rankedLp >= 900) return "Legend";

      return (
        RankedDivisions
          .slice()
          .reverse()
          .find(rank => rankedLp >= rank.rankedLp)?.name || "Wood"
      );
    }),
});
