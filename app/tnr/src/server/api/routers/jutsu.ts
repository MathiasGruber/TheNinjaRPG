import { z } from "zod";
import { LetterRank } from "@prisma/client/edge";
import { fetchUser } from "./profile";
import {
  canTrainJutsu,
  calcTrainTime,
  calcTrainCost,
} from "../../../../src/libs/training/jutsu";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  serverError,
} from "../trpc";

export const jutsuRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        rarity: z.nativeEnum(LetterRank),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.prisma.jutsu.findMany({
        skip: skip,
        take: input.limit,
        where: {
          jutsuRank: input.rarity,
        },
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  getUserJutsus: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.userJutsu.findMany({
      where: { userId: ctx.userId },
    });
  }),
  startTraining: protectedProcedure
    .input(z.object({ jutsuId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Pre-fetch
      const user = await fetchUser(ctx.prisma, ctx.userId);
      const jutsu = await ctx.prisma.jutsu.findUniqueOrThrow({
        where: { id: input.jutsuId },
      });
      const userjutsus = await ctx.prisma.userJutsu.findMany({
        where: { userId: ctx.userId },
      });
      const userjutsu = userjutsus.find((j) => j.jutsuId === input.jutsuId);
      // Guard
      if (!canTrainJutsu(jutsu, user)) {
        throw serverError("NOT_FOUND", "You cannot train this jutsu");
      }
      if (userjutsus.find((j) => j.finishTraining && j.finishTraining > new Date())) {
        throw serverError("NOT_FOUND", "You are already training a jutsu");
      }
      // Start training
      return await ctx.prisma.$transaction(async (tx) => {
        const level = userjutsu ? userjutsu.level : 0;
        const trainTime = calcTrainTime(jutsu, level);
        const trainCost = calcTrainCost(jutsu, level);
        await tx.userData.update({
          where: { userId: ctx.userId },
          data: {
            money: { decrement: trainCost },
          },
        });
        if (userjutsu) {
          return tx.userJutsu.update({
            where: { userId_jutsuId: { userId: ctx.userId, jutsuId: input.jutsuId } },
            data: {
              level: { increment: 1 },
              finishTraining: new Date(Date.now() + trainTime),
            },
          });
        } else {
          return tx.userJutsu.create({
            data: {
              userId: ctx.userId,
              jutsuId: input.jutsuId,
              finishTraining: new Date(Date.now() + trainTime),
            },
          });
        }
      });
    }),
});
