import * as Sentry from "@sentry/nextjs";
import {
  and,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNull,
  like,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  AUCTION_BIDDER_LEVEL_MAX,
  AUCTION_BIDDER_LEVEL_MIN,
  AUCTION_HOUSE_MIN_LEVEL,
  auctionHouseLevelMessage,
} from "@/drizzle/constants";
import {
  actionLog,
  auctionBid,
  auctionListing,
  item,
  notification,
  userData,
  userItem,
} from "@/drizzle/schema";
import { getAuctionPriceError } from "@/libs/itemEconomy";
import {
  baseServerResponse,
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
} from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { deferPushToUsers } from "@/server/utils/push/defer";
import { tradeUpdate } from "@/server/utils/push/messages";
import type { QueryCondition } from "@/utils/typeutils";
import {
  createAuctionListingSchema,
  getAuctionListingsSchema,
} from "@/validators/auction";
import { auctionOfferProcedures } from "./auctionOffers";
import { splitItemStack } from "./item";
import { fetchUser } from "./profile";

export const auctionRouter = createTRPCRouter({
  ...auctionOfferProcedures,
  // Get single auction listing with all bids
  getAuctionListing: protectedProcedure
    .meta({
      mcp: { description: "Get auction listing details and bids" },
    })
    .input(z.object({ auctionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { auctionId } = input;

      const [listing, caller] = await Promise.all([
        ctx.drizzle.query.auctionListing.findFirst({
          where: eq(auctionListing.id, auctionId),
          with: {
            userItem: {
              with: {
                item: true,
                imbuements: {
                  with: {
                    item: true,
                  },
                },
              },
            },
            seller: {
              columns: {
                userId: true,
                username: true,
                avatar: true,
              },
            },
            targetUser: {
              columns: {
                userId: true,
                username: true,
                avatar: true,
              },
            },
            bids: {
              with: {
                bidder: {
                  columns: {
                    userId: true,
                    username: true,
                    avatar: true,
                  },
                },
              },
              orderBy: desc(auctionBid.createdAt),
            },
          },
        }),
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
          columns: { role: true },
        }),
      ]);

      if (
        listing &&
        caller?.role === "USER" &&
        listing.listingType === "DIRECT" &&
        listing.sellerId !== ctx.userId &&
        listing.targetUserId !== ctx.userId
      ) {
        return null;
      }

      return listing;
    }),

  // Get auction listings with pagination and filters
  getAuctionListings: protectedProcedure
    .meta({ mcp: { description: "Get paginated auction listings" } })
    .input(getAuctionListingsSchema)
    .query(async ({ ctx, input }) => {
      const {
        cursor,
        limit = 20,
        itemName,
        sellerSearch,
        listingType,
        minPrice,
        maxPrice,
        onlyMine,
        onlyBidOn,
        status,
      } = input;

      const listingCallerUser = alias(userData, "auctionListingCaller");
      const applyUserListingPrivacy = !onlyMine && !onlyBidOn;

      // Build where conditions
      const whereConditions: QueryCondition[] = [
        eq(auctionListing.status, status || "ACTIVE"),
      ];

      // Only filter by expire time for ACTIVE listings
      // Other statuses (SOLD, EXPIRED, CANCELLED) should show even after expiration
      if (status === "ACTIVE" || !status) {
        whereConditions.push(gte(auctionListing.expiresAt, new Date()));
      }

      if (onlyMine) {
        whereConditions.push(eq(auctionListing.sellerId, ctx.userId));
      }

      if (onlyBidOn) {
        whereConditions.push(eq(auctionListing.listingType, "AUCTION"));
        whereConditions.push(
          exists(
            ctx.drizzle
              .select({ id: auctionBid.id })
              .from(auctionBid)
              .where(
                and(
                  eq(auctionBid.auctionId, auctionListing.id),
                  eq(auctionBid.bidderId, ctx.userId),
                ),
              ),
          ),
        );
      } else if (listingType) {
        whereConditions.push(eq(auctionListing.listingType, listingType));
      }

      if (minPrice) {
        whereConditions.push(gte(auctionListing.currentPrice, minPrice));
      }

      if (maxPrice) {
        whereConditions.push(sql`${auctionListing.currentPrice} <= ${maxPrice}`);
      }

      // Add item name filter if provided
      if (itemName) {
        whereConditions.push(like(item.name, `%${itemName}%`));
      }

      const sellerSearchTrimmed = sellerSearch?.trim();
      const filterSellerByUsername = !!sellerSearchTrimmed;
      if (filterSellerByUsername) {
        whereConditions.push(like(userData.username, `%${sellerSearchTrimmed}%`));
      }

      if (applyUserListingPrivacy) {
        // Role/level read via join (no extra round-trip). Non-USER roles bypass both filters.
        // Direct: only parties. Auctions: level band or own listing.
        whereConditions.push(
          or(
            ne(listingCallerUser.role, "USER"),
            ne(auctionListing.listingType, "DIRECT"),
            eq(auctionListing.sellerId, ctx.userId),
            eq(auctionListing.targetUserId, ctx.userId),
          ),
        );
        whereConditions.push(
          or(
            ne(listingCallerUser.role, "USER"),
            ne(auctionListing.listingType, "AUCTION"),
            eq(auctionListing.sellerId, ctx.userId),
            and(
              eq(auctionListing.listingType, "AUCTION"),
              lte(auctionListing.bidderMinLevel, listingCallerUser.level),
              gte(auctionListing.bidderMaxLevel, listingCallerUser.level),
            ),
          ),
        );
      }

      // Get auction listings with joins for filtering
      const currentCursor = cursor ?? 0;
      const skip = currentCursor * limit;
      const whereClause = and(...whereConditions);

      let q = ctx.drizzle
        .select({ id: auctionListing.id })
        .from(auctionListing)
        .innerJoin(userItem, eq(auctionListing.userItemId, userItem.id))
        .innerJoin(item, eq(userItem.itemId, item.id));

      if (filterSellerByUsername) {
        q = q.innerJoin(userData, eq(auctionListing.sellerId, userData.userId));
      }
      if (applyUserListingPrivacy) {
        q = q.innerJoin(listingCallerUser, eq(listingCallerUser.userId, ctx.userId));
      }

      const listings = await q
        .where(whereClause)
        .orderBy(desc(auctionListing.expiresAt))
        .limit(limit)
        .offset(skip);

      // Fetch full related data for the filtered results
      const listingIds = listings.map((listing) => listing.id);
      const fullListings =
        listingIds.length > 0
          ? await ctx.drizzle.query.auctionListing.findMany({
              where: inArray(auctionListing.id, listingIds),
              with: {
                userItem: {
                  with: {
                    item: true,
                    imbuements: {
                      with: {
                        item: true,
                      },
                    },
                  },
                },
                seller: {
                  columns: {
                    userId: true,
                    username: true,
                    avatar: true,
                  },
                },
                targetUser: {
                  columns: {
                    userId: true,
                    username: true,
                    avatar: true,
                  },
                },
                bids: {
                  orderBy: desc(auctionBid.amount),
                  limit: 1,
                },
              },
              orderBy: desc(auctionListing.expiresAt),
            })
          : [];

      const nextCursor = listings.length < limit ? null : currentCursor + 1;
      return {
        data: fullListings,
        nextCursor,
      };
    }),

  // Create new auction listing
  createAuctionListing: protectedProcedure
    .meta({
      mcp: { description: "Create new auction listing for item" },
    })
    .input(createAuctionListingSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const {
        userItemId,
        listingType,
        startingPrice,
        buyoutPrice,
        durationHours,
        targetUserId,
        currencyType,
        quantity,
        bidderMinLevel,
        bidderMaxLevel,
      } = input;

      const storedBidderMinLevel =
        listingType === "AUCTION" ? bidderMinLevel : AUCTION_BIDDER_LEVEL_MIN;
      const storedBidderMaxLevel =
        listingType === "AUCTION" ? bidderMaxLevel : AUCTION_BIDDER_LEVEL_MAX;

      // Check if user item exists and get the item data
      const [userItemData, user, targetUser] = await Promise.all([
        ctx.drizzle.query.userItem.findFirst({
          where: and(
            eq(userItem.id, userItemId),
            eq(userItem.userId, ctx.userId),
            gt(userItem.quantity, 0),
            eq(userItem.equipped, "NONE"),
            eq(userItem.isInAuction, false),
            or(
              isNull(userItem.craftingFinishedAt),
              lt(userItem.craftingFinishedAt, new Date()),
            ),
          ),
          with: {
            item: true,
            imbuements: true,
          },
        }),
        fetchUser(ctx.drizzle, ctx.userId),
        listingType === "DIRECT" && targetUserId
          ? ctx.drizzle.query.userData.findFirst({
              where: eq(userData.userId, targetUserId),
              columns: { userId: true },
            })
          : Promise.resolve(undefined),
      ]);
      // Guard
      if (!userItemData) {
        return errorResponse("User item not found or not available");
      }
      if (user.isBanned) {
        return errorResponse("You are banned");
      }
      if (user.isTradeBanned) {
        return errorResponse("You are banned from trading");
      }
      if (user.level < AUCTION_HOUSE_MIN_LEVEL) {
        return errorResponse(auctionHouseLevelMessage);
      }
      if (userItemData.equipped !== "NONE") {
        return errorResponse("Item is currently equipped");
      }
      if (userItemData.isInAuction) {
        return errorResponse("Item is already in auction");
      }
      if (!userItemData.item.canBeTraded) {
        return errorResponse("Item is not tradable");
      }
      if (buyoutPrice && buyoutPrice <= startingPrice) {
        return errorResponse("Buyout price must be greater than starting price");
      }

      // Validate the recipient before splitting any of the sender's inventory.
      if (listingType === "DIRECT") {
        if (!targetUserId) {
          return errorResponse("Target user must be specified for direct listings");
        }
        if (!targetUser) {
          return errorResponse("Target user not found");
        }
        if (targetUserId === ctx.userId) {
          return errorResponse("You cannot create a direct listing for yourself");
        }
      }

      // Handle quantity splitting for stackable items
      const listingQuantity = quantity ?? userItemData.quantity;
      for (const price of [startingPrice, buyoutPrice]) {
        if (price === undefined) continue;
        const priceError = getAuctionPriceError(
          userItemData.item,
          listingType,
          price,
          listingQuantity,
          currencyType,
        );
        if (priceError) return errorResponse(priceError);
      }
      let auctionUserItemId = userItemId;
      if (quantity !== undefined) {
        // Validate quantity is provided for stackable items
        if (!userItemData.item.canStack) {
          return errorResponse("Quantity can only be specified for stackable items");
        }

        // Validate quantity range
        if (quantity < 1 || quantity > userItemData.quantity) {
          return errorResponse(
            `Quantity must be between 1 and ${userItemData.quantity}`,
          );
        }

        // If quantity equals the full stack, use the existing item
        if (quantity === userItemData.quantity) {
          // Use the existing item, no splitting needed
          auctionUserItemId = userItemId;
        } else {
          // Use the convenience method to split the stack
          const quantityToKeep = userItemData.quantity - quantity;
          const result = await splitItemStack(
            ctx.drizzle,
            userItemId,
            ctx.userId,
            quantityToKeep,
            userItemData.quantity,
          );

          if (!result.success) {
            return errorResponse(result.message);
          }

          // Use the new item for the auction
          auctionUserItemId = result.newUserItemId;
        }
      }

      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + durationHours);

      // Reserve only unequipped items; combat can have captured an item equipped since preload.
      // Also require no active imbuement at write time.
      // Pin the reservation to the priced quantity, including the actual split result.
      // This also excludes negative merge claims and zero-quantity merge tombstones.
      const markInAuctionResult = await ctx.drizzle
        .update(userItem)
        .set({
          isInAuction: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userItem.id, auctionUserItemId),
            eq(userItem.userId, ctx.userId),
            eq(userItem.quantity, listingQuantity),
            gt(userItem.quantity, 0),
            eq(userItem.equipped, "NONE"),
            eq(userItem.isInAuction, false),
            sql`NOT EXISTS (SELECT 1 FROM UserItemImbuement WHERE UserItemImbuement.userItemId = ${auctionUserItemId} AND UserItemImbuement.craftingFinishedAt > NOW())`,
          ),
        );
      if (markInAuctionResult.rowsAffected === 0) {
        return errorResponse(
          "Item quantity or availability changed, or item is being imbued; please refresh and try again",
        );
      }

      // Create the auction listing
      const auctionId = nanoid();
      await Promise.all([
        ctx.drizzle.insert(auctionListing).values({
          id: auctionId,
          sellerId: ctx.userId,
          userItemId: auctionUserItemId,
          listingType,
          targetUserId: targetUserId || null,
          startingPrice,
          buyoutPrice: buyoutPrice || null,
          currentPrice: startingPrice,
          currencyType,
          expiresAt,
          bidderMinLevel: storedBidderMinLevel,
          bidderMaxLevel: storedBidderMaxLevel,
        }),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "auctionListing",
          changes: JSON.stringify({
            action: "CREATE_AUCTION",
            userItemId: auctionUserItemId,
            originalUserItemId: userItemId,
            itemId: userItemData.itemId,
            quantity: listingQuantity,
            startingPrice,
            buyoutPrice,
            expiresAt,
            bidderMinLevel: storedBidderMinLevel,
            bidderMaxLevel: storedBidderMaxLevel,
          }),
          relatedId: auctionId,
        }),
      ]);

      return { success: true, message: "Auction listing created successfully" };
    }),

  // Place bid on auction
  placeBid: protectedProcedure
    .meta({ mcp: { description: "Place bid on auction listing" } })
    .input(
      z.object({
        auctionId: z.string(),
        amount: z.number().int().min(1),
      }),
    )
    .output(baseServerResponse.extend({ amountToDeduct: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { auctionId, amount } = input;

      // Query
      const [auction, user] = await Promise.all([
        fetchAuctionListing(ctx.drizzle, auctionId),
        fetchUser(ctx.drizzle, ctx.userId),
      ]);

      // Guard
      if (!auction) {
        return errorResponse("Auction not found");
      }
      if (auction.status !== "ACTIVE" || auction.expiresAt < new Date()) {
        return errorResponse("Auction has expired or is not active");
      }
      if (auction.sellerId === ctx.userId) {
        return errorResponse("You cannot bid on your own auction");
      }
      if (auction.targetUserId && auction.targetUserId !== ctx.userId) {
        return errorResponse("This auction is restricted to a specific user");
      }
      if (user.isBanned) {
        return errorResponse("You are banned");
      }
      if (user.isTradeBanned) {
        return errorResponse("You are banned from trading");
      }
      if (user.level < AUCTION_HOUSE_MIN_LEVEL) {
        return errorResponse(auctionHouseLevelMessage);
      }
      if (auction.listingType === "AUCTION") {
        if (
          user.level < auction.bidderMinLevel ||
          user.level > auction.bidderMaxLevel
        ) {
          return errorResponse(
            `This auction is only open to characters between level ${auction.bidderMinLevel} and ${auction.bidderMaxLevel}.`,
          );
        }
      }
      if (amount <= auction.currentPrice) {
        return errorResponse("Bid must be higher than current price");
      }

      // Check if user has an existing bid
      const existingBid = auction.bids.find((bid) => bid.bidderId === ctx.userId);
      if (
        existingBid &&
        (existingBid.status !== "ACTIVE" || amount <= existingBid.amount)
      ) {
        return errorResponse("Bid must raise your existing active bid; please refresh");
      }
      const amountToDeduct = existingBid ? amount - existingBid.amount : amount;

      // Validate user has enough currency for the bid raise
      if (auction.currencyType === "MONEY") {
        if (user.bank < amountToDeduct) {
          return errorResponse("Insufficient funds in bank");
        }
      } else {
        if (user.reputationPoints < amountToDeduct) {
          return errorResponse("Insufficient reputation points");
        }
      }

      // Check if bid meets or exceeds buyout price
      const isBuyoutBid = auction.buyoutPrice != null && amount >= auction.buyoutPrice;

      let outbidUserId: string | null = null;
      if (auction.bids.length > 0) {
        const sortedBids = [...auction.bids].sort((a, b) => b.amount - a.amount);
        const [previousTopBid] = sortedBids;
        if (
          previousTopBid !== undefined &&
          previousTopBid.bidderId !== ctx.userId &&
          (amount > previousTopBid.amount || isBuyoutBid)
        ) {
          outbidUserId = previousTopBid.bidderId;
        }
      }

      const itemLabel = auction.userItem?.item?.name ?? "An auction lot";
      const bidId = existingBid?.id ?? nanoid();
      const updatedAt = new Date();
      const bidLog = {
        id: nanoid(),
        userId: ctx.userId,
        tableName: "auctionBid",
        changes: JSON.stringify(
          existingBid
            ? {
                action: "RAISE_BID",
                auctionId,
                previousAmount: existingBid.amount,
                newAmount: amount,
              }
            : { action: "PLACE_BID", auctionId, amount },
        ),
        relatedId: bidId,
      };
      const outbidNotification =
        outbidUserId === null
          ? null
          : {
              userId: outbidUserId,
              content: isBuyoutBid
                ? `Someone bought out "${itemLabel}" — you were the previous high bidder.`
                : `You were outbid on "${itemLabel}" in the auction.`,
            };
      const listingGuard = and(
        eq(auctionListing.id, auction.id),
        eq(auctionListing.status, "ACTIVE"),
        eq(auctionListing.currentPrice, auction.currentPrice),
        eq(auctionListing.currencyType, auction.currencyType),
        gt(auctionListing.expiresAt, sql`CURRENT_TIMESTAMP(3)`),
        // A committed buyout cannot be overtaken while settlement starts.
        or(
          isNull(auctionListing.buyoutPrice),
          lt(auctionListing.currentPrice, auctionListing.buyoutPrice),
        ),
      );
      const bidderGuard = and(
        eq(userData.userId, ctx.userId),
        eq(userData.isBanned, false),
        eq(userData.isTradeBanned, false),
        gte(userData.level, AUCTION_HOUSE_MIN_LEVEL),
        auction.listingType === "AUCTION"
          ? and(
              gte(userData.level, auction.bidderMinLevel),
              lte(userData.level, auction.bidderMaxLevel),
            )
          : undefined,
        auction.currencyType === "MONEY"
          ? gte(userData.bank, amountToDeduct)
          : gte(userData.reputationPoints, amountToDeduct),
      );
      const bidGuard = existingBid
        ? and(
            eq(auctionBid.id, existingBid.id),
            eq(auctionBid.auctionId, auction.id),
            eq(auctionBid.bidderId, ctx.userId),
            eq(auctionBid.status, "ACTIVE"),
            eq(auctionBid.amount, existingBid.amount),
          )
        : undefined;

      const balance =
        auction.currencyType === "MONEY" ? userData.bank : userData.reputationPoints;
      // Drizzle has no multi-table UPDATE builder. Keep the listing first to match
      // settlement's lock order; one statement couples all three existing rows.
      const raiseStatement = existingBid
        ? sql`
            UPDATE ${auctionListing}
            STRAIGHT_JOIN ${auctionBid} ON ${auctionBid.auctionId} = ${auctionListing.id}
              AND ${auctionBid.id} = ${existingBid.id}
            STRAIGHT_JOIN ${userData} ON ${userData.userId} = ${auctionBid.bidderId}
            SET ${auctionListing.currentPrice} = ${amount},
                ${auctionListing.updatedAt} = ${updatedAt},
                ${auctionBid.amount} = ${amount},
                ${balance} = ${balance} - ${amountToDeduct}
            WHERE ${and(listingGuard, bidderGuard, bidGuard)}
          `
        : null;
      if (raiseStatement && !isBuyoutBid) {
        const raised = await retryOnDeadlock(() => ctx.drizzle.execute(raiseStatement));
        if (raised.rowsAffected === 0)
          return errorResponse(
            "Auction, bid or balance changed; please refresh and try again",
          );

        // Activity failures must not turn a committed raise into a failed response.
        // Report them separately, as with training logs.
        await recordBidActivity(ctx.drizzle, bidLog, outbidNotification, true);
        return { success: true, message: "Bid raised successfully", amountToDeduct };
      }

      try {
        // A first bid needs an INSERT alongside the guarded debit and listing update.
        // Buyouts keep escrow on the transaction path for atomic delivery and refunds.
        const settlement = await retryOnDeadlock(() =>
          ctx.drizzle.transaction(async (tx) => {
            if (raiseStatement) {
              const raised = await tx.execute(raiseStatement);
              requireBidWrite(
                raised.rowsAffected,
                "Auction, bid or balance changed; please refresh and try again",
              );
            } else {
              const claim = await tx
                .update(auctionListing)
                .set({ currentPrice: amount, updatedAt })
                .where(listingGuard);
              requireBidWrite(
                claim.rowsAffected,
                "Auction changed; please refresh and try again",
              );

              const debit = await tx
                .update(userData)
                .set(
                  auction.currencyType === "MONEY"
                    ? { bank: sql`${userData.bank} - ${amountToDeduct}` }
                    : {
                        reputationPoints: sql`${userData.reputationPoints} - ${amountToDeduct}`,
                      },
                )
                .where(bidderGuard);
              requireBidWrite(
                debit.rowsAffected,
                "Balance or trading access changed; please refresh and try again",
              );

              await tx
                .insert(auctionBid)
                .values({ id: bidId, auctionId, bidderId: ctx.userId, amount });
            }
            await recordBidActivity(tx, bidLog, outbidNotification);
            // Buyout escrow, delivery and every payment share this commit.
            return isBuyoutBid ? settleAuction(tx, auction.id, ctx.userId) : null;
          }),
        );
        if (settlement) {
          notifyAuctionSettlement(ctx.drizzle, settlement);
          return { success: true, message: "Buyout successful - auction completed" };
        }
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === "AuctionBidConflict" ||
            error.name === "AuctionSettlementConflict")
        )
          return errorResponse(error.message);
        throw error;
      }

      return {
        success: true,
        message: existingBid ? "Bid raised successfully" : "Bid placed successfully",
        amountToDeduct,
      };
    }),

  // Complete auction (transfer userItem to winner)
  completeAuction: protectedProcedure
    .meta({ mcp: { description: "Complete expired auction" } })
    .input(z.object({ auctionId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { auctionId } = input;

      return completeAuctionInternal(ctx.drizzle, auctionId);
    }),

  // Cancel listing (seller only, no bids — atomic guard so a race cannot cancel after a bid)
  cancelAuction: protectedProcedure
    .meta({
      mcp: { description: "Cancel your auction listing with no bids" },
    })
    .input(z.object({ auctionId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { auctionId } = input;

      const auction = await ctx.drizzle.query.auctionListing.findFirst({
        where: and(
          eq(auctionListing.id, auctionId),
          eq(auctionListing.sellerId, ctx.userId),
        ),
        columns: {
          userItemId: true,
          status: true,
        },
      });

      if (!auction) {
        return errorResponse("Listing not found");
      }
      if (auction.status !== "ACTIVE") {
        return errorResponse("Listing is not active");
      }

      // One guarded statement cancels the listing and clears isInAuction atomically.
      const cancelRes = await ctx.drizzle.execute(sql`
        UPDATE \`AuctionListing\` AS al
        INNER JOIN \`UserItem\` AS ui ON ui.\`id\` = al.\`userItemId\`
        SET al.\`status\` = 'CANCELLED',
            al.\`updatedAt\` = CURRENT_TIMESTAMP(3),
            ui.\`isInAuction\` = 0,
            ui.\`updatedAt\` = CURRENT_TIMESTAMP(3)
        WHERE al.\`id\` = ${auctionId}
          AND al.\`sellerId\` = ${ctx.userId}
          AND al.\`status\` = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM \`AuctionBid\` AS ab WHERE ab.\`auctionId\` = al.\`id\`
          )
      `);

      const cancelledRows = Number(cancelRes.rowsAffected ?? 0);
      if (cancelledRows === 0) {
        const anyBid = await ctx.drizzle.query.auctionBid.findFirst({
          where: eq(auctionBid.auctionId, auctionId),
          columns: { id: true },
        });
        if (anyBid) {
          return errorResponse("Cannot cancel: a bid was placed on this listing");
        }
        return errorResponse("Could not cancel listing");
      }

      await ctx.drizzle.insert(actionLog).values({
        id: nanoid(),
        userId: ctx.userId,
        tableName: "auctionListing",
        changes: JSON.stringify({
          action: "CANCEL_AUCTION",
          auctionId,
          userItemId: auction.userItemId,
        }),
        relatedId: auctionId,
      });

      return {
        success: true,
        message: "Listing cancelled — the item is back in your inventory.",
      };
    }),
});

