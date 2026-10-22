import { and, eq, gt, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { STORE_ORDER_RESERVATION_MINUTES } from "@/drizzle/constants";
import {
  item,
  paypalTransaction,
  storeUserIdAlias,
  userData,
  userItem,
  webStoreOrder,
} from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { isDeletedStoreUserId } from "@/server/utils/purchases/grant";
import { dynamicMonthlyRepCap } from "@/utils/paypal";
import { type StoreContents, storeContentsSchema } from "@/validators/points";

export const readStoreCustomId = (value?: string) =>
  value?.startsWith("store:") ? value.slice(6) : undefined;

/** Reserve the buyer's allowance before opening a real-money checkout. */
export const reserveStoreOrder = async (
  client: DrizzleClient,
  buyerId: string,
  recipientId: string,
  offer: { name: string; priceCents: number; contents: StoreContents },
) =>
  retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      // The aggregate allowance check and new reservation INSERT must share the buyer lock.
      const [buyer] = await tx
        .select()
        .from(userData)
        .where(eq(userData.userId, buyerId))
        .for("update");
      if (!buyer || buyer.isBanned)
        return {
          success: false as const,
          message: "This account cannot make purchases",
        };
      const allowanceError = await checkStoreAllowance(
        tx,
        buyer,
        offer.contents.reputationPoints,
      );
      if (allowanceError) return { success: false as const, message: allowanceError };
      const order = {
        id: nanoid(),
        buyerId,
        recipientId,
        name: offer.name,
        priceCents: offer.priceCents,
        contents: offer.contents,
        expiresAt: new Date(Date.now() + STORE_ORDER_RESERVATION_MINUTES * 60_000),
      };
      await tx.insert(webStoreOrder).values(order);
      return { success: true as const, message: "Checkout ready", order };
    }),
  );

/** Deliver only verified provider captures; snapshot claim, receipt and all rewards commit together. */
export const deliverStoreOrder = async (
  client: DrizzleClient,
  input: {
    snapshotId: string;
    captureId: string;
    orderId: string;
    currency: string;
    value: string;
    invoiceId?: string;
    raw: unknown;
  },
) => {
  const order = await client.query.webStoreOrder.findFirst({
    where: eq(webStoreOrder.id, input.snapshotId),
  });
  if (!order)
    throw new Error(
      "Checkout snapshot not found. Contact support with your payment receipt.",
    );
  if (
    input.currency !== "USD" ||
    !/^\d+(?:\.\d{1,2})?$/.test(input.value) ||
    Math.round(Number(input.value) * 100) !== order.priceCents ||
    input.invoiceId !== order.id
  )
    throw new Error(
      "Payment does not match this checkout. Contact support with your payment receipt.",
    );
  if (order.grantedAt) return { success: true, message: "Purchase already delivered" };
  const contents = storeContentsSchema.parse(order.contents);
  const items = contents.items.length
    ? await client.query.item.findMany({
        columns: { id: true, canStack: true, stackSize: true },
        where: inArray(
          item.id,
          contents.items.map((i) => i.id),
        ),
      })
    : [];
  const grants: (typeof userItem.$inferInsert)[] = [];
  for (const reward of contents.items) {
    const definition = items.find((i) => i.id === reward.id);
    if (!definition)
      throw new Error(
        "A purchased item is unavailable. Contact support; your payment can be retried.",
      );
    const stackSize = definition.canStack ? Math.max(1, definition.stackSize) : 1;
    for (let remaining = reward.quantity; remaining > 0; remaining -= stackSize)
      grants.push({
        id: nanoid(),
        userId: order.recipientId,
        itemId: reward.id,
        quantity: Math.min(remaining, stackSize),
      });
  }
  // New receipt and inventory INSERTs cannot share the guarded claim/balance UPDATE.
  return retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      const claim = await tx
        .update(webStoreOrder)
        .set({ grantedAt: new Date(), captureId: input.captureId })
        .where(
          and(
            eq(webStoreOrder.id, order.id),
            eq(webStoreOrder.recipientId, order.recipientId),
            eq(webStoreOrder.buyerId, order.buyerId),
            isNull(webStoreOrder.grantedAt),
          ),
        );
      if (claim.rowsAffected !== 1) {
        const current = await tx.query.webStoreOrder.findFirst({
          where: eq(webStoreOrder.id, order.id),
        });
        return current?.grantedAt
          ? { success: true, message: "Purchase already delivered" }
          : {
              success: false,
              message:
                "The checkout account changed. Retry delivery using Lookup Transaction.",
            };
      }
      // Item-only offers still require a recipient, but must not interpret a no-op +0 as absence.
      if (contents.reputationPoints === 0 && contents.money === 0) {
        const [recipient] = await tx
          .select({ id: userData.userId })
          .from(userData)
          .where(eq(userData.userId, order.recipientId))
          .for("update");
        if (!recipient)
          throw new Error(
            "Recipient unavailable. Contact support with your payment receipt.",
          );
      } else {
        const credited = await tx
          .update(userData)
          .set({
            reputationPoints: sql`${userData.reputationPoints} + ${contents.reputationPoints}`,
            reputationPointsTotal: sql`${userData.reputationPointsTotal} + ${contents.reputationPoints}`,
            money: sql`${userData.money} + ${contents.money}`,
          })
          .where(eq(userData.userId, order.recipientId));
        if (credited.rowsAffected !== 1)
          throw new Error(
            "Recipient unavailable. Contact support with your payment receipt.",
          );
      }
      if (grants.length) await tx.insert(userItem).values(grants);
      await tx.insert(paypalTransaction).values({
        id: nanoid(),
        createdById: order.buyerId,
        affectedUserId: order.recipientId,
        transactionId: input.captureId,
        orderId: input.orderId,
        invoiceId: order.id,
        transactionUpdatedDate: new Date().toISOString(),
        amount: order.priceCents / 100,
        reputationPoints: contents.reputationPoints,
        currency: "USD",
        status: "COMPLETED",
        type: "REP_PURCHASE",
        rawData: input.raw,
      });
      return {
        success: true,
        message: `${order.name} delivered`,
        purchase: {
          transactionId: input.captureId,
          name: order.name,
          value: order.priceCents / 100,
          currency: "USD" as const,
          snapshotId: order.id,
        },
      };
    }),
  );
};

