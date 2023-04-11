import { z } from "zod";
import { type Prisma } from "@prisma/client/edge";
import { type PrismaClient } from "@prisma/client/edge";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { dollars2reps } from "../../../utils/paypal";
import { serverError } from "../trpc";
import { FederalStatus } from "@prisma/client/edge";

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
        client: ctx.prisma,
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
        raw: order as Prisma.JsonArray,
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
            return FederalStatus.NORMAL;
          case process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_SILVER:
            return FederalStatus.SILVER;
          case process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_GOLD:
            return FederalStatus.GOLD;
          default:
            return FederalStatus.NONE;
        }
      };
      const newStatus =
        subscription.status === "ACTIVE"
          ? plan2FedStatus(subscription.plan_id)
          : FederalStatus.NONE;

      await updateSubscription({
        client: ctx.prisma,
        createdById: createdByUserId,
        orderId: input.orderId,
        affectedUserId: affectedUserId,
        federalStatus: newStatus,
        status: subscription.status,
        subscriptionId: subscription.id,
      });
    }),
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
      const transaactions = await ctx.prisma.paypalTransaction.findMany({
        skip: skip,
        take: input.limit,
        where: { createdById: ctx.userId },
        include: {
          affectedUser: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      const nextCursor = transaactions.length < input.limit ? null : currentCursor + 1;
      return {
        data: transaactions,
        nextCursor: nextCursor,
      };
    }),
  getPaypalSubscriptions: protectedProcedure.query(async ({ ctx }) => {
    const subscriptions = await ctx.prisma.paypalSubscription.findMany({
      where: {
        OR: [{ createdById: ctx.userId }, { affectedUserId: ctx.userId }],
        status: "ACTIVE",
      },
      include: {
        affectedUser: true,
        createdBy: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return {
      data: subscriptions,
    };
  }),
  cancelPaypalSubscription: protectedProcedure
    .input(
      z.object({
        subscriptionId: z.string(),
      })
    )
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
          client: ctx.prisma,
          createdById: createdByUserId,
          affectedUserId: affectedUserId,
          federalStatus: FederalStatus.NONE,
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
  client: PrismaClient;
  createdById: string;
  orderId?: string;
  affectedUserId: string;
  subscriptionId: string;
  federalStatus: FederalStatus;
  status: string;
}) => {
  return await input.client.$transaction([
    input.client.userData.update({
      where: { userId: input.affectedUserId },
      data: {
        federalStatus: input.federalStatus,
      },
    }),
    input.client.paypalSubscription.upsert({
      where: { subscriptionId: input.subscriptionId },
      update: {
        status: input.status,
        federalStatus: input.federalStatus,
      },
      create: {
        createdById: input.createdById,
        subscriptionId: input.subscriptionId,
        affectedUserId: input.affectedUserId,
        orderId: input.orderId,
        status: input.status,
        federalStatus: input.federalStatus,
      },
    }),
  ]);
};

/**
 * Updates reputation points for a user
 */
export const updateReps = async (input: {
  client: PrismaClient;
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
  raw: Prisma.JsonArray;
}) => {
  return await input.client.$transaction([
    input.client.userData.update({
      where: { userId: input.affectedUserId },
      data: {
        reputation_points_total: { increment: input.reps },
        reputation_points: { increment: input.reps },
      },
    }),
    input.client.paypalTransaction.create({
      data: {
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
      },
    }),
  ]);
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
