import { z } from "zod";
import { ItemType } from "@prisma/client/edge";
import { ItemRarity } from "@prisma/client/edge";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const itemRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        itemType: z.nativeEnum(ItemType),
        itemRarity: z.nativeEnum(ItemRarity),
      })
    )
    .query(async ({ ctx, input }) => {
      // Fetch threads
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.prisma.item.findMany({
        skip: skip,
        take: input.limit,
        where: {
          type: input.itemType,
          rarity: input.itemRarity,
        },
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
});
