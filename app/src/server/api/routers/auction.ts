import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { auctionRequests, playerShops, shopItems, bids } from "@/drizzle/schema";

import { and, isNull } from "drizzle-orm";
import { users } from "@/drizzle/schema";

export const auctionRouter = createTRPCRouter({
  createRequest: protectedProcedure
    .input(
      z.object({
        type: z.enum(["CRAFT", "REPAIR"]),
        details: z.string().min(10).max(500),
        price: z.number().int().min(1),
        itemId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { type, details, price, itemId } = input;
      const userId = ctx.auth.userId;

      // TODO: Validate if the item exists and is unequipped for repair requests

      await ctx.db.insert(auctionRequests).values({
        id: nanoid(),
        type,
        details,
        price,
        creatorId: userId,
        status: "PENDING",
        createdAt: new Date(),
      });

      return {
        success: true,
        message: "Request created successfully",
      };
    }),

  createShop: protectedProcedure
    .input(
      z.object({
        name: z.string().min(3).max(50),
        description: z.string().min(10).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { name, description } = input;
      const userId = ctx.auth.userId;

      // Check if user is a crafter or hunter
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.userId, userId),
      });

      if (!user || !["CRAFTER", "HUNTER"].includes(user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only crafters and hunters can create shops",
        });
      }

      // Check if user already has a shop
      const existingShop = await ctx.db.query.playerShops.findFirst({
        where: eq(playerShops.ownerId, userId),
      });

      if (existingShop) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have a shop",
        });
      }

      await ctx.db.insert(playerShops).values({
        id: nanoid(),
        name,
        description,
        ownerId: userId,
        createdAt: new Date(),
      });

      return {
        success: true,
        message: "Shop created successfully",
      };
    }),

  createBid: protectedProcedure
    .input(
      z.object({
        name: z.string().min(3).max(50),
        description: z.string().min(10).max(500),
        rewardType: z.enum(["ITEM", "MATERIAL", "OTHER"]),
        rewardDetails: z.string().min(10).max(500),
        startingPrice: z.number().int().min(1),
        closureDate: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        name,
        description,
        rewardType,
        rewardDetails,
        startingPrice,
        closureDate,
      } = input;
      const userId = ctx.auth.userId;

      // Validate closure date (1-3 days from now)
      const now = new Date();
      const minDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +1 day
      const maxDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 days

      if (closureDate < minDate || closureDate > maxDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bid closure must be between 1 and 3 days from now",
        });
      }

      await ctx.db.insert(bids).values({
        id: nanoid(),
        name,
        description,
        reward: {
          type: rewardType,
          details: rewardDetails,
        },
        startingPrice,
        closureDate,
        creatorId: userId,
        status: "ACTIVE",
        createdAt: new Date(),
      });

      return {
        success: true,
        message: "Bid created successfully",
      };
    }),

  getRequests: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit = 10, cursor } = input;

      const requests = await ctx.db.query.auctionRequests.findMany({
        limit: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: (requests, { desc }) => [desc(requests.createdAt)],
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (requests.length > limit) {
        const nextItem = requests.pop();
        nextCursor = nextItem?.id;
      }

      return {
        data: requests,
        nextCursor,
      };
    }),

  getShops: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit = 10, cursor } = input;

      const shops = await ctx.db.query.playerShops.findMany({
        limit: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: (shops, { desc }) => [desc(shops.createdAt)],
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (shops.length > limit) {
        const nextItem = shops.pop();
        nextCursor = nextItem?.id;
      }

      return {
        data: shops,
        nextCursor,
      };
    }),

  getShop: protectedProcedure
    .input(
      z.object({
        shopId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { shopId } = input;

      const shop = await ctx.db.query.playerShops.findFirst({
        where: eq(playerShops.id, shopId),
      });

      if (!shop) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shop not found",
        });
      }

      return shop;
    }),

  getShopItems: protectedProcedure
    .input(
      z.object({
        shopId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { shopId } = input;

      const items = await ctx.db.query.shopItems.findMany({
        where: eq(shopItems.shopId, shopId),
      });

      // TODO: Load item details from the items table

      return items;
    }),

  getBids: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit = 10, cursor, status } = input;

      const bids = await ctx.db.query.bids.findMany({
        limit: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        where: status ? eq(bids.status, status) : undefined,
        orderBy: (bids, { desc }) => [desc(bids.createdAt)],
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (bids.length > limit) {
        const nextItem = bids.pop();
        nextCursor = nextItem?.id;
      }

      return {
        data: bids,
        nextCursor,
      };
    }),

  updateShopNotice: protectedProcedure
    .input(
      z.object({
        notice: z.string().max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { notice } = input;
      const userId = ctx.auth.userId;

      const shop = await ctx.db.query.playerShops.findFirst({
        where: eq(playerShops.ownerId, userId),
      });

      if (!shop) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You don't have a shop",
        });
      }

      await ctx.db
        .update(playerShops)
        .set({ notice })
        .where(eq(playerShops.id, shop.id));

      return {
        success: true,
        message: "Shop notice updated successfully",
      };
    }),

  listItem: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        price: z.number().int().min(1),
        quantity: z.number().int().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { itemId, price, quantity } = input;
      const userId = ctx.auth.userId;

      const shop = await ctx.db.query.playerShops.findFirst({
        where: eq(playerShops.ownerId, userId),
      });

      if (!shop) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You don't have a shop",
        });
      }

      // TODO: Validate if user owns the item and it's tradable

      await ctx.db.insert(shopItems).values({
        id: nanoid(),
        shopId: shop.id,
        itemId,
        price,
        quantity,
      });

      return {
        success: true,
        message: "Item listed successfully",
      };
    }),

  removeItem: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { itemId } = input;
      const userId = ctx.auth.userId;

      const shop = await ctx.db.query.playerShops.findFirst({
        where: eq(playerShops.ownerId, userId),
      });

      if (!shop) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You don't have a shop",
        });
      }

      await ctx.db
        .delete(shopItems)
        .where(
          and(eq(shopItems.shopId, shop.id), eq(shopItems.itemId, itemId))
        );

      return {
        success: true,
        message: "Item removed successfully",
      };
    }),

  acceptRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { requestId } = input;
      const userId = ctx.auth.userId;

      // Check if user is a crafter or hunter
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.userId, userId),
      });

      if (!user || !["CRAFTER", "HUNTER"].includes(user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only crafters and hunters can accept requests",
        });
      }

      const request = await ctx.db.query.auctionRequests.findFirst({
        where: and(
          eq(auctionRequests.id, requestId),
          eq(auctionRequests.status, "PENDING")
        ),
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Request not found or already accepted",
        });
      }

      await ctx.db
        .update(auctionRequests)
        .set({
          status: "ACCEPTED",
          acceptedById: userId,
        })
        .where(eq(auctionRequests.id, requestId));

      return {
        success: true,
        message: "Request accepted successfully",
      };
    }),

  completeRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { requestId } = input;
      const userId = ctx.auth.userId;

      const request = await ctx.db.query.auctionRequests.findFirst({
        where: and(
          eq(auctionRequests.id, requestId),
          eq(auctionRequests.status, "ACCEPTED"),
          eq(auctionRequests.acceptedById, userId)
        ),
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Request not found or not accepted by you",
        });
      }

      await ctx.db
        .update(auctionRequests)
        .set({ status: "COMPLETED" })
        .where(eq(auctionRequests.id, requestId));

      // TODO: Handle payment transfer

      return {
        success: true,
        message: "Request completed successfully",
      };
    }),

  acceptBid: protectedProcedure
    .input(
      z.object({
        bidId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { bidId } = input;
      const userId = ctx.auth.userId;

      const bid = await ctx.db.query.bids.findFirst({
        where: and(
          eq(bids.id, bidId),
          eq(bids.status, "ACTIVE"),
          isNull(bids.acceptedById)
        ),
      });

      if (!bid) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bid not found or already accepted",
        });
      }

      await ctx.db
        .update(bids)
        .set({ acceptedById: userId })
        .where(eq(bids.id, bidId));

      return {
        success: true,
        message: "Bid accepted successfully",
      };
    }),

  completeBid: protectedProcedure
    .input(
      z.object({
        bidId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { bidId } = input;
      const userId = ctx.auth.userId;

      const bid = await ctx.db.query.bids.findFirst({
        where: and(
          eq(bids.id, bidId),
          eq(bids.status, "ACTIVE"),
          eq(bids.creatorId, userId)
        ),
      });

      if (!bid) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bid not found or not created by you",
        });
      }

      if (!bid.acceptedById) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bid has not been accepted yet",
        });
      }

      await ctx.db
        .update(bids)
        .set({ status: "COMPLETED" })
        .where(eq(bids.id, bidId));

      // TODO: Handle payment transfer

      return {
        success: true,
        message: "Bid completed successfully",
      };
    }),

  cancelBid: protectedProcedure
    .input(
      z.object({
        bidId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { bidId } = input;
      const userId = ctx.auth.userId;

      // Check if user is a moderator
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.userId, userId),
      });

      if (!user || !["MODERATOR", "ADMIN"].includes(user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only moderators can cancel bids",
        });
      }

      const bid = await ctx.db.query.bids.findFirst({
        where: eq(bids.id, bidId),
      });

      if (!bid) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bid not found",
        });
      }

      await ctx.db
        .update(bids)
        .set({ status: "CANCELLED" })
        .where(eq(bids.id, bidId));

      return {
        success: true,
        message: "Bid cancelled successfully",
      };
    }),
});
