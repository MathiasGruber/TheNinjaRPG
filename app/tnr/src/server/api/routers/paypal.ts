import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { eq, or, and, sql, desc } from "drizzle-orm";
import { paypalTransaction, paypalSubscription } from "../../../../drizzle/schema";
import { userData } from "../../../../drizzle/schema";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { dollars2reps } from "../../../utils/paypal";
import { serverError } from "../trpc";
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

// type PaypalTransaction = {
//   transaction_details?: {
//     transaction_info: {
//       transaction_id: string;
//       transaction_updated_date: string;
//       transaction_amount: {
//         currency_code: string;
//         value: string;
//       };
//       transaction_status: string;
//       custom_id: string;
//       invoice_id: string;
//     };
//   }[];
// };

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
      const plan2FedStatus = (planId: string) => {
        switch (planId) {
          case process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_NORMAL:
            return "NORMAL";
          case process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_SILVER:
            return "SILVER";
          case process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_GOLD:
            return "GOLD";
          default:
            return "NONE";
        }
      };
      const newStatus =
        subscription.status === "ACTIVE"
          ? plan2FedStatus(subscription.plan_id)
          : "NONE";

      await updateSubscription({
        client: ctx.drizzle,
        createdById: createdByUserId,
        orderId: input.orderId,
        affectedUserId: affectedUserId,
        federalStatus: newStatus,
        status: subscription.status,
        subscriptionId: subscription.id,
      });
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
  // Cancel paypal subscription
  cancelPaypalSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const token = await getPaypalAccessToken();
      const subscription = await getPaypalSubscription(input.subscriptionId, token);
      if (subscription === undefined) {
        throw serverError("INTERNAL_SERVER_ERROR", "Could not fetch subscription");
      }
      if (subscription.status !== "ACTIVE") {
        throw serverError("INTERNAL_SERVER_ERROR", "Subscription is not active");
      }
      const users = subscription.custom_id?.split("-");
      const createdByUserId = users?.[0];
      const affectedUserId = users?.[1];
      if (!users.includes(ctx.userId) || !createdByUserId || !affectedUserId) {
        throw serverError("UNAUTHORIZED", "You are not related to this subscription");
      }
      const status = await cancelPaypalSubscription(input.subscriptionId, token);
      if (status === 204) {
        return await updateSubscription({
          client: ctx.drizzle,
          createdById: createdByUserId,
          affectedUserId: affectedUserId,
          federalStatus: "NONE",
          status: "CANCELLED",
          subscriptionId: subscription.id,
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
        id: createId(),
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
        reputationPointsTotal: sql`reputation_points_total + ${input.reps}`,
        reputationPoints: sql`reputation_points + ${input.reps}`,
      })
      .where(eq(userData.userId, input.affectedUserId));
    return await tx.insert(paypalTransaction).values({
      id: createId(),
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
    `https://api-m.sandbox.paypal.com/v1/billing/subscriptions/${subscriptionId}`,
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
 * Cancal a subscrioption from paypal
 */
export const cancelPaypalSubscription = async (
  subscriptionId: string,
  token: string
) => {
  return await fetch(
    `https://api-m.sandbox.paypal.com/v1/billing/subscriptions/${subscriptionId}/cancel`,
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
  return await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
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
 * Fetch a paypal transaction by its ID. By default looks 10 days into the past and future.
 */
// export const getPaypalTransaction = async (input: {
//   transactionId: string;
//   token: string;
//   startDate?: Date;
//   endDate?: Date;
// }) => {
//   const start = (input.startDate ?? secondsFromNow(-60 * 60 * 24 * 10))
//     .toISOString()
//     .split(".")[0];
//   const end = (input.endDate ?? secondsFromNow(+60 * 60 * 24 * 10))
//     .toISOString()
//     .split(".")[0];
//   const id = input.transactionId;
//   const transaction = await fetch(
//     `https://api-m.sandbox.paypal.com/v1/reporting/transactions?start_date=${start}-0000&end_date=${end}-0000&transaction_id=${id}&fields=all`,
//     {
//       method: "GET",
//       headers: {
//         Authorization: "Bearer " + input.token,
//         "Content-Type": "application/json",
//       },
//     }
//   )
//     .then((response) => response.json())
//     .then((data: PaypalTransaction) => {
//       return data;
//     });
//   return transaction;
// };

/**
 * Fetch a paypal order
 */
export const getPaypalOrder = async (input: { orderId: string; token: string }) => {
  const order = await fetch(
    `https://api-m.sandbox.paypal.com/v2/checkout/orders/${input.orderId}`,
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + input.token,
        "Content-Type": "application/json",
      },
    }
  )
    .then((response) => response.json())
    .then((data: PaypalOrder) => {
      return data;
    });
  return order;
};
