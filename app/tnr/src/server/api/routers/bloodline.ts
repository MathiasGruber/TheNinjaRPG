import { z } from "zod";
import { LetterRank, type Bloodline } from "@prisma/client";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  serverError,
} from "../trpc";
import { fetchUser } from "./profile";
import { getRandomElement } from "../../../utils/array";
import { ROLL_CHANCE, REMOVAL_COST, BLOODLINE_COST } from "../../../libs/bloodline";

export const bloodlineRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        rank: z.nativeEnum(LetterRank),
      })
    )
    .query(async ({ ctx, input }) => {
      // Fetch threads
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.prisma.bloodline.findMany({
        skip: skip,
        take: input.limit,
        where: {
          rank: input.rank,
        },
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  getBloodline: publicProcedure
    .input(z.object({ bloodlineId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      return await ctx.prisma.bloodline.findUniqueOrThrow({
        where: { id: input.bloodlineId },
      });
    }),
  getRolls: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.bloodlineRolls.findUnique({
      include: { bloodline: true },
      where: { userId: ctx.userId },
    });
  }),
  roll: protectedProcedure.mutation(async ({ ctx }) => {
    // Guard
    const prevRoll = await ctx.prisma.bloodlineRolls.findUnique({
      where: { userId: ctx.userId },
    });
    if (prevRoll) {
      throw serverError("PRECONDITION_FAILED", "You have already rolled a bloodline");
    }
    // Roll
    const rand = Math.random();
    let bloodlineRank: LetterRank | undefined = undefined;
    if (rand < ROLL_CHANCE[LetterRank.S]) {
      bloodlineRank = LetterRank.S;
    } else if (rand < ROLL_CHANCE[LetterRank.A]) {
      bloodlineRank = LetterRank.A;
    } else if (rand < ROLL_CHANCE[LetterRank.B]) {
      bloodlineRank = LetterRank.B;
    } else if (rand < ROLL_CHANCE[LetterRank.C]) {
      bloodlineRank = LetterRank.C;
    } else if (rand < ROLL_CHANCE[LetterRank.D]) {
      bloodlineRank = LetterRank.D;
    }
    let randomBloodline: Bloodline | undefined = undefined;
    if (bloodlineRank) {
      randomBloodline = getRandomElement(
        await ctx.prisma.bloodline.findMany({
          where: { rank: bloodlineRank },
        })
      );
    }
    // Update roll & user if successfull
    return await ctx.prisma.$transaction(async (tx) => {
      if (randomBloodline) {
        await tx.userData.update({
          where: { userId: ctx.userId },
          data: { bloodlineId: randomBloodline.id },
        });
        return await tx.bloodlineRolls.create({
          data: { userId: ctx.userId, bloodlineId: randomBloodline.id },
        });
      } else {
        return await ctx.prisma.bloodlineRolls.create({
          data: { userId: ctx.userId },
        });
      }
    });
  }),
  removeBloodline: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.prisma, ctx.userId);
    const roll = await ctx.prisma.bloodlineRolls.findUnique({
      where: { userId: ctx.userId },
    });
    // Guard
    if (!user.bloodlineId) {
      throw serverError("PRECONDITION_FAILED", "You do not have a bloodline");
    }
    // If bloodline is equal to the roll, then remove for free
    if (user.bloodlineId === roll?.bloodlineId) {
      return await ctx.prisma.userData.update({
        where: { userId: ctx.userId },
        data: { bloodlineId: null },
      });
    } else {
      if (user.reputation_points < REMOVAL_COST) {
        throw serverError("FORBIDDEN", "You do not have enough reputation points");
      }
      return await ctx.prisma.userData.update({
        where: { userId: ctx.userId },
        data: {
          reputation_points: { decrement: REMOVAL_COST },
          bloodlineId: null,
        },
      });
    }
  }),
  purchaseBloodline: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Pre-fetches
      const user = await fetchUser(ctx.prisma, ctx.userId);
      const roll = await ctx.prisma.bloodlineRolls.findUnique({
        where: { userId: ctx.userId },
      });
      const bloodline = await ctx.prisma.bloodline.findUniqueOrThrow({
        where: { id: input.id },
      });
      // Guards
      if (!roll) {
        throw serverError("PRECONDITION_FAILED", "You have not rolled a bloodline");
      }
      if (BLOODLINE_COST[bloodline.rank] > user.reputation_points) {
        throw serverError("FORBIDDEN", "You do not have enough reputation points");
      }
      // Update bloodline
      return await ctx.prisma.userData.update({
        where: { userId: ctx.userId },
        data: {
          reputation_points: { decrement: BLOODLINE_COST[bloodline.rank] },
          bloodlineId: bloodline.id,
        },
      });
    }),
});