/**
 * Fetch an auction listing with bids
 * @param drizzle - Drizzle client
 * @param auctionId - Auction ID
 * @returns - Auction listing with bids
 */
export const fetchAuctionListing = async (
  drizzle: Pick<DrizzleClient, "query">,
  auctionId: string,
) => {
  const auction = await drizzle.query.auctionListing.findFirst({
    where: eq(auctionListing.id, auctionId),
    with: {
      bids: true,
      userItem: {
        with: {
          item: {
            columns: { name: true },
          },
        },
      },
      targetUser: {
        columns: {
          userId: true,
          username: true,
          avatar: true,
        },
      },
    },
  });

  return auction;
};

/** Settle expiration and buyout through the same atomic listing claim. */
export const completeAuctionInternal = async (
  drizzle: DrizzleClient,
  auctionId: string,
  winnerId?: string,
) => {
  try {
    const settlement = await retryOnDeadlock(() =>
      drizzle.transaction((tx) => settleAuction(tx, auctionId, winnerId)),
    );
    notifyAuctionSettlement(drizzle, settlement);
    return settlement;
  } catch (error) {
    if (error instanceof Error && error.name === "AuctionSettlementConflict")
      return { ...errorResponse(error.message), winningBid: null };
    throw error;
  }
};

/** Shares the bid transaction so a buyout debit and settlement commit together. */
const settleAuction = async (
  tx: AuctionTransaction,
  auctionId: string,
  winnerId?: string,
) => {
  const now = new Date();
  // All bid writers must claim this listing before publishing their bid. The status
  // transition holds its row lock until delivery and every escrow payment commit.
  const claim = await tx
    .update(auctionListing)
    .set({ status: "SOLD", updatedAt: now })
    .where(
      and(
        eq(auctionListing.id, auctionId),
        eq(auctionListing.status, "ACTIVE"),
        winnerId ? undefined : lte(auctionListing.expiresAt, now),
      ),
    );
  requireAuctionSettlementWrite(
    claim.rowsAffected,
    "Auction is no longer active or has not expired yet; please refresh",
  );

  // Read only after claiming: callers may have fetched before another bid committed.
  const auction = await fetchAuctionListing(tx, auctionId);
  if (!auction) return throwAuctionSettlementConflict("Auction not found");
  if (auction.bids.some((bid) => bid.status !== "ACTIVE" || bid.amount <= 0))
    throwAuctionSettlementConflict("Auction escrow is inconsistent; contact support");
  const [winningBid] = [...auction.bids].sort(
    (a, b) =>
      b.amount - a.amount ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  if (
    winnerId &&
    (!winningBid ||
      winningBid.bidderId !== winnerId ||
      auction.buyoutPrice === null ||
      winningBid.amount < auction.buyoutPrice)
  )
    throwAuctionSettlementConflict("Buyout bid is no longer available; please refresh");

  const delivery = await tx
    .update(userItem)
    .set({
      isInAuction: false,
      updatedAt: now,
      ...(winningBid
        ? {
            userId: winningBid.bidderId,
            // The recipient chooses their own unlocked cosmetic and room placement.
            activeVariantId: null,
            storedAtHome: false,
            homeX: null,
            homeY: null,
            homeRotation: 0,
          }
        : {}),
    })
    .where(
      and(
        eq(userItem.id, auction.userItemId),
        eq(userItem.userId, auction.sellerId),
        eq(userItem.isInAuction, true),
        gt(userItem.quantity, 0),
      ),
    );
  requireAuctionSettlementWrite(
    delivery.rowsAffected,
    "Reserved auction item is unavailable",
  );

  const refunds = auction.bids.filter((bid) => bid.id !== winningBid?.id);
  const credits = new Map<string, number>();
  if (winningBid) credits.set(auction.sellerId, winningBid.amount);
  for (const bid of refunds)
    credits.set(bid.bidderId, (credits.get(bid.bidderId) ?? 0) + bid.amount);
  if (winningBid && !credits.has(winningBid.bidderId))
    credits.set(winningBid.bidderId, 0);
  if (credits.size) {
    const accounts = [...credits].sort(([a], [b]) => a.localeCompare(b));
    const amounts = sql`CASE ${userData.userId} ${sql.join(
      accounts.map(([id, amount]) => sql`WHEN ${id} THEN ${amount}`),
      sql` `,
    )} ELSE 0 END`;
    // One payment statement keeps settlement bounded even with many losing bids.
    // Touch the winner too, so a missing recipient rolls back the item transfer.
    const payment = await tx
      .update(userData)
      .set({
        ...(auction.currencyType === "MONEY"
          ? { bank: sql`${userData.bank} + ${amounts}` }
          : { reputationPoints: sql`${userData.reputationPoints} + ${amounts}` }),
        updatedAt: sql`GREATEST(CURRENT_TIMESTAMP(3), TIMESTAMPADD(MICROSECOND, 1000, ${userData.updatedAt}))`,
      })
      .where(
        inArray(
          userData.userId,
          accounts.map(([id]) => id),
        ),
      );
    if (payment.rowsAffected !== credits.size)
      throwAuctionSettlementConflict("Auction recipient account is unavailable");
  }
  if (winningBid) {
    const won = await tx
      .update(auctionBid)
      .set({ status: "WON" })
      .where(and(eq(auctionBid.id, winningBid.id), eq(auctionBid.status, "ACTIVE")));
    requireAuctionSettlementWrite(
      won.rowsAffected,
      "Winning bid changed; please refresh",
    );
  }
  if (refunds.length) {
    const refunded = await tx
      .update(auctionBid)
      .set({ status: "REFUNDED" })
      .where(
        and(
          inArray(
            auctionBid.id,
            refunds.map((bid) => bid.id),
          ),
          eq(auctionBid.status, "ACTIVE"),
        ),
      );
    if (refunded.rowsAffected !== refunds.length)
      throwAuctionSettlementConflict("Refund bids changed; please refresh");
  }
  await tx
    .update(auctionListing)
    .set({
      status: winningBid ? "SOLD" : "EXPIRED",
      buyerId: winningBid?.bidderId ?? null,
      ...(winningBid ? { expiresAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(auctionListing.id, auctionId));

  return {
    success: true,
    message: winningBid
      ? "Auction completed successfully"
      : "Auction expired with no bids",
    winningBid: winningBid ?? null,
    auctionId,
    participantIds: [auction.sellerId, ...auction.bids.map((bid) => bid.bidderId)],
  };
};

const notifyAuctionSettlement = (
  drizzle: DrizzleClient,
  settlement: Awaited<ReturnType<typeof settleAuction>>,
) =>
  deferPushToUsers(
    drizzle,
    settlement.participantIds,
    tradeUpdate(settlement.auctionId),
  );

const throwAuctionSettlementConflict = (message: string): never => {
  throw Object.assign(new Error(message), { name: "AuctionSettlementConflict" });
};

const requireBidWrite = (rowsAffected: number, message: string) => {
  // A successful joined raise changes three rows; first-bid writes target one primary key.
  if (rowsAffected === 0)
    throw Object.assign(new Error(message), { name: "AuctionBidConflict" });
};

/** Activity is ancillary after a standalone raise; inside a bid transaction errors abort it. */
const recordBidActivity = async (
  client: Pick<DrizzleClient, "insert" | "update">,
  log: typeof actionLog.$inferInsert,
  outbid: typeof notification.$inferInsert | null,
  hasCommitted = false,
) => {
  const writes = [
    async () => client.insert(actionLog).values(log),
    ...(outbid
      ? [
          async () => {
            await client.insert(notification).values(outbid);
            await client
              .update(userData)
              .set({ unreadNotifications: sql`${userData.unreadNotifications} + 1` })
              .where(eq(userData.userId, outbid.userId));
          },
        ]
      : []),
  ];
  if (!hasCommitted) {
    // Finish each write before the transaction can roll back; no queued continuation
    // may run against its connection after the rollback has released it.
    for (const write of writes) await write();
    return;
  }
  await Promise.all(
    writes.map(async (write) => {
      try {
        await write();
      } catch (error) {
        Sentry.captureException(error, {
          tags: { source: "auctionBidActivity" },
          extra: { bidId: log.relatedId },
        });
      }
    }),
  );
};

const requireAuctionSettlementWrite = (rowsAffected: number, message: string) => {
  if (rowsAffected !== 1) throwAuctionSettlementConflict(message);
};

type AuctionTransaction = Parameters<Parameters<DrizzleClient["transaction"]>[0]>[0];