/** Refresh the allowance reservation immediately before the server captures payment. */
export const authorizeStoreCapture = async (
  client: DrizzleClient,
  snapshotId: string,
  buyerId: string,
) =>
  retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      // The aggregate allowance check and reservation refresh must share the buyer lock.
      const [buyer] = await tx
        .select()
        .from(userData)
        .where(eq(userData.userId, buyerId))
        .for("update");
      const order = await tx.query.webStoreOrder.findFirst({
        where: eq(webStoreOrder.id, snapshotId),
      });
      if (!buyer || buyer.isBanned || !order || order.buyerId !== buyerId)
        return "This checkout is not available for your account";
      if (order.grantedAt) return null;
      if (isDeletedStoreUserId(order.recipientId))
        return "The recipient account was deleted. No payment was captured.";
      const recipient = await tx.query.userData.findFirst({
        columns: { userId: true, isBanned: true, isAi: true },
        where: eq(userData.userId, order.recipientId),
      });
      const aliases = await tx.query.storeUserIdAlias.findMany({
        where: inArray(storeUserIdAlias.oldUserId, [buyerId, order.recipientId]),
      });
      if (
        !recipient ||
        recipient.isBanned ||
        recipient.isAi ||
        aliases.some((alias) => isDeletedStoreUserId(alias.newUserId))
      )
        return "The recipient account is no longer available. No payment was captured.";
      if (order.contents.items.length) {
        const items = await tx.query.item.findMany({
          columns: { id: true },
          where: and(
            eq(item.hidden, false),
            inArray(
              item.id,
              order.contents.items.map((reward) => reward.id),
            ),
          ),
        });
        if (items.length !== order.contents.items.length)
          return "An item in this checkout is no longer available. No payment was captured.";
      }
      const error = await checkStoreAllowance(
        tx,
        buyer,
        order.contents.reputationPoints,
        order.id,
      );
      if (error) return error;
      await tx
        .update(webStoreOrder)
        .set({
          expiresAt: new Date(Date.now() + STORE_ORDER_RESERVATION_MINUTES * 60_000),
        })
        .where(eq(webStoreOrder.id, order.id));
      return null;
    }),
  );

const checkStoreAllowance = async (
  client: DrizzleClient,
  buyer: typeof userData.$inferSelect,
  points: number,
  excludeOrderId?: string,
) => {
  const paid = await client
    .select({
      count:
        sql<number>`COALESCE(SUM(${paypalTransaction.reputationPoints}),0)`.mapWith(
          Number,
        ),
    })
    .from(paypalTransaction)
    .where(
      and(
        eq(paypalTransaction.createdById, buyer.userId),
        gte(paypalTransaction.createdAt, sql`NOW() - INTERVAL 30 DAY`),
      ),
    );
  const pending = await client.query.webStoreOrder.findMany({
    where: and(
      eq(webStoreOrder.buyerId, buyer.userId),
      isNull(webStoreOrder.grantedAt),
      gt(webStoreOrder.expiresAt, new Date()),
      excludeOrderId ? ne(webStoreOrder.id, excludeOrderId) : undefined,
    ),
  });
  const reserved = pending.reduce(
    (sum, order) => sum + order.contents.reputationPoints,
    0,
  );
  return (paid[0]?.count ?? 0) + reserved + points > dynamicMonthlyRepCap(buyer)
    ? "This exceeds your monthly reputation allowance, including other open checkouts. No payment was captured."
    : null;
};
