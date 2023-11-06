import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, or, and, sql, desc } from "drizzle-orm";
import { paypalTransaction, paypalSubscription } from "../../../../drizzle/schema";
import { userData } from "../../../../drizzle/schema";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { baseServerResponse, errorResponse } from "../trpc";
import { dollars2reps, calcFedUgradeCost } from "../../../utils/paypal";
import { plan2FedStatus } from "../../../utils/paypal";
import { serverError } from "../trpc";
import { fetchUser } from "./profile";
import { FederalStatuses } from "../../../../drizzle/constants";
import type { FederalStatus } from "../../../../drizzle/schema";
import type { DrizzleClient } from "../../db";
import type { JsonData } from "../../../utils/typeutils";

type PaypalAmount = {
  currency_code?: string;
  value?: string;
};

type PaypalOrder =
  | {
      id?: string;
      status?: string;
      purchase_units?: {
        amount?: PaypalAmount;
        custom_id?: string;
        payments?: {
          captures?: {
            id: string;
            status: string;
            amount: PaypalAmount;
            invoice_id: string;
            update_time: string;
          }[];
        };
      }[];
    }
  | undefined;

type PaypalSubscription = {
  id: string;
  custom_id: string;
  plan_id: string;
  status: string;
};

export const paypalRouter = createTRPCRouter({
  resolveOrder: protectedProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        orderId: z.string().min(15).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await getPaypalAccessToken();
      const order = await getPaypalOrder({ orderId: input.orderId, token: token });
      // Guarding
      if (order === undefined) {
        throw serverError("INTERNAL_SERVER_ERROR", "Could not fetch order");
      }
      const affectedUserId = order?.purchase_units?.[0]?.custom_id?.split("-")?.[1];
      if (affectedUserId === undefined) {
        throw serverError("INTERNAL_SERVER_ERROR", "Could not extract user ID");
      }
      const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
      if (capture?.status !== "COMPLETED") {
        throw serverError("INTERNAL_SERVER_ERROR", "Payments not completed");
      }
      const { currency_code, value } = capture.amount;
      // Guards
      if (value === undefined) {
        throw serverError("INTERNAL_SERVER_ERROR", "Could not extract payment amount");
      }
      if (parseFloat(value) < 1) {
        throw serverError("INTERNAL_SERVER_ERROR", "Too low payment amount");
      }
      if (currency_code !== "USD") {
        throw serverError("INTERNAL_SERVER_ERROR", "Invalid currency");
      }
      // Update database - will fail if orderID already exists, due to unique constraint
      await updateReps({
        client: ctx.drizzle,
        createdById: ctx.userId,
        transactionId: capture.id,
        transactionUpdatedDate: capture.update_time,
        orderId: input.orderId,
        affectedUserId: affectedUserId,
        invoiceId: capture.invoice_id,
        value: parseFloat(value),
        currency: currency_code,
        status: "COMPLETED",
        reps: dollars2reps(parseFloat(value)),
        raw: order,
      });
    }),
  resolveSubscription: protectedProcedure
    .input(
      z.object({
        subscriptionId: z.string(),
        orderId: z.string().optional(),
      })
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const token = await getPaypalAccessToken();
      const subscription = await getPaypalSubscription(input.subscriptionId, token);
      if (subscription === undefined) {
        throw serverError("INTERNAL_SERVER_ERROR", "Could not fetch subscription");
      }
      const users = subscription.custom_id?.split("-");
      const createdByUserId = users?.[0];
      const affectedUserId = users?.[1];
      if (affectedUserId === undefined || createdByUserId === undefined) {
        throw serverError("INTERNAL_SERVER_ERROR", "Could not extract user ID");
      }
      const newStatus =
        subscription.status === "ACTIVE"
          ? plan2FedStatus(subscription.plan_id)
          : "NONE";

      const result = await updateSubscription({
        client: ctx.drizzle,
        createdById: createdByUserId,
        orderId: input.orderId,
        affectedUserId: affectedUserId,
        federalStatus: newStatus,
        status: subscription.status,
        subscriptionId: subscription.id,
      });

      return {
        success: result.rowsAffected !== 0,
        message: `Synced with data from Paypal. UsedID ${affectedUserId} set to have ${newStatus} federal subscription.`,
      };
    }),
  // Get all paypal transactions by this user
  getPaypalTransactions: protectedProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const transactions = await ctx.drizzle.query.paypalTransaction.findMany({
        offset: skip,
        limit: input.limit,
        where: eq(paypalTransaction.createdById, ctx.userId),
        with: { affectedUser: true },
        orderBy: desc(paypalTransaction.createdAt),
      });
      const nextCursor = transactions.length < input.limit ? null : currentCursor + 1;
      return {
        data: transactions,
        nextCursor: nextCursor,
      };
    }),
  // Get all paypal subscriptions by this user
  getPaypalSubscriptions: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.paypalSubscription.findMany({
      where: and(
        or(
          eq(paypalSubscription.createdById, ctx.userId),
          eq(paypalSubscription.affectedUserId, ctx.userId)
        ),
        eq(paypalSubscription.status, "ACTIVE")
      ),
      with: { affectedUser: true, createdBy: true },
      orderBy: desc(paypalSubscription.createdAt),
    });
  }),
  // Upgrade a subscription for a user. Can only be done by the user who created the subscription
  upgradeSubscription: protectedProcedure
    .input(z.object({ userId: z.string(), plan: z.enum(FederalStatuses) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const subscription = await ctx.drizzle.query.paypalSubscription.findFirst({
        where: and(
          eq(paypalSubscription.status, "ACTIVE"),
          eq(paypalSubscription.createdById, input.userId),
          eq(paypalSubscription.affectedUserId, ctx.userId)
        ),
      });
      // If we could not find in paypal
      if (!subscription) {
        return errorResponse("Could not find such a subscription");
      }
      // Get cost, and ensure that we are actually upgrading
      const cost = calcFedUgradeCost(subscription.federalStatus, input.plan);
      if (!cost || cost < 0) {
        return errorResponse(`Invalid: ${subscription.federalStatus} to ${input.plan}`);
      }
      // Check that we have enough reputation points
      if (user.reputationPoints < cost) {
        return errorResponse(`Not enough reputation points`);
      }
      // Update the database
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({
            federalStatus: input.plan,
            reputationPointsTotal: sql`${userData.reputationPointsTotal} - ${cost}`,
            reputationPoints: sql`${userData.reputationPoints} - ${cost}`,
          })
          .where(eq(userData.userId, ctx.userId)),
        ctx.drizzle
          .update(paypalSubscription)
          .set({ federalStatus: input.plan, updatedAt: new Date() })
          .where(eq(paypalSubscription.subscriptionId, subscription.subscriptionId)),
      ]);
      return { success: true, message: "OK" };
    }),
  // Cancel paypal subscription
  cancelPaypalSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const token = await getPaypalAccessToken();
      // Get subscription from paypal & database
      const paypalSub = await getPaypalSubscription(input.subscriptionId, token);
      const dbSub = await ctx.drizzle.query.paypalSubscription.findFirst({
        where: eq(paypalSubscription.subscriptionId, input.subscriptionId),
      });
      // If we could not find in paypal
      if (paypalSub === undefined) {
        throw serverError(
          "INTERNAL_SERVER_ERROR",
          `Subscription ${input.subscriptionId} not found in paypal`
        );
      }
      // If not found in local database
      if (dbSub === undefined) {
        throw serverError(
          "INTERNAL_SERVER_ERROR",
          `Subscription ${input.subscriptionId} not found in database`
        );
      }
      // Check that the user is related to this subscription
      const createdByUserId = dbSub.createdById;
      const affectedUserId = dbSub.affectedUserId;
      const users = [createdByUserId, affectedUserId];
      if (!users.includes(ctx.userId) || !createdByUserId || !affectedUserId) {
        throw serverError("UNAUTHORIZED", "You are not related to this subscription");
      }
      // If status is not active on paypal, let us just cancel. Otherwise assume success cancel already
      let status = 204;
      if (["ACTIVE", "CREATED"].includes(paypalSub.status)) {
        status = await cancelPaypalSubscription(input.subscriptionId, token);
      }
      // If successfull cancel, update database subscription
      if (status === 204) {
        return await updateSubscription({
          client: ctx.drizzle,
          createdById: createdByUserId,
          affectedUserId: affectedUserId,
          federalStatus: dbSub.federalStatus,
          status: "CANCELLED",
          subscriptionId: paypalSub.id,
        });
      } else {
        throw serverError("INTERNAL_SERVER_ERROR", "Could not cancel subscription");
      }
    }),
});

