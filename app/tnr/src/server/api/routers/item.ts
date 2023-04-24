import { z } from "zod";
import { ItemType } from "@prisma/client/edge";
import { ItemRarity } from "@prisma/client/edge";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  serverError,
} from "../trpc";

export const itemRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        itemType: z.nativeEnum(ItemType).optional(),
        itemRarity: z.nativeEnum(ItemRarity).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.prisma.item.findMany({
        skip: skip,
        take: input.limit,
        where: {
          ...(input.itemRarity && { rarity: input.itemRarity }),
          ...(input.itemType && { type: input.itemType }),
        },
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  getUserItemCounts: protectedProcedure.query(async ({ ctx }) => {
    const counts = await ctx.prisma.userItem.groupBy({
      by: ["itemId"],
      _sum: {
        quantity: true,
      },
    });
    return counts.map((c) => ({ id: c.itemId, quantity: c._sum.quantity ?? 0 }));
  }),
  buy: protectedProcedure
    .input(
      z.object({
        itemId: z.string().cuid(),
        stack: z.number().min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.item.findUniqueOrThrow({
        where: { id: input.itemId },
      });
      if (input.stack > 1 && !item.canStack) {
        throw serverError("PRECONDITION_FAILED", "Item cannot be stacked");
      }
      const result = await ctx.prisma.$transaction(async (tx) => {
        const userItem = await tx.userItem.create({
          data: {
            userId: ctx.userId,
            itemId: item.id,
            quantity: input.stack,
          },
        });
        const update = await tx.$executeRaw`
          UPDATE UserData
          SET 
            money = money - ${item.cost * input.stack}
          WHERE
            userId = ${ctx.userId} AND
            money >= ${item.cost * input.stack}
        `;
        if (update !== 1) {
          throw serverError("PRECONDITION_FAILED", "Not enough money");
        }
        return userItem;
      });
      return result;
    }),
});
