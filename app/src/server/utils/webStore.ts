import {
  and,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { STORE_ORDER_RESERVATION_MINUTES } from "@/drizzle/constants";
import {
  item,
  paypalTransaction,
  storeUserIdAlias,
  userData,
  userItem,
  webStoreBundle,
  webStoreOrder,
} from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { reputationAllowanceUsed } from "@/server/utils/purchases/allowance";
import { isDeletedStoreUserId } from "@/server/utils/purchases/grant";
import { dynamicMonthlyRepCap, getStoreBundleMinimumPriceCents } from "@/utils/paypal";
import { type StoreContents, storeContentsSchema } from "@/validators/points";

/** Distinguish snapshot-backed purchases from legacy PayPal custom IDs during recovery. */
export const readStoreCustomId = (value?: string) =>
  value?.startsWith("store:") ? value.slice(6) : undefined;

/** Reserve the buyer's allowance before opening a real-money checkout. */
export const reserveStoreOrder = async (
  client: DrizzleClient,
  buyerId: string,
  recipientId: string,
  offer: {
    name: string;
    priceCents: number;
    contents: StoreContents;
    bundleId?: string;
  },
) => {
  const needsBuyerLock = offer.contents.reputationPoints > 0 || !!offer.bundleId;
  const reserve = async (db: DrizzleClient) => {
    const buyerQuery = db.select().from(userData).where(eq(userData.userId, buyerId));
    const [buyer] = await (needsBuyerLock ? buyerQuery.for("update") : buyerQuery);
    if (!buyer || buyer.isBanned)
      return {
        success: false as const,
        message: "This account cannot make purchases",
      };
    const bundleError = offer.bundleId
      ? await checkBundlePurchaseLimit(db, buyerId, offer.bundleId)
      : null;
    if (bundleError) return { success: false as const, message: bundleError };
    const allowanceError = await checkStoreAllowance(
      db,
      buyer,
      offer.contents.reputationPoints,
    );
    if (allowanceError) return { success: false as const, message: allowanceError };
    const order = {
      id: nanoid(),
      buyerId,
      recipientId,
      bundleId: offer.bundleId,
      name: offer.name,
      priceCents: offer.priceCents,
      contents: offer.contents,
      expiresAt: new Date(Date.now() + STORE_ORDER_RESERVATION_MINUTES * 60_000),
    };
    await db.insert(webStoreOrder).values(order);
    return { success: true as const, message: "Checkout ready", order };
  };
  // A positive reservation INSERT cannot share one guarded UPDATE with the SUM over
  // receipts and other orders, or the lifetime bundle count. All bundle reservations
  // share this buyer lock, including unlimited offers whose limit may later change.
  return retryOnDeadlock(() =>
    needsBuyerLock ? client.transaction(reserve) : reserve(client),
  );
};

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
  // Capture uniqueness lives on the order; its claim must commit with the allowance
  // receipt and rewards so retries and account cleanup see the same delivery state.
  // A guarded multi-table UPDATE cannot also INSERT the new receipt/inventory rows.
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
  captureAttemptId = nanoid(),
) => {
  const snapshot = await client.query.webStoreOrder.findFirst({
    where: eq(webStoreOrder.id, snapshotId),
  });
  if (!snapshot) return "This checkout is not available for your account";
  const needsBuyerLock = snapshot.contents.reputationPoints > 0 || !!snapshot.bundleId;
  const authorize = async (db: DrizzleClient) => {
    const buyerQuery = db.select().from(userData).where(eq(userData.userId, buyerId));
    // Acquire the lock before consistent reads so queued captures see prior refreshes.
    const [buyer] = await (needsBuyerLock ? buyerQuery.for("update") : buyerQuery);
    const order = snapshot;
    if (!buyer || buyer.isBanned || order.buyerId !== buyerId)
      return "This checkout is not available for your account";
    if (order.grantedAt) return null;
    const bundleError = order.bundleId
      ? await checkBundlePurchaseLimit(db, buyerId, order.bundleId, order.id)
      : null;
    if (bundleError) return bundleError;
    if (isDeletedStoreUserId(order.recipientId))
      return "The recipient account was deleted. No payment was captured.";
    const recipientQuery = db.query.userData.findFirst({
      columns: { userId: true, isBanned: true, isAi: true },
      where: eq(userData.userId, order.recipientId),
    });
    const aliasesQuery = db.query.storeUserIdAlias.findMany({
      where: inArray(storeUserIdAlias.oldUserId, [buyerId, order.recipientId]),
    });
    const itemsQuery = order.contents.items.length
      ? db.query.item.findMany({
          columns: { id: true, repsCost: true },
          where: and(
            eq(item.hidden, false),
            inArray(
              item.id,
              order.contents.items.map((reward) => reward.id),
            ),
          ),
        })
      : [];
    // PlanetScale transactions share one session and reject overlapping statements.
    const [recipient, aliases, items] = needsBuyerLock
      ? ([await recipientQuery, await aliasesQuery, await itemsQuery] as const)
      : await Promise.all([recipientQuery, aliasesQuery, itemsQuery]);
    if (
      !recipient ||
      recipient.isBanned ||
      recipient.isAi ||
      aliases.some((alias) => isDeletedStoreUserId(alias.newUserId))
    )
      return "The recipient account is no longer available. No payment was captured.";
    if (items.length !== order.contents.items.length)
      return "An item in this checkout is no longer available. No payment was captured.";
    // Stop unpaid quotes that became too cheap; completed captures bypass this preflight.
    if (order.priceCents < getStoreBundleMinimumPriceCents(order.contents, items))
      return "This checkout's price needs updating. Start a new checkout. No payment was captured.";
    const error = await checkStoreAllowance(
      db,
      buyer,
      order.contents.reputationPoints,
      order.id,
    );
    if (error) return error;
    // Snapshot contents stay fixed; guard identities changed by account repair/deletion.
    const refreshed = await db
      .update(webStoreOrder)
      .set({
        expiresAt: new Date(Date.now() + STORE_ORDER_RESERVATION_MINUTES * 60_000),
        captureAttemptId,
      })
      .where(
        and(
          eq(webStoreOrder.id, order.id),
          eq(webStoreOrder.buyerId, buyerId),
          eq(webStoreOrder.recipientId, order.recipientId),
          isNull(webStoreOrder.grantedAt),
        ),
      );
    if (refreshed.rowsAffected !== 1) {
      const current = await db.query.webStoreOrder.findFirst({
        where: eq(webStoreOrder.id, order.id),
      });
      return current?.buyerId === buyerId && current.grantedAt
        ? null
        : "The checkout account changed. Retry checkout. No payment was captured.";
    }
    return null;
  };
  // The SUM spans receipts and other orders, so one guarded refresh cannot protect
  // a positive reservation or bundle slot. Recheck even live orders: legacy receipts
  // can arrive later and staff can change a bundle's limit before payment.
  return retryOnDeadlock(() =>
    needsBuyerLock ? client.transaction(authorize) : authorize(client),
  );
};

