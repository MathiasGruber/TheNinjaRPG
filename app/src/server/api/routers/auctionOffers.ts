import { and, desc, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { AUCTION_HOUSE_MIN_LEVEL, auctionHouseLevelMessage } from "@/drizzle/constants";
import {
  actionLog,
  auctionOffer,
  item,
  type UserItem,
  type UserItemWithRelations,
  userData,
  userItem,
} from "@/drizzle/schema";
import { getAuctionPriceError } from "@/libs/itemEconomy";
import {
  baseServerResponse,
  errorResponse,
  protectedProcedure,
} from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import {
  acceptAuctionOfferSchema,
  auctionOfferIdSchema,
  createAuctionOfferSchema,
  getAuctionOffersSchema,
} from "@/validators/auction";

type OfferTransaction = Parameters<Parameters<DrizzleClient["transaction"]>[0]>[0];

export const auctionOfferProcedures = {
  getAuctionOfferItems: protectedProcedure.query(({ ctx }) =>
    ctx.drizzle.query.item.findMany({
      where: and(eq(item.canBeTraded, true), eq(item.hidden, false)),
      columns: {
        id: true,
        name: true,
        image: true,
        itemType: true,
        canStack: true,
        auctionMinPrice: true,
        auctionMaxPrice: true,
      },
      orderBy: (table, { asc }) => [asc(table.name)],
    }),
  ),

  getAuctionOffers: protectedProcedure
    .input(getAuctionOffersSchema)
    .query(async ({ ctx, input }) => {
      const rows = await ctx.drizzle.query.auctionOffer.findMany({
        where: and(
          eq(auctionOffer.offerType, input.offerType),
          eq(auctionOffer.status, input.status),
          input.onlyMine ? eq(auctionOffer.ownerId, ctx.userId) : undefined,
          input.search.trim()
            ? sql`EXISTS (SELECT 1 FROM Item WHERE Item.id = ${auctionOffer.requestedItemId} AND Item.name LIKE ${`%${input.search.trim()}%`})`
            : undefined,
        ),
        with: {
          owner: { columns: { userId: true, username: true } },
          requestedItem: true,
          offeredUserItem: {
            with: { item: true, imbuements: { with: { item: true } } },
          },
        },
        orderBy: [desc(auctionOffer.createdAt), desc(auctionOffer.id)],
        offset: (input.cursor ?? 0) * input.limit,
        limit: input.limit + 1,
      });
      return {
        data: rows.slice(0, input.limit),
        nextCursor: rows.length > input.limit ? (input.cursor ?? 0) + 1 : null,
      };
    }),

  createAuctionOffer: protectedProcedure
    .input(createAuctionOfferSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [user, requested, offered] = await Promise.all([
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
        }),
        ctx.drizzle.query.item.findFirst({ where: eq(item.id, input.requestedItemId) }),
        input.offerType === "TRADE"
          ? fetchOfferItem(ctx.drizzle, input.offeredUserItemId, ctx.userId)
          : Promise.resolve(undefined),
      ]);
      const userError = offerUserError(user);
      if (userError) return errorResponse(userError);
      if (!requested?.canBeTraded || requested.hidden)
        return errorResponse("Requested item is not tradable");
      if (input.offerType === "REQUEST" && requested.itemType !== "MATERIAL")
        return errorResponse("Ryo requests are for materials");
      if (!requested.canStack && input.requestedQuantity !== 1)
        return errorResponse("Non-stackable items must have quantity 1");
      if (input.offerType === "REQUEST") {
        const priceError = getAuctionPriceError(
          requested,
          "AUCTION",
          input.ryo,
          input.requestedQuantity,
          "MONEY",
        );
        if (priceError) return errorResponse(priceError);
      } else {
        const itemError = offerItemError(offered, input.offeredQuantity);
        if (itemError) return errorResponse(itemError);
      }
      const id = nanoid();
      return runOfferMutation(ctx.drizzle, async (tx) => {
        let offeredUserItemId: string | null = null;
        if (input.offerType === "REQUEST") {
          const debit = await tx
            .update(userData)
            .set({ bank: sql`${userData.bank} - ${input.ryo}`, updatedAt: new Date() })
            .where(and(eligibleOfferUser(ctx.userId), gte(userData.bank, input.ryo)));
          requireOfferWrite(
            debit.rowsAffected,
            "Insufficient funds in bank or trading access changed",
          );
        } else if (offered) {
          await claimOfferUser(tx, ctx.userId);
          offeredUserItemId = await moveOfferItem(
            tx,
            offered,
            input.offeredQuantity,
            ctx.userId,
            true,
          );
        }
        await tx.insert(auctionOffer).values({
          id,
          ownerId: ctx.userId,
          offerType: input.offerType,
          requestedItemId: input.requestedItemId,
          requestedQuantity: input.requestedQuantity,
          offeredUserItemId,
          offeredQuantity: input.offerType === "TRADE" ? input.offeredQuantity : null,
          ryo: input.offerType === "REQUEST" ? input.ryo : 0,
        });
        await logOffer(tx, ctx.userId, id, "CREATE", input);
        return {
          success: true,
          message: "Offer posted; your payment is reserved until accepted or cancelled",
        };
      });
    }),

  acceptAuctionOffer: protectedProcedure
    .input(acceptAuctionOfferSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [offer, accepter, supplied] = await Promise.all([
        ctx.drizzle.query.auctionOffer.findFirst({
          where: eq(auctionOffer.id, input.offerId),
          with: {
            owner: true,
            requestedItem: true,
            offeredUserItem: {
              with: { item: true, imbuements: { with: { item: true } } },
            },
          },
        }),
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
        }),
        fetchOfferItem(ctx.drizzle, input.userItemId, ctx.userId),
      ]);
      if (offer?.status !== "ACTIVE") return errorResponse("Offer is no longer active");
      if (offer.ownerId === ctx.userId)
        return errorResponse("You cannot accept your own offer");
      const userError = offerUserError(accepter) ?? offerUserError(offer.owner);
      if (userError) return errorResponse(userError);
      if (
        !offer.requestedItem?.canBeTraded ||
        supplied?.itemId !== offer.requestedItemId
      )
        return errorResponse("Choose the requested item from your inventory");
      const itemError = offerItemError(supplied, offer.requestedQuantity);
      if (itemError) return errorResponse(itemError);
      if (
        offer.offerType === "TRADE" &&
        (!offer.offeredUserItem?.item.canBeTraded ||
          !offer.offeredUserItem.isInAuction ||
          offer.offeredUserItem.userId !== offer.ownerId ||
          offer.offeredUserItem.quantity !== offer.offeredQuantity)
      )
        return errorResponse("Offered item is no longer available");
      if (!supplied) return errorResponse("Item is unavailable");
      return runOfferMutation(ctx.drizzle, async (tx) => {
        // Claim the offer before either side moves. Every subsequent write rolls back on conflict.
        const claim = await tx
          .update(auctionOffer)
          .set({ status: "SOLD", accepterId: ctx.userId, updatedAt: new Date() })
          .where(and(eq(auctionOffer.id, offer.id), eq(auctionOffer.status, "ACTIVE")));
        requireOfferWrite(
          claim.rowsAffected,
          "Offer was accepted or cancelled; please refresh",
        );
        // Stable account order keeps concurrent exchanges from taking opposite user-row locks.
        for (const id of [ctx.userId, offer.ownerId].sort())
          await claimOfferUser(tx, id);
        await moveOfferItem(
          tx,
          supplied,
          offer.requestedQuantity,
          offer.ownerId,
          false,
        );
        if (offer.offerType === "REQUEST") {
          const payment = await tx
            .update(userData)
            .set({ bank: sql`${userData.bank} + ${offer.ryo}`, updatedAt: new Date() })
            .where(eq(userData.userId, ctx.userId));
          requireOfferWrite(payment.rowsAffected, "Recipient account is unavailable");
        } else if (offer.offeredUserItem) {
          await moveOfferItem(
            tx,
            offer.offeredUserItem,
            offer.offeredQuantity ?? 0,
            ctx.userId,
            false,
            true,
          );
        }
        await logOffer(tx, ctx.userId, offer.id, "ACCEPT", {
          ownerId: offer.ownerId,
          userItemId: supplied.id,
          requestedQuantity: offer.requestedQuantity,
          ryo: offer.ryo,
          offeredUserItemId: offer.offeredUserItemId,
        });
        return {
          success: true,
          message: "Offer accepted; items and payment delivered",
        };
      });
    }),

  cancelAuctionOffer: protectedProcedure
    .input(auctionOfferIdSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const offer = await ctx.drizzle.query.auctionOffer.findFirst({
        where: and(
          eq(auctionOffer.id, input.offerId),
          eq(auctionOffer.ownerId, ctx.userId),
        ),
      });
      if (offer?.status !== "ACTIVE") return errorResponse("Offer is no longer active");
      return runOfferMutation(ctx.drizzle, async (tx) => {
        const claim = await tx
          .update(auctionOffer)
          .set({ status: "CANCELLED", updatedAt: new Date() })
          .where(
            and(
              eq(auctionOffer.id, offer.id),
              eq(auctionOffer.ownerId, ctx.userId),
              eq(auctionOffer.status, "ACTIVE"),
            ),
          );
        requireOfferWrite(
          claim.rowsAffected,
          "Offer was accepted or cancelled; please refresh",
        );
        if (offer.offerType === "REQUEST") {
          const refund = await tx
            .update(userData)
            .set({ bank: sql`${userData.bank} + ${offer.ryo}`, updatedAt: new Date() })
            .where(eq(userData.userId, ctx.userId));
          requireOfferWrite(refund.rowsAffected, "Account is unavailable");
        } else {
          const release = await tx
            .update(userItem)
            .set({ isInAuction: false, updatedAt: new Date() })
            .where(
              and(
                eq(userItem.id, offer.offeredUserItemId ?? ""),
                eq(userItem.userId, ctx.userId),
                eq(userItem.isInAuction, true),
                eq(userItem.quantity, offer.offeredQuantity ?? 0),
              ),
            );
          requireOfferWrite(release.rowsAffected, "Reserved item is unavailable");
        }
        await logOffer(tx, ctx.userId, offer.id, "CANCEL", {
          ryo: offer.ryo,
          offeredUserItemId: offer.offeredUserItemId,
        });
        return { success: true, message: "Offer cancelled; reserved payment returned" };
      });
    }),
};

