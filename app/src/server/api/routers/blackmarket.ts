import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, sql, gt, and, asc, desc, isNull, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { fetchUser } from "./profile";
import { round } from "@/utils/math";
import { userData, ryoTrade, actionLog } from "@/drizzle/schema";
import { secondsFromDate } from "@/utils/time";
import { statSchema } from "@/libs/combat/types";
import { COST_RESET_STATS } from "@/drizzle/constants";
import { RYO_FOR_REP_DAYS_FROZEN } from "@/drizzle/constants";
import { COST_CUSTOM_TITLE } from "@/drizzle/constants";
import { COST_EXTRA_ITEM_SLOT } from "@/drizzle/constants";
import { COST_EXTRA_JUTSU_SLOT } from "@/drizzle/constants";
import { MAX_EXTRA_JUTSU_SLOTS } from "@/drizzle/constants";
import { COST_REROLL_ELEMENT } from "@/drizzle/constants";
import { RYO_FOR_REP_MAX_LISTINGS } from "@/drizzle/constants";
import { RYO_FOR_REP_MIN_REPS } from "@/drizzle/constants";
import { UserRanks, BasicElementName } from "@/drizzle/constants";
import { getRandomElement } from "@/utils/array";
import { baseServerResponse, errorResponse } from "../trpc";
import type { DrizzleClient } from "@/server/db";
import { canChangeContent } from "@/utils/permissions";

