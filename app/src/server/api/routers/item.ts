import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, sql, gte, and } from "drizzle-orm";
import { item, userItem, userData, actionLog } from "../../../../drizzle/schema";
import { ItemTypes, ItemSlots, ItemRarities } from "../../../../drizzle/constants";
import { fetchUser } from "./profile";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError, baseServerResponse } from "../trpc";
import { ItemValidator } from "../../../libs/combat/types";
import { canChangeContent } from "../../../utils/permissions";
import { callDiscordContent } from "../../../libs/discord";
import HumanDiff from "human-object-diff";
import type { ZodAllTags } from "../../../libs/combat/types";
import type { DrizzleClient } from "../../db";

const calcMaxItems = () => {
  const base = 20;
  return base;
};

export const itemRouter = createTRPCRouter({
  getAllNames: publicProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.item.findMany({
      columns: { id: true, name: true },
    });
  }),
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await fetchItem(ctx.drizzle, input.id);
      if (!result) {
        throw serverError("NOT_FOUND", "Item not found");
      }
      return result as Omit<typeof result, "effects"> & { effects: ZodAllTags[] };
    }),
  // Create new item
  create: protectedProcedure
    .input(z.object({ type: z.enum(ItemTypes) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (canChangeContent(user.role)) {
        const id = nanoid();
        await ctx.drizzle.insert(item).values({
          id: id,
          name: "New Item",
          image: "https://utfs.io/f/630cf6e7-c152-4dea-a3ff-821de76d7f5a_default.webp",
          description: "New item description",
          itemType: input.type,
          rarity: "COMMON",
          slot: "ITEM",
          target: "CHARACTER",
          effects: [],
          hidden: 1,
        });
        return { success: true, message: id };
      } else {
        return { success: false, message: `Not allowed to create item` };
      }
    }),
  // Delete a item
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchItem(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        await ctx.drizzle.delete(item).where(eq(item.id, input.id));
        await ctx.drizzle.delete(userItem).where(eq(userItem.itemId, input.id));
        return { success: true, message: `Item deleted` };
      } else {
        return { success: false, message: `Not allowed to delete item` };
      }
    }),
  // Update an item
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: ItemValidator }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchItem(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        // Calculate diff
        const diff = new HumanDiff({ objectName: "item" }).diff(entry, {
          id: entry.id,
          updatedAt: entry.updatedAt,
          createdAt: entry.createdAt,
          ...input.data,
        });
        // Update database
        await ctx.drizzle.update(item).set(input.data).where(eq(item.id, input.id));
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "item",
          changes: diff,
          relatedId: entry.id,
          relatedMsg: `Update: ${entry.name}`,
          relatedImage: entry.image,
        });
        if (process.env.NODE_ENV !== "development") {
          await callDiscordContent(user.username, entry.name, diff, entry.image);
        }
        return { success: true, message: `Data updated: ${diff.join(". ")}` };
      } else {
        return { success: false, message: `Not allowed to edit item` };
      }
    }),
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
        quantity: sql<number>`sum(${userItem.quantity})`,
      })
      .from(userItem)
      .where(eq(userItem.userId, ctx.userId))
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
      const info = await fetchItem(ctx.drizzle, input.itemId);
      const userItems = await ctx.drizzle.query.userItem.findMany({
        where: and(eq(userItem.userId, ctx.userId), eq(userItem.itemId, input.itemId)),
      });
      const totalQuantity = userItems.reduce((acc, i) => acc + i.quantity, 0);
      if (info && userItems.length > 0) {
        let currentCount = 0;
        for (let i = 0; i < userItems.length; i++) {
          const id = userItems?.[i]?.id;
          const newQuantity = Math.min(info.stackSize, totalQuantity - currentCount);
          if (id) {
            if (newQuantity > 0) {
              currentCount += newQuantity;
              await ctx.drizzle
                .update(userItem)
                .set({ quantity: newQuantity })
                .where(eq(userItem.id, id));
            } else {
              await ctx.drizzle.delete(userItem).where(eq(userItem.id, id));
            }
          }
        }
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
      if (!useritem.equipped || useritem.equipped !== input.slot) {
        const equipped = userItems.find(
          (i) => i.equipped === input.slot && i.id !== useritem.id
        );
        if (equipped) {
          await ctx.drizzle
            .update(userItem)
            .set({ equipped: "NONE" })
            .where(eq(userItem.id, equipped.id));
        }
        return await ctx.drizzle
          .update(userItem)
          .set({ equipped: input.slot })
          .where(eq(userItem.id, useritem.id));
      } else {
        return await ctx.drizzle
          .update(userItem)
          .set({ equipped: "NONE" })
          .where(eq(userItem.id, useritem.id));
      }
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
      const info = await fetchItem(ctx.drizzle, iid);
      const counts = await ctx.drizzle
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
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
      if (info.hidden === 1) {
        throw serverError("PRECONDITION_FAILED", "Item can not be bought");
      }
      const cost = info.cost * input.stack;
      const result = await ctx.drizzle
        .update(userData)
        .set({
          money: sql`${userData.money} - ${cost}`,
        })
        .where(and(eq(userData.userId, uid), gte(userData.money, cost)));
      if (result.rowsAffected !== 1) {
        throw serverError("PRECONDITION_FAILED", "Not enough money");
      }
      await ctx.drizzle.insert(userItem).values({
        id: nanoid(),
        userId: uid,
        itemId: iid,
        quantity: input.stack,
        equipped: "NONE",
      });
      return result;
    }),
});

/**
 * COMMON QUERIES WHICH ARE REUSED
 */

export const fetchItem = async (client: DrizzleClient, id: string) => {
  return await client.query.item.findFirst({
    where: eq(item.id, id),
  });
};

export const fetchUserItems = async (client: DrizzleClient, userId: string) => {
  return await client.query.userItem.findMany({
    where: eq(userItem.userId, userId),
    with: { item: true },
  });
};

export const fetchUserItem = async (
  client: DrizzleClient,
  userId: string,
  userItemId: string
) => {
  return await client.query.userItem.findFirst({
    where: and(eq(userItem.userId, userId), eq(userItem.id, userItemId)),
    with: { item: true },
  });
};