/**
 * Updates subscription for a user
 */
export const updateSubscription = async (input: {
  client: DrizzleClient;
  createdById: string;
  orderId?: string;
  affectedUserId: string;
  subscriptionId: string;
  federalStatus: FederalStatus;
  status: string;
}) => {
  return await input.client.transaction(async (tx) => {
    await tx
      .update(userData)
      .set({ federalStatus: input.federalStatus })
      .where(eq(userData.userId, input.affectedUserId));
    const current = await tx.query.paypalSubscription.findFirst({
      where: eq(paypalSubscription.subscriptionId, input.subscriptionId),
    });
    if (current) {
      return await tx
        .update(paypalSubscription)
        .set({
          status: input.status,
          federalStatus: input.federalStatus,
        })
        .where(eq(paypalSubscription.subscriptionId, input.subscriptionId));
    } else {
      return await tx.insert(paypalSubscription).values({
        id: nanoid(),
        createdById: input.createdById,
        subscriptionId: input.subscriptionId,
        affectedUserId: input.affectedUserId,
        orderId: input.orderId,
        status: input.status,
        federalStatus: input.federalStatus,
      });
    }
  });
};

/**
 * Updates reputation points for a user
 */
export const updateReps = async (input: {
  client: DrizzleClient;
  createdById: string;
  transactionId: string;
  transactionUpdatedDate: string;
  orderId?: string;
  affectedUserId: string;
  invoiceId?: string;
  value: number;
  currency: string;
  status: string;
  reps: number;
  raw: JsonData;
}) => {
  return await input.client.transaction(async (tx) => {
    await tx
      .update(userData)
      .set({
        reputationPointsTotal: sql`${userData.reputationPointsTotal} + ${input.reps}`,
        reputationPoints: sql`${userData.reputationPoints} + ${input.reps}`,
      })
      .where(eq(userData.userId, input.affectedUserId));
    return await tx.insert(paypalTransaction).values({
      id: nanoid(),
      createdById: input.createdById,
      transactionId: input.transactionId,
      transactionUpdatedDate: input.transactionUpdatedDate,
      orderId: input.orderId,
      affectedUserId: input.affectedUserId,
      invoiceId: input.invoiceId,
      amount: input.value,
      reputationPoints: input.reps,
      currency: input.currency,
      status: input.status,
      rawData: input.raw,
    });
  });
};

