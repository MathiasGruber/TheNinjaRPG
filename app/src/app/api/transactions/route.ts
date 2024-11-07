import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { drizzleDB } from "@/server/db";
import { getPaypalAccessToken } from "@/server/api/routers/paypal";
import { syncTransactions } from "@/server/api/routers/paypal";
import { getPaypalTransactions } from "@/server/api/routers/paypal";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { updateGameSetting, checkGameTimer } from "@/libs/gamesettings";
import { cookies } from "next/headers";
import { dollars2reps } from "@/utils/paypal";
import { eq, gt, and, isNull, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { updateReps } from "@/routers/paypal";
import { paypalTransaction, userData } from "@/drizzle/schema";

export async function GET() {
  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  cookies();

  // Check timer
  const frequency = 3;
  const response = await checkGameTimer(drizzleDB, frequency);
  if (response) return response;

  try {
    // Get token
    const token = await getPaypalAccessToken();

    // Get latest transactions
    const transactions = await getPaypalTransactions(new Date(), token);

    // Sync transactions & get messages
    const msgs = await syncTransactions(drizzleDB, transactions, token);

    // Get transactions where refereal reputation points have not been added
    const mainTransaction = alias(paypalTransaction, "mainTransaction");
    const refTransaction = alias(paypalTransaction, "refTransaction");
    const buyerUser = alias(userData, "buyerUserData");
    const recruiterUser = alias(userData, "recruiterUserData");
    const unawardedTransactions = await drizzleDB
      .select({
        originalTransactionId: mainTransaction.transactionId,
        createdById: mainTransaction.createdById,
        transactionUpdatedDate: mainTransaction.transactionUpdatedDate,
        invoiceId: mainTransaction.invoiceId,
        amount: mainTransaction.amount,
        currency: mainTransaction.currency,
        recruiterId: recruiterUser.recruiterId,
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
          isNotNull(buyerUser.recruiterId),
          isNull(refTransaction.id),
        ),
      );
    for (const transaction of unawardedTransactions) {
      if (transaction.createdById && transaction.recruiterId) {
        const referralBonus = Math.floor(dollars2reps(transaction.amount) * 0.1);
        msgs.push(`Add ${referralBonus} ref reps - invoiceId ${transaction.invoiceId}`);
        await updateReps({
          client: drizzleDB,
          createdById: transaction.createdById,
          transactionId: transaction.originalTransactionId,
          transactionUpdatedDate: transaction.transactionUpdatedDate,
          orderId: nanoid(),
          affectedUserId: transaction.recruiterId,
          invoiceId: transaction.invoiceId ?? "unknown",
          value: 0,
          currency: transaction.currency,
          status: "COMPLETED",
          reps: referralBonus,
          type: "REFERRAL",
          raw: {},
        });
      }
    }

    // Update timer
    await updateGameSetting(drizzleDB, `timer-${frequency}h`, 0, new Date());

    // Return information
    return Response.json(`OK. ${msgs.join(", ")}`);
  } catch (cause) {
    console.error(cause);
    if (cause instanceof TRPCError) {
      const httpCode = getHTTPStatusCodeFromError(cause);
      return Response.json(cause, { status: httpCode });
    }
    return Response.json("Internal server error", { status: 500 });
  }
}
