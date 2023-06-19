import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, sql, gte, and } from "drizzle-orm";
import { item, userItem, userData } from "../../../../drizzle/schema";
import { ItemTypes, ItemSlots, ItemRarities } from "../../../../drizzle/schema";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError } from "../trpc";
import type { DrizzleClient } from "../../db";

const calcMaxItems = () => {
  const base = 20;
  return base;
};

export const itemRouter = createTRPCRouter({
  // Get all items
  getAll: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        itemType: z.enum(ItemTypes).optional(),
        itemRarity: z.enum(ItemRarities).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.item.findMany({
        offset: skip,
        limit: input.limit,
        where: and(
          ...(input.itemRarity ? [eq(item.rarity, input.itemRarity)] : []),
          ...(input.itemType ? [eq(item.itemType, input.itemType)] : [])
        ),
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  // Get counts of user items grouped by item ID
  getUserItemCounts: protectedProcedure.query(async ({ ctx }) => {
    const counts = await ctx.drizzle
      .select({
        count: sql<number>`count(${userItem.id})`,
        itemId: userItem.itemId,
        quantity: userItem.quantity,
      })
      .from(userItem)
      .groupBy(userItem.itemId);
    return counts.map((c) => ({ id: c.itemId, quantity: c.quantity ?? 0 }));
  }),
  // Get user items
  getUserItems: protectedProcedure.query(async ({ ctx }) => {
    return await fetchUserItems(ctx.drizzle, ctx.userId);
  }),
  // Merge item stacks
  mergeStacks: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const info = await ctx.drizzle.query.item.findFirst({
        where: eq(item.id, input.itemId),
      });
      const userItems = await ctx.drizzle.query.userItem.findMany({
        where: and(eq(userItem.userId, ctx.userId), eq(userItem.itemId, input.itemId)),
      });
      const totalQuantity = userItems.reduce((acc, i) => acc + i.quantity, 0);
      if (info && userItems.length > 0) {
        await ctx.drizzle.transaction(async (tx) => {
          let currentCount = 0;
          for (let i = 0; i < userItems.length; i++) {
            const id = userItems?.[i]?.id;
            const newQuantity = Math.min(info.stackSize, totalQuantity - currentCount);
            if (id) {
              if (newQuantity > 0) {
                currentCount += newQuantity;
                await tx
                  .update(userItem)
                  .set({ quantity: newQuantity })
                  .where(eq(userItem.id, id));
              } else {
                await tx.delete(userItem).where(eq(userItem.id, id));
              }
            }
          }
        });
      }
    }),
  // Drop user item
  dropUserItem: protectedProcedure
    .input(z.object({ userItemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const useritem = await fetchUserItem(ctx.drizzle, ctx.userId, input.userItemId);
      if (useritem) {
        return await ctx.drizzle
          .delete(userItem)
          .where(eq(userItem.id, input.userItemId));
      } else {
        throw serverError("NOT_FOUND", "User item not found");
      }
    }),
  // Use user item
  toggleEquip: protectedProcedure
    .input(
      z.object({
        userItemId: z.string(),
        slot: z.enum(ItemSlots),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userItems = await fetchUserItems(ctx.drizzle, ctx.userId);
      const useritem = userItems.find((i) => i.id === input.userItemId);
      if (!useritem) {
        throw serverError("NOT_FOUND", "User item not found");
      }
      return await ctx.drizzle.transaction(async (tx) => {
        if (!useritem.equipped || useritem.equipped !== input.slot) {
          const equipped = userItems.find(
            (i) => i.equipped === input.slot && i.id !== useritem.id
          );
          if (equipped) {
            await tx
              .update(userItem)
              .set({ equipped: "NONE" })
              .where(eq(userItem.id, equipped.id));
          }
          return await tx
            .update(userItem)
            .set({ equipped: input.slot })
            .where(eq(userItem.id, useritem.id));
        } else {
          return await tx
            .update(userItem)
            .set({ equipped: "NONE" })
            .where(eq(userItem.id, useritem.id));
        }
      });
    }),
  // Buy user item
  buy: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        stack: z.number().min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const iid = input.itemId;
      const uid = ctx.userId;
      const info = await ctx.drizzle.query.item.findFirst({
        where: eq(item.id, iid),
      });
      const counts = await ctx.drizzle
        .select({ count: sql<number>`count(*)` })
        .from(userItem)
        .where(eq(userItem.userId, uid));
      const userItemsCount = counts?.[0]?.count || 0;
      if (input.stack > 1 && !item.canStack) {
        throw serverError("PRECONDITION_FAILED", "Item cannot be stacked");
      }
      if (userItemsCount >= calcMaxItems()) {
        throw serverError("PRECONDITION_FAILED", "Inventory is full");
      }
      if (!info) {
        throw serverError("PRECONDITION_FAILED", "Item not found");
      }
      const cost = info.cost * input.stack;
      const result = await ctx.drizzle.transaction(async (tx) => {
        await tx.insert(userItem).values({
          id: nanoid(),
          userId: uid,
          itemId: iid,
          quantity: input.stack,
          equipped: "NONE",
        });
        const result = await tx
          .update(userData)
          .set({
            money: sql`${userData.money} - ${cost}`,
          })
          .where(and(eq(userData.userId, uid), gte(userData.money, cost)));
        if (result.rowsAffected !== 1) {
          throw serverError("PRECONDITION_FAILED", "Not enough money");
        }
      });
      return result;
    }),
});

/**
 * COMMON QUERIES WHICH ARE REUSED
 */

export const fetchUserItems = async (client: DrizzleClient, userId: string) => {
  return await client.query.userItem.findMany({
    where: eq(userItem.userId, userId),
    with: { item: true },
  });
};

export const fetchUserItem = async (
  client: DrizzleClient,
  userId: string,
  itemId: string
) => {
  return await client.query.userItem.findFirst({
    where: and(eq(userItem.userId, userId), eq(userItem.itemId, itemId)),
    with: { item: true },
  });
};
