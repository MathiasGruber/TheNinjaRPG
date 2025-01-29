import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { auctionRequests, playerShops, shopItems, bids } from "@/drizzle/schema";

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
});
