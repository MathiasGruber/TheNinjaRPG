import { and, eq, gt, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import {
  paypalTransaction,
  recruitmentRewards,
  stripePayment,
  userData,
} from "@/drizzle/schema";
import { env } from "@/env/server.mjs";
import { handleEndpointError, lockWithGameTimer } from "@/libs/gamesettings";
import { updateReps } from "@/routers/paypal";
import {
  getPaypalAccessToken,
  getPaypalTransactions,
  syncTransactions,
} from "@/server/api/routers/paypal";
import { type DrizzleClient, drizzleDB } from "@/server/db";
import { authenticateCronRequest } from "@/server/utils/cron";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { stripeIsLive } from "@/server/utils/stripe/client";

/** Reconcile PayPal payments and award outstanding referral reputation on the hourly schedule. */
export async function GET(request: Request) {
  const authError = authenticateCronRequest(request);
  if (authError) return authError;

  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  await cookies();

  // Check timer
  const response = await lockWithGameTimer(
    drizzleDB,
    "transaction-sync-1h",
    60 * 60_000,
  );
  if (response) return response;

  try {
    // Get token
    const token = await getPaypalAccessToken();

    // Get latest transactions
    const transactions = await getPaypalTransactions(new Date(), token);

    // Sync transactions & get messages
    const results = await syncTransactions(drizzleDB, transactions, token);
    const msgs = results.map((result) => result.message);

    // Get transactions where refereal reputation points have not been added
    const mainTransaction = alias(paypalTransaction, "mainTransaction");
    const refTransaction = alias(paypalTransaction, "refTransaction");
    const buyerUser = alias(userData, "buyerUserData");
    const recruiterUser = alias(userData, "recruiterUserData");
    const [unawardedTransactions, stripeMessages] = await Promise.all([
      drizzleDB
        .select({
          originalTransactionId: mainTransaction.transactionId,
          createdById: mainTransaction.createdById,
          transactionUpdatedDate: mainTransaction.transactionUpdatedDate,
          invoiceId: mainTransaction.invoiceId,
          amount: mainTransaction.amount,
          reputationPoints: mainTransaction.reputationPoints,
          currency: mainTransaction.currency,
          recruiterId: recruiterUser.userId,
          referalTransactionId: refTransaction.transactionId,
        })
        .from(mainTransaction)
        .leftJoin(buyerUser, eq(mainTransaction.createdById, buyerUser.userId))
        .leftJoin(recruiterUser, eq(buyerUser.recruiterId, recruiterUser.userId))
        .leftJoin(
          refTransaction,
          and(
            eq(mainTransaction.invoiceId, refTransaction.invoiceId),
            eq(refTransaction.affectedUserId, buyerUser.recruiterId),
          ),
        )
        .where(
          and(
            gt(mainTransaction.reputationPoints, 0),
            gt(mainTransaction.amount, 0),
            eq(mainTransaction.type, "REP_PURCHASE"),
            eq(mainTransaction.status, "COMPLETED"),
            isNotNull(mainTransaction.invoiceId),
            isNotNull(buyerUser.recruiterId),
            isNull(refTransaction.id),
            gte(mainTransaction.createdAt, buyerUser.createdAt),
          ),
        ),
      awardStripeReferralReputation(drizzleDB),
    ]);
    msgs.push(...stripeMessages);
    for (const transaction of unawardedTransactions) {
      if (transaction.createdById && transaction.recruiterId) {
        // Bundles can include ryo/items, so referral rewards use the reputation actually purchased.
        const referralBonus = Math.floor(transaction.reputationPoints * 0.1);
        msgs.push(`Add ${referralBonus} ref reps - invoiceId ${transaction.invoiceId}`);
        await updateReps({
          client: drizzleDB,
          createdById: transaction.createdById,
          transactionId: transaction.originalTransactionId,
          transactionUpdatedDate: transaction.transactionUpdatedDate,
          orderId: nanoid(),
          affectedUserId: transaction.recruiterId,
          invoiceId: transaction.invoiceId,
          value: 0,
          currency: transaction.currency,
          status: "COMPLETED",
          reps: referralBonus,
          type: "REFERRAL",
          raw: {},
        });
      }
    }

    // Return information
    return Response.json(`OK. ${msgs.join(", ")}`);
  } catch (cause) {
    return await handleEndpointError(cause);
  }
}

/** Pay the buyer's recruiter once for each delivered Stripe reputation receipt. */
const awardStripeReferralReputation = async (client: DrizzleClient) => {
  const buyer = alias(userData, "stripeReferralBuyer");
  const recruiter = alias(userData, "stripeReferralRecruiter");
  const rewardId = sql<string>`CONCAT('stripe-referral:', SHA2(${stripePayment.id}, 256))`;
  const receipts = await client
    .select({
      rewardId,
      buyerId: buyer.userId,
      buyerCreatedAt: buyer.createdAt,
      recruiterId: recruiter.userId,
      recruiterCreatedAt: recruiter.createdAt,
      reputationPoints: stripePayment.reputationPoints,
    })
    .from(stripePayment)
    .innerJoin(buyer, eq(buyer.userId, stripePayment.createdById))
    .innerJoin(recruiter, eq(recruiter.userId, buyer.recruiterId))
    .leftJoin(recruitmentRewards, eq(recruitmentRewards.id, rewardId))
    .where(
      and(
        isNull(recruitmentRewards.id),
        isNotNull(stripePayment.grantedAt),
        eq(stripePayment.reviewRequired, false),
        eq(stripePayment.federalStatus, "NONE"),
        eq(
          stripePayment.isSandbox,
          env.NODE_ENV === "production" ? false : !stripeIsLive(),
        ),
        gt(stripePayment.reputationPoints, 0),
        gt(stripePayment.amountCents, 0),
        gte(stripePayment.purchasedAt, buyer.createdAt),
        gte(stripePayment.purchasedAt, recruiter.createdAt),
      ),
    );
  const messages: string[] = [];
  for (const receipt of receipts) {
    const amount = Math.floor(receipt.reputationPoints * 0.1);
    if (amount === 0) continue;
    // The unique audit INSERT and balance increment must commit together; a guarded UPDATE
    // alone cannot create the durable reward claim without a schema change.
    const awarded = await retryOnDeadlock(() =>
      client.transaction(async (tx) => {
        const claim = await tx.insert(recruitmentRewards).ignore().values({
          id: receipt.rewardId,
          userId: receipt.recruiterId,
          recruitedUserId: receipt.buyerId,
          amount,
          type: "REPUTATION",
        });
        if (claim.rowsAffected === 0) return false;
        const paid = await tx.execute(sql`
        UPDATE ${userData} AS recruiter
        INNER JOIN ${userData} AS buyer ON buyer.recruiterId = recruiter.userId
        SET recruiter.reputationPoints = recruiter.reputationPoints + ${amount},
          recruiter.reputationPointsTotal = recruiter.reputationPointsTotal + ${amount}
        WHERE recruiter.userId = ${receipt.recruiterId}
          AND recruiter.createdAt = ${receipt.recruiterCreatedAt}
          AND buyer.userId = ${receipt.buyerId}
          AND buyer.createdAt = ${receipt.buyerCreatedAt}
      `);
        if (paid.rowsAffected !== 1)
          throw new Error("Referral account changed while awarding Stripe reputation");
        return true;
      }),
    );
    if (awarded) messages.push(`Add ${amount} ref reps - Stripe ${receipt.rewardId}`);
  }
  return messages;
};
