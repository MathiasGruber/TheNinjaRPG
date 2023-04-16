import { z } from "zod";
import { LetterRank } from "@prisma/client/edge";
import { createTRPCRouter, publicProcedure } from "../trpc";

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
      // Fetch threads
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
});
