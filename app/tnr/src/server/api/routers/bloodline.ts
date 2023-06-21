import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, gte, and } from "drizzle-orm";
import { LetterRanks } from "../../../../drizzle/constants";
import { bloodline, bloodlineRolls, userData } from "../../../../drizzle/schema";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError } from "../trpc";
import { fetchUser } from "./profile";
import { getRandomElement } from "../../../utils/array";
import { ROLL_CHANCE, REMOVAL_COST, BLOODLINE_COST } from "../../../libs/bloodline";
import type { BloodlineRank } from "../../../../drizzle/schema";
import type { DrizzleClient } from "../../db";

export const bloodlineRouter = createTRPCRouter({
  // Get all bloodlines
  getAll: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        rank: z.enum(LetterRanks),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.bloodline.findMany({
        where: eq(bloodline.rank, input.rank),
        offset: skip,
        limit: input.limit,
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  // Get a specific bloodline
  getBloodline: publicProcedure
    .input(z.object({ bloodlineId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await fetchBloodline(ctx.drizzle, input.bloodlineId);
    }),
  // Get bloodline roll of a specific user
  getRolls: protectedProcedure
    .input(z.object({ currentBloodlineId: z.string().optional().nullable() }))
    .query(async ({ ctx }) => {
      return await fetchBloodlineRoll(ctx.drizzle, ctx.userId);
    }),
  // Roll a bloodline
  roll: protectedProcedure.mutation(async ({ ctx }) => {
    const prevRoll = await fetchBloodlineRoll(ctx.drizzle, ctx.userId);
    if (prevRoll) {
      throw serverError("PRECONDITION_FAILED", "You have already rolled a bloodline");
    }
    const rand = Math.random();
    let bloodlineRank: BloodlineRank | undefined = undefined;
    if (rand < ROLL_CHANCE["S"]) {
      bloodlineRank = "S";
    } else if (rand < ROLL_CHANCE["A"]) {
      bloodlineRank = "A";
    } else if (rand < ROLL_CHANCE["B"]) {
      bloodlineRank = "B";
    } else if (rand < ROLL_CHANCE["C"]) {
      bloodlineRank = "C";
    } else if (rand < ROLL_CHANCE["D"]) {
      bloodlineRank = "D";
    }
    // Update roll & user if successfull
    let bloodlineId: null | string = null;
    if (bloodlineRank) {
      const randomBloodline = getRandomElement(
        await ctx.drizzle.query.bloodline.findMany({
          where: eq(bloodline.rank, bloodlineRank),
        })
      );
      if (randomBloodline) {
        bloodlineId = randomBloodline.id;
        await ctx.drizzle.transaction(async (tx) => {
          await tx
            .update(userData)
            .set({ bloodlineId: randomBloodline.id })
            .where(eq(userData.userId, ctx.userId));
          await tx.insert(bloodlineRolls).values({
            id: nanoid(),
            userId: ctx.userId,
            bloodlineId: randomBloodline.id,
          });
        });
      }
    } else {
      await ctx.drizzle.insert(bloodlineRolls).values({
        id: nanoid(),
        userId: ctx.userId,
      });
    }
    return { bloodlineId: bloodlineId };
  }),
  // Remove a bloodline from session user
  removeBloodline: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    const roll = await fetchBloodlineRoll(ctx.drizzle, ctx.userId);
    if (!user.bloodlineId) {
      throw serverError("PRECONDITION_FAILED", "You do not have a bloodline");
    }
    if (user.bloodlineId === roll?.bloodlineId) {
      return await ctx.drizzle
        .update(userData)
        .set({ bloodlineId: null })
        .where(eq(userData.userId, ctx.userId));
    } else {
      if (user.reputationPoints < REMOVAL_COST) {
        throw serverError("FORBIDDEN", "You do not have enough reputation points");
      }
      return await ctx.drizzle
        .update(userData)
        .set({
          bloodlineId: null,
          reputationPoints: user.reputationPoints - REMOVAL_COST,
        })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            gte(userData.reputationPoints, REMOVAL_COST)
          )
        );
    }
  }),
  // Purchase a bloodline for session user
  purchaseBloodline: protectedProcedure
    .input(z.object({ bloodlineId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const roll = await fetchBloodlineRoll(ctx.drizzle, ctx.userId);
      const line = await fetchBloodline(ctx.drizzle, input.bloodlineId);
      if (!roll) {
        throw serverError("PRECONDITION_FAILED", "You have not rolled a bloodline");
      }
      if (!line) {
        throw serverError("PRECONDITION_FAILED", "Bloodline does not exist");
      }
      if (BLOODLINE_COST[line.rank] > user.reputationPoints) {
        throw serverError("FORBIDDEN", "You do not have enough reputation points");
      }
      return await ctx.drizzle
        .update(userData)
        .set({
          reputationPoints: user.reputationPoints - BLOODLINE_COST[line.rank],
          bloodlineId: line.id,
        })
        .where(eq(userData.userId, ctx.userId));
    }),
});

/**
 * COMMON QUERIES WHICH ARE REUSED
 */
export const fetchBloodlineRoll = async (client: DrizzleClient, userId: string) => {
  return await client.query.bloodlineRolls.findFirst({
    where: eq(bloodlineRolls.userId, userId),
    with: { bloodline: true },
  });
};

export const fetchBloodline = async (client: DrizzleClient, bloodlineId: string) => {
  return await client.query.bloodline.findFirst({
    where: eq(bloodline.id, bloodlineId),
  });
};