const fetchOfferItem = (database: DrizzleClient, id: string, userId: string) =>
  database.query.userItem.findFirst({
    where: and(eq(userItem.id, id), eq(userItem.userId, userId)),
    with: { item: true, imbuements: { with: { item: true } } },
  });

const offerUserError = (user: typeof userData.$inferSelect | undefined | null) => {
  if (!user) return "Account not found";
  if (user.isBanned || user.isTradeBanned) return "Account is banned from trading";
  if (user.level < AUCTION_HOUSE_MIN_LEVEL) return auctionHouseLevelMessage;
  return null;
};

const eligibleOfferUser = (id: string) =>
  and(
    eq(userData.userId, id),
    sql`NOT EXISTS (SELECT 1 FROM StoreUserIdAlias WHERE StoreUserIdAlias.oldUserId = ${id})`,
    eq(userData.isBanned, false),
    eq(userData.isTradeBanned, false),
    gte(userData.level, AUCTION_HOUSE_MIN_LEVEL),
  );

const claimOfferUser = async (tx: OfferTransaction, id: string) => {
  const result = await tx
    .update(userData)
    .set({
      updatedAt: sql`GREATEST(CURRENT_TIMESTAMP(3), TIMESTAMPADD(MICROSECOND, 1000, ${userData.updatedAt}))`,
    })
    .where(eligibleOfferUser(id));
  requireOfferWrite(result.rowsAffected, "Trading access changed; please refresh");
};

