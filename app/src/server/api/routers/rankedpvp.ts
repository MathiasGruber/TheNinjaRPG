import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/api/trpc";
import { drizzleDB } from "@/server/db";
import { RankedDivisions } from "@/drizzle/constants";
import { userData, rankedPvpQueue } from "@/drizzle/schema";
import { eq, gte, desc, or } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { DrizzleClient } from "@/server/db";
import { initiateBattle } from "@/server/api/routers/combat";
import { baseServerResponse } from "@/api/trpc";

// Define types for queue entries
type QueueEntry = {
  id: string;
  userId: string;
  rankedLp: number;
  queueStartTime: Date;
  createdAt: Date;
};

// Server-side interval to check for matches
let matchCheckInterval: ReturnType<typeof setInterval> | null = null;

function startMatchCheckInterval() {
  if (matchCheckInterval) {
    console.log("[RankedPvP] Match check interval already running");
    return;
  }
  
  console.log("[RankedPvP] Starting match check interval");
  matchCheckInterval = setInterval(() => {
    // Wrap the async call in a regular function
    void (async () => {
      try {
        console.log("[RankedPvP] Running scheduled match check");
        const battleId = await checkRankedPvpMatches(drizzleDB);
        if (battleId) {
          console.log("[RankedPvP] Match found in interval:", battleId);
        }
      } catch (error) {
        console.error('[RankedPvP] Error checking ranked PvP matches:', error);
      }
    })();
  }, 1000); // Check every second
}

// Start the interval when the server starts
startMatchCheckInterval();

