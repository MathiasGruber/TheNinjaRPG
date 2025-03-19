import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/api/trpc";
import { drizzleDB } from "@/server/db";
import { RankedDivisions } from "@/drizzle/constants";
import { userData, rankedPvpQueue } from "@/drizzle/schema";
import { eq, gte, desc, ne, lt, or } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { calculateLPChange } from "@/libs/combat/ranked";
import { sql } from "drizzle-orm";
import type { DrizzleClient } from "@/server/db";
import { initiateBattle } from "@/server/api/routers/combat";
import { baseServerResponse } from "@/api/trpc";

// K-factor adjustments based on LP
const K_FACTOR_BASE = 32;
const STREAK_BONUS = 2;

async function checkRankedPvpMatches(client: DrizzleClient): Promise<string | null> {
  const queue = await client.select().from(rankedPvpQueue);
  console.log("Current queue:", queue);
  
  if (queue.length < 2) {
    console.log("Not enough players in queue:", queue.length);
    return null;
  }

  // Sort queue by LP to find closest matches
  queue.sort((a, b) => a.rankedLp - b.rankedLp);
  console.log("Sorted queue by LP:", queue);

  for (let i = 0; i < queue.length - 1; i++) {
    const player1 = queue[i];
    const player2 = queue[i + 1];

    // Skip if either player is undefined
    if (!player1 || !player2) continue;

    // Calculate queue time in minutes for both players
    const now = new Date();
    const player1QueueTime = (now.getTime() - player1.queueStartTime.getTime()) / (1000 * 60);
    const player2QueueTime = (now.getTime() - player2.queueStartTime.getTime()) / (1000 * 60);

    // Calculate allowed LP range based on queue time (50 LP per 3 minutes)
    const player1Range = 100 + (Math.floor(player1QueueTime / 3) * 50);
    const player2Range = 100 + (Math.floor(player2QueueTime / 3) * 50);

    // Check if players are within each other's range
    const lpDiff = Math.abs(player1.rankedLp - player2.rankedLp);
    console.log("Checking match:", {
      player1: { id: player1.userId, lp: player1.rankedLp, range: player1Range },
      player2: { id: player2.userId, lp: player2.rankedLp, range: player2Range },
      lpDiff
    });

    if (lpDiff <= player1Range && lpDiff <= player2Range) {
      console.log("Match found! Creating battle...");
      
      // First, initiate the battle
      const result = await initiateBattle(
        {
          client,
          userIds: [player1.userId, player2.userId],
          targetIds: [],
          asset: "arena",
          scaleTarget: false,
          statDistribution: {
            strength: 200000,
            intelligence: 200000,
            willpower: 200000,
            speed: 200000,
            ninjutsuOffence: 450000,
            ninjutsuDefence: 450000,
            genjutsuOffence: 450000,
            genjutsuDefence: 450000,
            taijutsuOffence: 450000,
            taijutsuDefence: 450000,
            bukijutsuOffence: 450000,
            bukijutsuDefence: 450000,
          },
        },
        "RANKED",
        1,
      );

      if (!result.battleId) {
        console.error("Failed to create battle");
        return null;
      }

      console.log("Battle created successfully:", result.battleId);

      // Only after battle is created successfully, update user status and remove from queue
      await Promise.all([
        client.delete(rankedPvpQueue).where(eq(rankedPvpQueue.id, player1.id)),
        client.delete(rankedPvpQueue).where(eq(rankedPvpQueue.id, player2.id)),
        client
          .update(userData)
          .set({ status: "BATTLE" })
          .where(
            or(
              eq(userData.userId, player1.userId),
              eq(userData.userId, player2.userId),
            ),
          ),
      ]);

      return result.battleId;
    }
  }
  console.log("No matches found in queue");
  return null;
}

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

  getQueueStatus: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .output(z.object({
      inQueue: z.boolean(),
      queueStartTime: z.date().optional(),
      timeInQueue: z.number().optional(),
      secondsInQueue: z.number().optional(),
      lpRange: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const queueEntry = await ctx.drizzle.query.rankedPvpQueue.findFirst({
        where: eq(rankedPvpQueue.userId, input.userId),
      });

      if (!queueEntry) {
        return {
          inQueue: false,
        };
      }

      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - queueEntry.queueStartTime.getTime()) / 1000);
      const minutes = Math.floor(diffInSeconds / 60);
      const seconds = diffInSeconds % 60;
      const lpRange = 100 + (Math.floor(minutes / 3) * 50);

      return {
        inQueue: true,
        queueStartTime: queueEntry.queueStartTime,
        timeInQueue: minutes,
        secondsInQueue: seconds,
        lpRange,
      };
    }),

  checkMatches: protectedProcedure
    .output(baseServerResponse.extend({ battleId: z.string().optional() }))
    .mutation(async ({ ctx }) => {
      const battleId = await checkRankedPvpMatches(ctx.drizzle);
      return { 
        success: true, 
        message: battleId ? "Match found!" : "No matches found.",
        battleId: battleId ?? undefined
      };
    }),
});
