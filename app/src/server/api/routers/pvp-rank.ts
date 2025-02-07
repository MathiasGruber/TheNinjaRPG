import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { pvpLoadoutTable, pvpRankTable } from "../../../../drizzle/schema/pvp_rank";

const RANK_THRESHOLDS = {
  Wood: 150,
  Adept: 300,
  Master: 600,
  Legend: 900,
};

const STREAK_BONUS = 10;
const INACTIVITY_DAYS = 7;
const DECAY_AMOUNT = 10;

export const pvpRankRouter = createTRPCRouter({
  enterQueue: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.userId;

    // Check if player is already in queue
    const existingQueue = await ctx.drizzle.query.pvpRankTable.findFirst({
      where: eq(pvpRankTable.userId, userId),
    });

    if (existingQueue?.isQueued) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Already in queue",
      });
    }

    // Create or update player's rank entry
    await ctx.drizzle
      .insert(pvpRankTable)
      .values({
        userId,
        isQueued: 1,
      })
      .onConflictDoUpdate({
        target: pvpRankTable.userId,
        set: { isQueued: 1 },
      });

    return { success: true };
  }),

  leaveQueue: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.userId;

    await ctx.drizzle
      .update(pvpRankTable)
      .set({ isQueued: 0 })
      .where(eq(pvpRankTable.userId, userId));

    return { success: true };
  }),

  saveLoadout: protectedProcedure
    .input(
      z.object({
        jutsu: z.array(z.string()).max(15),
        weapons: z.array(z.string()).max(2),
        consumables: z.array(z.string()).max(4),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      await ctx.drizzle
        .insert(pvpLoadoutTable)
        .values({
          userId,
          jutsu: input.jutsu,
          weapons: input.weapons,
          consumables: input.consumables,
        })
        .onConflictDoUpdate({
          target: pvpLoadoutTable.userId,
          set: {
            jutsu: input.jutsu,
            weapons: input.weapons,
            consumables: input.consumables,
          },
        });

      return { success: true };
    }),

  getLoadout: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    const loadout = await ctx.drizzle.query.pvpLoadoutTable.findFirst({
      where: eq(pvpLoadoutTable.userId, userId),
    });

    return loadout;
  }),

  getRankInfo: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    const rankInfo = await ctx.drizzle.query.pvpRankTable.findFirst({
      where: eq(pvpRankTable.userId, userId),
    });

    // Get top 5 players for Sannin rank
    const topPlayers = await ctx.drizzle.query.pvpRankTable.findMany({
      orderBy: (pvpRankTable, { desc }) => [desc(pvpRankTable.lp)],
      limit: 5,
    });

    const isSannin = topPlayers.some(p => p.userId === userId);

    return {
      ...rankInfo,
      isSannin,
      rank: isSannin ? "Sannin" : rankInfo?.rank ?? "Wood",
    };
  }),

  findMatch: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.userId;

    const player = await ctx.drizzle.query.pvpRankTable.findFirst({
      where: eq(pvpRankTable.userId, userId),
    });

    if (!player?.isQueued) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Not in queue",
      });
    }

    // Find opponent within LP range
    // Start with 100 LP difference
    let lpRange = 100;
    let opponent = null;

    while (lpRange <= 300 && !opponent) {
      opponent = await ctx.drizzle.query.pvpRankTable.findFirst({
        where: (table, { and, eq, between, not }) =>
          and(
            eq(table.isQueued, 1),
            not(eq(table.userId, userId)),
            between(table.lp, (player.lp - lpRange), (player.lp + lpRange))
          ),
      });

      // Increase range by 50 if no match found
      lpRange += 50;
    }

    if (!opponent) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No suitable opponent found",
      });
    }

    // Remove both players from queue
    await ctx.drizzle
      .update(pvpRankTable)
      .set({ isQueued: 0 })
      .where(
        eq(pvpRankTable.userId, userId) || eq(pvpRankTable.userId, opponent.userId)
      );

    return { opponent };
  }),

  updateMatchResult: protectedProcedure
    .input(
      z.object({
        opponentId: z.string(),
        won: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      const [player, opponent] = await Promise.all([
        ctx.drizzle.query.pvpRankTable.findFirst({
          where: eq(pvpRankTable.userId, userId),
        }),
        ctx.drizzle.query.pvpRankTable.findFirst({
          where: eq(pvpRankTable.userId, input.opponentId),
        }),
      ]);

      if (!player || !opponent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Player or opponent not found",
        });
      }

      // Calculate new LP
      const kFactor = player.lp < RANK_THRESHOLDS.Adept ? 40 :
                     player.lp < RANK_THRESHOLDS.Master ? 32 :
                     player.lp < RANK_THRESHOLDS.Legend ? 24 : 16;

      const expectedScore = 1 / (1 + Math.pow(10, (opponent.lp - player.lp) / 400));
      const actualScore = input.won ? 1 : 0;
      let lpChange = kFactor * (actualScore - expectedScore);

      // Rank difference bonus/protection
      const playerRank = Object.entries(RANK_THRESHOLDS).findIndex(([_, threshold]) => player.lp < threshold);
      const opponentRank = Object.entries(RANK_THRESHOLDS).findIndex(([_, threshold]) => opponent.lp < threshold);
      const rankDifference = opponentRank - playerRank;

      if (input.won && rankDifference > 0) {
        lpChange += rankDifference * 10;
      }
      if (!input.won && rankDifference <= -2) {
        lpChange *= 0.5;
      }

      // Win streak bonus
      if (input.won && player.winStreak > 0) {
        lpChange += STREAK_BONUS * player.winStreak;
      }

      const newLp = Math.max(RANK_THRESHOLDS.Wood, Math.round(player.lp + lpChange));
      const newWinStreak = input.won ? (player.winStreak + 1) : 0;

      await ctx.drizzle
        .update(pvpRankTable)
        .set({
          lp: newLp,
          winStreak: newWinStreak,
          lastMatchDate: new Date(),
        })
        .where(eq(pvpRankTable.userId, userId));

      return { newLp, newWinStreak };
    }),
});
