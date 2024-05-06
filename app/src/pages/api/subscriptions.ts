import { TRPCError } from "@trpc/server";
import { eq, and, lte, isNotNull, isNull } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { plan2FedStatus } from "@/utils/paypal";
import { getPaypalAccessToken } from "@/server/api/routers/paypal";
import { getPaypalSubscription } from "@/server/api/routers/paypal";
import { paypalSubscription, userData } from "@/drizzle/schema";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import type { NextApiRequest, NextApiResponse } from "next";

const syncSubscriptions = async (req: NextApiRequest, res: NextApiResponse) => {
  // Create context and caller
  try {
    const token = await getPaypalAccessToken();

    // Subscriptions with orderId are from PayPal
    const paypalSubscriptions = await drizzleDB.query.paypalSubscription.findMany({
      where: and(
        eq(paypalSubscription.status, "ACTIVE"),
        isNotNull(paypalSubscription.orderId),
        lte(
          paypalSubscription.updatedAt,
          new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
        ),
      ),
    });
    void paypalSubscriptions.map(async (subscription) => {
      const paypalSub = await getPaypalSubscription(subscription.subscriptionId, token);
      if (paypalSub) {
        const paypalStatus = paypalSub.status;
        const newFedStatus = plan2FedStatus(paypalSub.plan_id);
        const isDone = !["CREATED", "ACTIVE"].includes(paypalStatus);
        // Update database
        await drizzleDB
          .update(paypalSubscription)
          .set({
            status: paypalStatus,
            federalStatus: newFedStatus,
            updatedAt: new Date(),
          })
          .where(eq(paypalSubscription.id, subscription.id));
        await drizzleDB
          .update(userData)
          .set({ federalStatus: isDone ? "NONE" : newFedStatus })
          .where(eq(userData.userId, subscription.affectedUserId));
      }
    });

    // Subscriptions without orderIds are from Reputation points
    const repSubscriptions = await drizzleDB.query.paypalSubscription.findMany({
      where: and(
        eq(paypalSubscription.status, "ACTIVE"),
        isNull(paypalSubscription.orderId),
        lte(
          paypalSubscription.createdAt,
          new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
        ),
      ),
    });
    void repSubscriptions.map(async (subscription) => {
      const isDone =
        new Date(subscription.createdAt) <
        new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
      await drizzleDB
        .update(paypalSubscription)
        .set({
          status: isDone ? "CANCELLED" : "ACTIVE",
          updatedAt: new Date(),
        })
        .where(eq(paypalSubscription.id, subscription.id));
      await drizzleDB
        .update(userData)
        .set({ federalStatus: isDone ? "NONE" : subscription.federalStatus })
        .where(eq(userData.userId, subscription.affectedUserId));
    });
    res.status(200).json("OK");
  } catch (cause) {
    if (cause instanceof TRPCError) {
      // An error from tRPC occured
      const httpCode = getHTTPStatusCodeFromError(cause);
      return res.status(httpCode).json(cause);
    }
    // Another error occured
    console.error(cause);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default syncSubscriptions;
