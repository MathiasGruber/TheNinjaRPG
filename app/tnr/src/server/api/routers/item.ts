import { z } from "zod";
import { ItemType, ItemSlot, ItemRarity } from "@prisma/client";
import type { UserData, PrismaClient } from "@prisma/client";
import { fetchUser } from "./profile";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  serverError,
} from "../trpc";

const calcMaxItems = (user: UserData) => {
  const base = 20;
  return base;
};

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
          ...(input.itemType && { itemType: input.itemType }),
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
  getUserItems: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.userItem.findMany({
      where: { userId: ctx.userId },
      include: { item: true },
    });
  }),
  mergeStacks: protectedProcedure
    .input(z.object({ itemId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Pre-fetches
      const item = await ctx.prisma.item.findUniqueOrThrow({
        where: { id: input.itemId },
      });
      const userItems = await ctx.prisma.userItem.findMany({
        where: { userId: ctx.userId, itemId: item.id },
      });
      // Calculate total quantity
      const totalQuantity = userItems.reduce((acc, i) => acc + i.quantity, 0);
      // Update stacks
      await ctx.prisma.$transaction(async (tx) => {
        let currentCount = 0;
        for (let i = 0; i < userItems.length; i++) {
          const newQuantity = Math.min(item.stackSize, totalQuantity - currentCount);
          if (newQuantity > 0) {
            currentCount += newQuantity;
            await tx.userItem.update({
              where: { id: userItems?.[i]?.id },
              data: { quantity: newQuantity },
            });
          } else {
            await tx.userItem.delete({ where: { id: userItems?.[i]?.id } });
          }
        }
      });
    }),
  dropUserItem: protectedProcedure
    .input(z.object({ userItemId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const useritem = await ctx.prisma.userItem.findUniqueOrThrow({
        where: { id: input.userItemId },
      });
      if (useritem.userId === ctx.userId) {
        return await ctx.prisma.userItem.delete({
          where: { id: input.userItemId },
        });
      } else {
        throw serverError("NOT_FOUND", "User item not found");
      }
    }),
  toggleEquip: protectedProcedure
    .input(
      z.object({
        userItemId: z.string().cuid(),
        slot: z.nativeEnum(ItemSlot),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Pre-fetches
      const userItems = await ctx.prisma.userItem.findMany({
        where: { userId: ctx.userId },
        include: { item: true },
      });
      // Guards
      const useritem = userItems.find((i) => i.id === input.userItemId);
      if (!useritem) {
        throw serverError("NOT_FOUND", "User item not found");
      }
      // Toggle
      return await ctx.prisma.$transaction(async (tx) => {
        if (!useritem.equipped || useritem.equipped !== input.slot) {
          const equipped = userItems.find(
            (i) => i.equipped === input.slot && i.id !== useritem.id
          );
          if (equipped) {
            await tx.userItem.update({
              where: { id: equipped.id },
              data: { equipped: null },
            });
          }
          return await tx.userItem.update({
            where: { id: useritem.id },
            data: { equipped: input.slot },
          });
        } else {
          return await tx.userItem.update({
            where: { id: useritem.id },
            data: { equipped: null },
          });
        }
      });
    }),
  buy: protectedProcedure
    .input(
      z.object({
        itemId: z.string().cuid(),
        stack: z.number().min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Pre-fetches
      const iid = input.itemId;
      const uid = ctx.userId;
      const item = await ctx.prisma.item.findUniqueOrThrow({ where: { id: iid } });
      const user = await fetchUser(ctx.prisma, uid);
      const counts = await ctx.prisma.userItem.count({ where: { userId: uid } });
      // Guards
      if (input.stack > 1 && !item.canStack) {
        throw serverError("PRECONDITION_FAILED", "Item cannot be stacked");
      }
      if (counts >= calcMaxItems(user)) {
        throw serverError("PRECONDITION_FAILED", "Inventory is full");
      }
      // Purchase
      const result = await ctx.prisma.$transaction(async (tx) => {
        const userItem = await tx.userItem.create({
          data: {
            userId: uid,
            itemId: item.id,
            quantity: input.stack,
          },
        });
        const update = await tx.$executeRaw`
          UPDATE UserData
          SET 
            money = money - ${item.cost * input.stack}
          WHERE
            userId = ${uid} AND
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