/** A declined attempt may release only its own unpaid slot, never a newer capture attempt. */
export const releaseDeclinedStoreCapture = async (
  client: DrizzleClient,
  snapshotId: string,
  buyerId: string,
  captureAttemptId: string,
) =>
  client
    .update(webStoreOrder)
    .set({ captureAttemptId: null, expiresAt: new Date(0) })
    .where(
      and(
        eq(webStoreOrder.id, snapshotId),
        eq(webStoreOrder.buyerId, buyerId),
        eq(webStoreOrder.captureAttemptId, captureAttemptId),
        isNull(webStoreOrder.grantedAt),
      ),
    );

/** The buyer lock serializes the count and reservation INSERT/refresh across recipients. */
const checkBundlePurchaseLimit = async (
  client: DrizzleClient,
  buyerId: string,
  bundleId: string,
  excludeOrderId?: string,
) => {
  const bundle = await client.query.webStoreBundle.findFirst({
    columns: { purchaseLimit: true, isActive: true },
    where: eq(webStoreBundle.id, bundleId),
  });
  if (!bundle?.isActive)
    return "This bundle is no longer available. No payment was captured.";
  if (bundle.purchaseLimit === 0) return null;
  const [usage] = await client
    .select({ count: count() })
    .from(webStoreOrder)
    .where(
      and(
        eq(webStoreOrder.buyerId, buyerId),
        eq(webStoreOrder.bundleId, bundleId),
        excludeOrderId ? ne(webStoreOrder.id, excludeOrderId) : undefined,
        // A provider capture can stay pending or need delivery recovery beyond quote expiry.
        // Keep its slot until delivery; only never-authorized checkouts may expire.
        or(
          isNotNull(webStoreOrder.grantedAt),
          isNotNull(webStoreOrder.captureAttemptId),
          gt(webStoreOrder.expiresAt, new Date()),
        ),
      ),
    );
  return (usage?.count ?? 0) >= bundle.purchaseLimit
    ? "This account has reached this bundle's purchase limit, including other open checkouts. No payment was captured."
    : null;
};

/** Count paid reputation and live reservations; positive reservations hold the buyer lock. */
const checkStoreAllowance = async (
  client: DrizzleClient,
  buyer: typeof userData.$inferSelect,
  points: number,
  excludeOrderId?: string,
) => {
  const used = await reputationAllowanceUsed(
    client,
    buyer.userId,
    "",
    "",
    excludeOrderId,
  );
  return used + points > dynamicMonthlyRepCap(buyer)
    ? "This exceeds your monthly reputation allowance, including other open checkouts. No payment was captured."
    : null;
};