const offerItemError = (row: UserItemWithRelations | undefined, quantity: number) => {
  if (
    !row?.item.canBeTraded ||
    row.quantity < quantity ||
    row.isInAuction ||
    row.equipped !== "NONE" ||
    row.storedAtHome ||
    (row.craftingFinishedAt && row.craftingFinishedAt > new Date()) ||
    row.imbuements.some(
      (imbuement) =>
        imbuement.craftingFinishedAt && imbuement.craftingFinishedAt > new Date(),
    )
  )
    return "Item is not available for trading";
  if (!row.item.canStack && quantity !== 1)
    return "Non-stackable items must have quantity 1";
  if (quantity < row.quantity && row.imbuements.length > 0)
    return "Cannot split items with imbuements";
  return null;
};

/** Unlike standalone splitting, this split must roll back with the offer and both payments. */
const moveOfferItem = async (
  tx: OfferTransaction,
  row: UserItemWithRelations,
  quantity: number,
  recipientId: string,
  reserve: boolean,
  wasReserved = false,
) => {
  const snapshot: UserItem = {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    userId: row.userId,
    itemId: row.itemId,
    quantity: row.quantity,
    level: row.level,
    experience: row.experience,
    equipped: row.equipped,
    durability: row.durability,
    storedAtHome: row.storedAtHome,
    craftingFinishedAt: row.craftingFinishedAt,
    isInAuction: row.isInAuction,
    activeVariantId: row.activeVariantId,
    dropChancePerc: row.dropChancePerc,
  };
  const isPartial = quantity < row.quantity;
  const destinationId = isPartial ? nanoid() : row.id;
  const result = await tx
    .update(userItem)
    .set(
      isPartial
        ? { quantity: sql`${userItem.quantity} - ${quantity}`, updatedAt: new Date() }
        : {
            userId: recipientId,
            isInAuction: reserve,
            activeVariantId: recipientId === row.userId ? row.activeVariantId : null,
            updatedAt: new Date(),
          },
    )
    .where(
      and(
        eq(userItem.id, row.id),
        eq(userItem.userId, row.userId),
        eq(userItem.itemId, row.itemId),
        eq(userItem.quantity, row.quantity),
        gt(userItem.quantity, 0),
        eq(userItem.isInAuction, wasReserved),
        eq(userItem.equipped, "NONE"),
        eq(userItem.storedAtHome, false),
        eq(userItem.level, row.level),
        eq(userItem.experience, row.experience),
        eq(userItem.durability, row.durability),
        or(
          isNull(userItem.craftingFinishedAt),
          lte(userItem.craftingFinishedAt, new Date()),
        ),
        sql`EXISTS (SELECT 1 FROM Item WHERE Item.id = ${row.itemId} AND Item.canBeTraded = 1)`,
        // Completed imbuements follow a whole item; splitting one would duplicate them.
        sql`NOT EXISTS (SELECT 1 FROM UserItemImbuement WHERE UserItemImbuement.userItemId = ${row.id} ${isPartial ? sql`` : sql`AND UserItemImbuement.craftingFinishedAt > CURRENT_TIMESTAMP(3)`})`,
      ),
    );
  requireOfferWrite(
    result.rowsAffected,
    "Inventory changed; please refresh and try again",
  );
  if (isPartial)
    await tx.insert(userItem).values({
      ...snapshot,
      id: destinationId,
      userId: recipientId,
      quantity,
      isInAuction: reserve,
      activeVariantId: recipientId === row.userId ? row.activeVariantId : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies UserItem);
  return destinationId;
};

const requireOfferWrite = (rowsAffected: number, message: string) => {
  if (rowsAffected !== 1)
    throw Object.assign(new Error(message), { name: "AuctionOfferConflict" });
};

const runOfferMutation = async (
  database: DrizzleClient,
  work: (tx: OfferTransaction) => Promise<{ success: boolean; message: string }>,
) => {
  try {
    // These cross-user exchanges need multiple rows to commit together; a lone guarded update
    // cannot couple an offer claim, a split inventory row and delivery to the other account.
    return await retryOnDeadlock(() => database.transaction(work));
  } catch (error) {
    if (error instanceof Error && error.name === "AuctionOfferConflict")
      return errorResponse(error.message);
    throw error;
  }
};

const logOffer = (
  tx: OfferTransaction,
  userId: string,
  id: string,
  action: string,
  changes: unknown,
) =>
  tx.insert(actionLog).values({
    id: nanoid(),
    userId,
    tableName: "auctionOffer",
    relatedId: id,
    changes: JSON.stringify({ action, details: changes }),
  });