/**
 * Fetch a subscrioption from paypal
 */
export const getPaypalSubscription = async (subscriptionId: string, token: string) => {
  return await fetch(
    `${process.env.NEXT_PUBLIC_PAYPAL_URL}/v1/billing/subscriptions/${subscriptionId}`,
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    }
  )
    .then((response) => response.json())
    .then((data: PaypalSubscription | undefined) => {
      return data;
    });
};

/**
 * Cancel a subscrioption from paypal
 */
export const cancelPaypalSubscription = async (
  subscriptionId: string,
  token: string
) => {
  return await fetch(
    `${process.env.NEXT_PUBLIC_PAYPAL_URL}/v1/billing/subscriptions/${subscriptionId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "Canceleted through site" }),
    }
  ).then((response) => response.status);
};

/**
 * Fetch an access token from paypal
 */
export const getPaypalAccessToken = async () => {
  return await fetch(`${process.env.NEXT_PUBLIC_PAYPAL_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        btoa(
          `${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
        ),
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  })
    .then((response) => response.json())
    .then((data: { access_token: string }) => {
      return data["access_token"];
    });
};

/**
 * Fetch a paypal order
 */
export const getPaypalOrder = async (input: { orderId: string; token: string }) => {
  const order = await fetch(
    `${process.env.NEXT_PUBLIC_PAYPAL_URL}/v2/checkout/orders/${input.orderId}`,
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + input.token,
        "Content-Type": "application/json",
      },
    }
  )
    .then((response) => {
      return response.json();
    })
    .then((data: PaypalOrder) => {
      return data;
    });
  return order;
};