async function checkRankedPvpMatches(client: DrizzleClient): Promise<string | null> {
  // Use the same query method as queueForRankedPvp
  const queue = await client
    .select()
    .from(rankedPvpQueue);
    
  console.log("[RankedPvP] Raw queue query:", JSON.stringify(queue, null, 2));
  
  if (queue.length < 2) {
    console.log("[RankedPvP] Not enough players in queue:", queue.length);
    return null;
  }

  // Sort queue by queue time (oldest first)
  queue.sort((a: QueueEntry, b: QueueEntry) => a.queueStartTime.getTime() - b.queueStartTime.getTime());
  
  // Get the player who has been waiting the longest
  const oldestPlayer = queue[0];
  if (!oldestPlayer) {
    console.log("[RankedPvP] No players in queue");
    return null;
  }

  const now = new Date();
  const oldestPlayerQueueTime = (now.getTime() - oldestPlayer.queueStartTime.getTime()) / (1000 * 60);
  
  // Base range is 100 LP, increases by 50 every 3 minutes if no matches found
  const baseRange = 100;
  const additionalRange = Math.floor(oldestPlayerQueueTime / 3) * 50;
  const matchRange = baseRange + additionalRange;

  console.log("[RankedPvP] Matchmaking parameters:", {
    oldestPlayer: {
      userId: oldestPlayer.userId,
      lp: oldestPlayer.rankedLp,
      queueTime: oldestPlayerQueueTime,
      queueStartTime: oldestPlayer.queueStartTime
    },
    matchRange,
    baseRange,
    additionalRange,
    queueSize: queue.length
  });

  // Find potential matches for the oldest player
  const potentialMatches = queue.filter((player: QueueEntry) => {
    if (player.userId === oldestPlayer.userId) return false;
    
    const lpDiff = Math.abs(player.rankedLp - oldestPlayer.rankedLp);
    const isMatch = lpDiff <= matchRange;
    
    console.log("[RankedPvP] Checking match:", {
      player: {
        userId: player.userId,
        lp: player.rankedLp,
        queueTime: (now.getTime() - player.queueStartTime.getTime()) / (1000 * 60)
      },
      oldestPlayer: {
        userId: oldestPlayer.userId,
        lp: oldestPlayer.rankedLp,
        queueTime: oldestPlayerQueueTime
      },
      lpDiff,
      matchRange,
      isMatch
    });

    return isMatch;
  });

  console.log("[RankedPvP] Potential matches found:", potentialMatches.map((p: QueueEntry) => ({
    userId: p.userId,
    lp: p.rankedLp,
    queueTime: (now.getTime() - p.queueStartTime.getTime()) / (1000 * 60)
  })));

  if (potentialMatches.length > 0) {
    // Get the closest LP match
    const opponent = potentialMatches.reduce((closest: QueueEntry, current: QueueEntry) => {
      const closestDiff = Math.abs(closest.rankedLp - oldestPlayer.rankedLp);
      const currentDiff = Math.abs(current.rankedLp - oldestPlayer.rankedLp);
      return currentDiff < closestDiff ? current : closest;
    });
    
    console.log("[RankedPvP] Selected opponent:", {
      userId: opponent.userId,
      lp: opponent.rankedLp,
      lpDiff: Math.abs(opponent.rankedLp - oldestPlayer.rankedLp),
      queueTime: (now.getTime() - opponent.queueStartTime.getTime()) / (1000 * 60)
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
        console.error("[RankedPvP] Failed to create battle");
        return null;
      }

      console.log("[RankedPvP] Battle created successfully:", result.battleId);

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
      console.error("[RankedPvP] Error during battle creation:", error);
      return null;
    }
  }
  console.log("[RankedPvP] No matches found in queue");
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
      const queueEntry = await ctx.drizzle
        .select()
        .from(rankedPvpQueue)
        .where(eq(rankedPvpQueue.userId, input.userId))
        .limit(1);

      if (!queueEntry.length) {
        return {
          inQueue: false,
        };
      }

      const entry = queueEntry[0];
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - entry.queueStartTime.getTime()) / 1000);
      const minutes = Math.floor(diffInSeconds / 60);
      const seconds = diffInSeconds % 60;
      const lpRange = 100 + (Math.floor(minutes / 3) * 50);

      return {
        inQueue: true,
        queueStartTime: entry.queueStartTime,
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

      const now = new Date();
      console.log("[RankedPvP] Adding user to queue:", {
        userId: input.userId,
        rankedLp: userState[0]?.rankedLp ?? 0,
        queueStartTime: now
      });

      // Add user to queue
      await ctx.drizzle.insert(rankedPvpQueue).values({
        id: nanoid(),
        userId: input.userId,
        rankedLp: userState[0]?.rankedLp ?? 0,
        queueStartTime: now,
      });

      // Set user status to QUEUED
      await ctx.drizzle
        .update(userData)
        .set({ status: "QUEUED" })
        .where(eq(userData.userId, input.userId));

      // Immediately check for matches
      const battleId = await checkRankedPvpMatches(ctx.drizzle);

      return {
        success: true,
        message: "Queued for ranked PvP",
        battleId: battleId ?? undefined
      };
    }),

  getRankedPvpQueue: protectedProcedure
    .query(async ({ ctx }) => {
      const queueEntry = await ctx.drizzle
        .select()
        .from(rankedPvpQueue)
        .where(eq(rankedPvpQueue.userId, ctx.userId))
        .limit(1);
      return { inQueue: queueEntry.length > 0 };
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

  getQueueState: protectedProcedure
    .output(z.object({
      success: z.boolean(),
      message: z.string(),
      queue: z.array(z.object({
        userId: z.string(),
        rankedLp: z.number(),
        queueStartTime: z.date(),
        timeInQueue: z.number(),
      })),
    }))
    .query(async ({ ctx }) => {
      const queue = await ctx.drizzle
        .select()
        .from(rankedPvpQueue)
        .orderBy(rankedPvpQueue.queueStartTime);

      const now = new Date();
      const queueState = queue.map(entry => ({
        userId: entry.userId,
        rankedLp: entry.rankedLp,
        queueStartTime: entry.queueStartTime,
        timeInQueue: (now.getTime() - entry.queueStartTime.getTime()) / (1000 * 60),
      }));

      return {
        success: true,
        message: `Found ${queue.length} players in queue`,
        queue: queueState,
      };
    }),
});