export const blackMarketRouter = createTRPCRouter({
  getRyoOffers: protectedProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100).nullish(),
        activeToggle: z.boolean().nullish(),
        creator: z.string().nullish(),
        buyer: z.string().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input?.cursor ? input.cursor : 0;
      const limit = input?.limit ? input.limit : 100;
      const skip = currentCursor * limit;
      const creator = alias(userData, "creator");
      const buyer = alias(userData, "buyer");
      const allowed = alias(userData, "allowed");
      const results = await ctx.drizzle
        .select({
          id: ryoTrade.id,
          creatorUserId: ryoTrade.creatorUserId,
          repsForSale: ryoTrade.repsForSale,
          requestedRyo: ryoTrade.requestedRyo,
          createdAt: ryoTrade.createdAt,
          ryoPerRep: ryoTrade.ryoPerRep,
          creatorUsername: creator.username,
          creatorAvatar: creator.avatar,
          purchaserUsername: buyer.username,
          purchaserAvatar: buyer.avatar,
          allowedUsername: allowed.username,
          allowedAvatar: allowed.avatar,
        })
        .from(ryoTrade)
        .innerJoin(creator, eq(ryoTrade.creatorUserId, creator.userId))
        .leftJoin(buyer, eq(ryoTrade.purchaserUserId, buyer.userId))
        .leftJoin(allowed, eq(ryoTrade.allowedPurchaserId, allowed.userId))
        .where(
          and(
            input.activeToggle
              ? isNull(ryoTrade.purchaserUserId)
              : isNotNull(ryoTrade.purchaserUserId),
            ...(input.creator ? [eq(creator.username, input.creator)] : []),
            ...(input.buyer ? [eq(buyer.username, input.buyer)] : []),
          ),
        )
        .orderBy((table) => [
          input.activeToggle ? asc(table.ryoPerRep) : desc(table.createdAt),
        ])
        .limit(limit)
        .offset(skip);
      const nextCursor = results.length < limit ? null : currentCursor + 1;
      return { data: results, nextCursor };
    }),
  getGraph: protectedProcedure.query(async ({ ctx }) => {
    const sender = alias(userData, "sender");
    const receiver = alias(userData, "receiver");
    const transfers = await ctx.drizzle
      .select({
        senderId: sender.userId,
        receiverId: receiver.userId,
        senderUsername: sender.username,
        receiverUsername: receiver.username,
        senderAvatar: sender.avatar,
        receiverAvatar: receiver.avatar,
        totalReps: sql<number>`SUM(${ryoTrade.repsForSale})`,
        totalRyo: sql<number>`SUM(${ryoTrade.requestedRyo})`,
      })
      .from(ryoTrade)
      .innerJoin(sender, eq(ryoTrade.creatorUserId, sender.userId))
      .innerJoin(receiver, eq(ryoTrade.purchaserUserId, receiver.userId))
      .where(isNotNull(ryoTrade.purchaserUserId))
      .groupBy(ryoTrade.creatorUserId, ryoTrade.purchaserUserId);
    return transfers;
  }),
  createOffer: protectedProcedure
    .input(
      z.object({
        reps: z.coerce.number().int().min(1),
        ryo: z.coerce.number().int().min(1),
        allowedUser: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, offers] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchActiveUserOffers(ctx.drizzle, ctx.userId),
      ]);
      // Guard
      if (user.reputationPoints - 5 < input.reps) {
        return errorResponse("Not enough reputation points");
      }
      if (input.reps < RYO_FOR_REP_MIN_REPS) {
        return errorResponse(
          `Reputation points must be at least ${RYO_FOR_REP_MIN_REPS}`,
        );
      }
      if (offers.length >= RYO_FOR_REP_MAX_LISTINGS) {
        return errorResponse(`You can only have ${RYO_FOR_REP_MAX_LISTINGS} offers`);
      }
      if (user.isBanned) return errorResponse("You are banned");
      if (input.reps <= 0) return errorResponse("Reps must be greater than 0");
      if (input.ryo <= 0) return errorResponse("Ryo must be greater than 0");
      if (input.ryo < input.reps) return errorResponse("Ryo must be greater than reps");
      // Deduce reputation points first
      const result = await ctx.drizzle
        .update(userData)
        .set({ reputationPoints: sql`${userData.reputationPoints} - ${input.reps}` })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            gt(userData.reputationPoints, input.reps),
          ),
        );
      if (result.rowsAffected === 0) {
        return errorResponse("Not enough reputation points");
      }
      // Add in the offer
      await ctx.drizzle.insert(ryoTrade).values({
        id: nanoid(),
        creatorUserId: ctx.userId,
        repsForSale: input.reps,
        requestedRyo: input.ryo,
        ryoPerRep: input.ryo / input.reps,
        allowedPurchaserId: input.allowedUser,
      });
      // Response
      return { success: true, message: "Offer created" };
    }),
  delistOffer: protectedProcedure
    .input(z.object({ offerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, offer] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchOffer(ctx.drizzle, input.offerId),
      ]);
      if (!offer) return errorResponse("Offer not found");
      // Derived
      const isTerr = user.username === "Terriator";
      const creatorId = offer?.creatorUserId;
      // Guard
      if (creatorId !== ctx.userId && !isTerr) return errorResponse("Not yours");
      // Check time
      const delistSeconds = 3600 * 24 * RYO_FOR_REP_DAYS_FROZEN;
      const delistDate = secondsFromDate(delistSeconds, offer.createdAt);
      const canDelist = new Date() >= delistDate || isTerr;
      if (!canDelist) return errorResponse("Offer is frozen");
      // Mutate
      await Promise.all([
        ctx.drizzle.delete(ryoTrade).where(eq(ryoTrade.id, input.offerId)),
        ctx.drizzle
          .update(userData)
          .set({
            reputationPoints: sql`${userData.reputationPoints} + ${offer.repsForSale}`,
          })
          .where(eq(userData.userId, creatorId)),
      ]);
      // Response
      return { success: true, message: "Offer delisted" };
    }),
  takeOffer: protectedProcedure
    .input(z.object({ offerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Query
      const [offer, user] = await Promise.all([
        fetchOffer(ctx.drizzle, input.offerId),
        fetchUser(ctx.drizzle, ctx.userId),
      ]);
      // Guard
      if (!offer) return errorResponse("Offer not found");
      if (offer.purchaserUserId) return errorResponse("Offer already taken");
      if (offer.creatorUserId === ctx.userId) return errorResponse("Your own offer");
      if (user.money < offer.requestedRyo) return errorResponse("Not enough ryo");
      if (offer.allowedPurchaserId && offer.allowedPurchaserId !== ctx.userId) {
        return errorResponse("You are not allowed to purchase this offer");
      }
      // Mutate
      const result = await ctx.drizzle
        .update(ryoTrade)
        .set({ purchaserUserId: ctx.userId })
        .where(eq(ryoTrade.id, input.offerId));
      if (result.rowsAffected === 0) {
        return errorResponse("Could not update offer");
      }
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({ money: sql`${userData.money} + ${offer.requestedRyo}` })
          .where(eq(userData.userId, offer.creatorUserId)),
        ctx.drizzle
          .update(userData)
          .set({
            money: sql`${userData.money} - ${offer.requestedRyo}`,
            reputationPoints: sql`${userData.reputationPoints} + ${offer.repsForSale}`,
          })
          .where(
            and(
              eq(userData.userId, ctx.userId),
              gt(userData.money, offer.requestedRyo),
            ),
          ),
      ]);
      // Response
      return {
        success: true,
        message: `Bought ${offer.repsForSale} reputation points for ${offer.requestedRyo} ryo.`,
      };
    }),
  // Update custom title
  updateCustomTitle: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(15) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Guard
      if (user.reputationPoints < COST_CUSTOM_TITLE) {
        return errorResponse("Not enough reputation points");
      }
      if (user.isBanned) return errorResponse("You are banned");
      // Mutate
      const result = await ctx.drizzle
        .update(userData)
        .set({
          customTitle: input.title,
          reputationPoints: sql`reputationPoints - ${COST_CUSTOM_TITLE}`,
        })
        .where(eq(userData.userId, ctx.userId));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could not update user" };
      } else {
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          changes: [`Custom title changed from ${user.customTitle} to ${input.title}`],
          relatedId: ctx.userId,
          relatedMsg: `Update: ${user.customTitle} -> ${input.title}`,
          relatedImage: user.avatar,
        });
        return { success: true, message: "Custom title updated" };
      }
    }),
  buyItemSlot: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      // Fetch
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Guard
      if (user.reputationPoints < COST_EXTRA_ITEM_SLOT) {
        return errorResponse("Not enough reputation points");
      }
      // Mutate
      const result = await ctx.drizzle
        .update(userData)
        .set({
          extraItemSlots: sql`extraItemSlots + 1`,
          reputationPoints: sql`reputationPoints - ${COST_EXTRA_ITEM_SLOT}`,
        })
        .where(eq(userData.userId, ctx.userId));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could not update user" };
      } else {
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          changes: ["Item slot purchased"],
          relatedId: ctx.userId,
          relatedMsg: "Update: Item slot purchased",
          relatedImage: user.avatar,
        });
        return { success: true, message: "Item slot purchased" };
      }
    }),
  buyJutsuSlot: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      // Fetch
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Guard
      if (user.reputationPoints < COST_EXTRA_JUTSU_SLOT) {
        return errorResponse("Not enough reputation points");
      }
      if (user.extraJutsuSlots >= MAX_EXTRA_JUTSU_SLOTS) {
        return errorResponse("Already maximum amount of extra jutsu slots");
      }
      // Mutate
      const result = await ctx.drizzle
        .update(userData)
        .set({
          extraJutsuSlots: sql`extraJutsuSlots + 1`,
          reputationPoints: sql`reputationPoints - ${COST_EXTRA_JUTSU_SLOT}`,
        })
        .where(eq(userData.userId, ctx.userId));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could not update user" };
      } else {
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          changes: ["Jutsu slot purchased"],
          relatedId: ctx.userId,
          relatedMsg: "Update: Jutsu slot purchased",
          relatedImage: user.avatar,
        });
        return { success: true, message: "Jutsu slot purchased" };
      }
    }),
  rerollElement: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      // Fetch
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Guard
      if (user.reputationPoints < COST_REROLL_ELEMENT) {
        return errorResponse("Not enough reputation points");
      }
      // Get the updated elements
      const rankId = UserRanks.findIndex((r) => r === user.rank);
      if (rankId >= 1) {
        const available = BasicElementName.filter((e) => e !== user.primaryElement);
        user.primaryElement = getRandomElement(available) ?? null;
      }
      if (user.secondaryElement) {
        const available = BasicElementName.filter(
          (e) => ![user.primaryElement, user.secondaryElement].includes(e),
        );
        user.secondaryElement = getRandomElement(available) ?? null;
      }
      // Mutate
      const result = await ctx.drizzle
        .update(userData)
        .set({
          primaryElement: user.primaryElement,
          secondaryElement: user.secondaryElement,
          reputationPoints: sql`reputationPoints - ${COST_REROLL_ELEMENT}`,
        })
        .where(eq(userData.userId, ctx.userId));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could not update user" };
      } else {
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          changes: ["Element rerolled"],
          relatedId: ctx.userId,
          relatedMsg: "Update: Element rerolled",
          relatedImage: user.avatar,
        });
        return { success: true, message: "Element rerolled" };
      }
    }),
  // Update stats
  updateStats: protectedProcedure
    .input(statSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const cost = canChangeContent(user.role) ? 0 : COST_RESET_STATS;
      if (user.reputationPoints < cost) {
        return { success: false, message: "Not enough reputation points" };
      }
      const inputSum = round(Object.values(input).reduce((a, b) => a + b, 0));
      const availableStats = round(user.experience + 120);
      if (inputSum !== availableStats) {
        const message = `Requested points ${inputSum} for not match experience points ${availableStats}`;
        return { success: false, message };
      }
      const result = await ctx.drizzle
        .update(userData)
        .set({
          ninjutsuOffence: input.ninjutsuOffence,
          taijutsuOffence: input.taijutsuOffence,
          genjutsuOffence: input.genjutsuOffence,
          bukijutsuOffence: input.bukijutsuOffence,
          ninjutsuDefence: input.ninjutsuDefence,
          taijutsuDefence: input.taijutsuDefence,
          genjutsuDefence: input.genjutsuDefence,
          bukijutsuDefence: input.bukijutsuDefence,
          strength: input.strength,
          speed: input.speed,
          intelligence: input.intelligence,
          willpower: input.willpower,
          reputationPoints: sql`reputationPoints - ${cost}`,
        })
        .where(eq(userData.userId, ctx.userId));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could not update user" };
      } else {
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          changes: [`User stats distribution changed`],
          relatedId: ctx.userId,
          relatedMsg: `Update: ${user.username} stats redistribution`,
          relatedImage: user.avatar,
        });
        return {
          success: true,
          message: `User stats updated for ${cost} reputation points`,
        };
      }
    }),
});

/**
 * Fetches a ryo offer from the black market.
 *
 * @param {DrizzleClient} client - The Drizzle client used to make the query.
 * @param {string} offerId - The ID of the offer to fetch.
 */
export const fetchOffer = async (client: DrizzleClient, offerId: string) => {
  return await client.query.ryoTrade.findFirst({
    where: eq(ryoTrade.id, offerId),
  });
};

/**
 * Fetches all offers created by a specific user.
 *
 * @param {DrizzleClient} client - The database client used to perform the query.
 * @param {string} userId - The ID of the user whose offers are to be fetched.
 * @returns {Promise<Array>} A promise that resolves to an array of offers created by the user.
 */
export const fetchActiveUserOffers = async (client: DrizzleClient, userId: string) => {
  return await client.query.ryoTrade.findMany({
    where: and(eq(ryoTrade.creatorUserId, userId), isNull(ryoTrade.purchaserUserId)),
  });
};
