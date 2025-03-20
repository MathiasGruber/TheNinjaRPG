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
  console.log("Current queue:", queue.map(q => ({ userId: q.userId, lp: q.rankedLp })));
  
  if (queue.length < 2) {
    console.log("Not enough players in queue:", queue.length);
    return null;
  }

  // Sort queue by queue time (oldest first)
  queue.sort((a, b) => a.queueStartTime.getTime() - b.queueStartTime.getTime());
  console.log("Sorted queue by time:", queue.map(q => ({ userId: q.userId, time: q.queueStartTime })));

  // Get the player who has been waiting the longest
  const oldestPlayer = queue[0];
  if (!oldestPlayer) {
    console.log("No players in queue");
    return null;
  }

  const now = new Date();
  const oldestPlayerQueueTime = (now.getTime() - oldestPlayer.queueStartTime.getTime()) / (1000 * 60);
  const oldestPlayerRange = 100 + (Math.floor(oldestPlayerQueueTime / 3) * 50);
  
  console.log("Oldest player:", {
    userId: oldestPlayer.userId,
    lp: oldestPlayer.rankedLp,
    queueTime: oldestPlayerQueueTime,
    range: oldestPlayerRange
  });

  // Find potential matches for the oldest player
  const potentialMatches = queue.filter(player => {
    if (player.userId === oldestPlayer.userId) return false;
    
    const playerQueueTime = (now.getTime() - player.queueStartTime.getTime()) / (1000 * 60);
    const playerRange = 100 + (Math.floor(playerQueueTime / 3) * 50);
    const lpDiff = Math.abs(player.rankedLp - oldestPlayer.rankedLp);
    
    console.log("Checking match:", {
      player: { userId: player.userId, lp: player.rankedLp, range: playerRange },
      oldestPlayer: { userId: oldestPlayer.userId, lp: oldestPlayer.rankedLp, range: oldestPlayerRange },
      lpDiff
    });

    return lpDiff <= oldestPlayerRange && lpDiff <= playerRange;
  });

  if (potentialMatches.length > 0) {
    // Get the closest LP match
    const opponent = potentialMatches.reduce((closest, current) => {
      const closestDiff = Math.abs(closest.rankedLp - oldestPlayer.rankedLp);
      const currentDiff = Math.abs(current.rankedLp - oldestPlayer.rankedLp);
      return currentDiff < closestDiff ? current : closest;
    });

    console.log("Match found! Creating battle between:", {
      player1: { userId: oldestPlayer.userId, lp: oldestPlayer.rankedLp },
      player2: { userId: opponent.userId, lp: opponent.rankedLp }
    });
    
    try {
      // First, initiate the battle
      const result = await initiateBattle(
        {
          client,
          userIds: [oldestPlayer.userId, opponent.userId],
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

      // Update user status first
      await client
        .update(userData)
        .set({ status: "BATTLE" })
        .where(
          or(
            eq(userData.userId, oldestPlayer.userId),
            eq(userData.userId, opponent.userId),
          ),
        );

      // Then remove from queue
      await client.delete(rankedPvpQueue).where(eq(rankedPvpQueue.id, oldestPlayer.id));
      await client.delete(rankedPvpQueue).where(eq(rankedPvpQueue.id, opponent.id));

      return result.battleId;
    } catch (error) {
      console.error("Error during battle creation:", error);
      return null;
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

  queueForRankedPvp: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .output(baseServerResponse.extend({ battleId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is already in queue
      const existingQueue = await ctx.drizzle
        .select()
        .from(rankedPvpQueue)
        .where(eq(rankedPvpQueue.userId, input.userId));

      if (existingQueue.length > 0) {
        return {
          success: false,
          message: "Already in queue",
        };
      }

      // Check if user is already in a battle
      const userState = await ctx.drizzle
        .select()
        .from(userData)
        .where(eq(userData.userId, input.userId));

      if (userState[0]?.status === "BATTLE") {
        return {
          success: false,
          message: "Already in a battle",
        };
      }

      // Add user to queue
      await ctx.drizzle.insert(rankedPvpQueue).values({
        id: nanoid(),
        userId: input.userId,
        rankedLp: userState[0]?.rankedLp ?? 0,
        queueStartTime: new Date(),
      });

      // Set user status to QUEUED
      await ctx.drizzle
        .update(userData)
        .set({ status: "QUEUED" })
        .where(eq(userData.userId, input.userId));

      return {
        success: true,
        message: "Queued for ranked PvP",
      };
    }),

  getRankedPvpQueue: protectedProcedure
    .query(async ({ ctx }) => {
      const queueEntry = await ctx.drizzle.query.rankedPvpQueue.findFirst({
        where: eq(rankedPvpQueue.userId, ctx.userId),
      });
      return { inQueue: !!queueEntry };
    }),

  leaveRankedPvpQueue: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      // Remove from queue
      await ctx.drizzle
        .delete(rankedPvpQueue)
        .where(eq(rankedPvpQueue.userId, ctx.userId));

      // Update user status
      await ctx.drizzle
        .update(userData)
        .set({ status: "AWAKE" })
        .where(eq(userData.userId, ctx.userId));

      return { success: true, message: "Left ranked PvP queue" };
    }),
});
