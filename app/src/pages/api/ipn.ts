import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { drizzleDB } from "@/server/db";
import { paypalWebhookMessage } from "@/drizzle/schema";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import type { NextApiRequest, NextApiResponse } from "next";

type IBody = {
  event_type: string;
  resource: {
    id: string;
    state: string;
    amount: {
      total: string;
      currency: string;
    };
  };
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Create context
  const body = req.body as IBody;

  try {
    switch (body.event_type) {
      case "PAYMENT.SALE.COMPLETED":
        break;
      case "BILLING.SUBSCRIPTION.SUSPENDED":
      case "BILLING.SUBSCRIPTION.RE-ACTIVATED":
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
      case "BILLING.SUBSCRIPTION.CREATED":
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.ACTIVATED":
      case "BILLING.SUBSCRIPTION.UPDATED":
      default:
        break;
    }
    await drizzleDB.insert(paypalWebhookMessage).values({
      id: nanoid(),
      rawData: body,
      eventType: body.event_type,
      handled: 0,
    });
    res.status(200);
  } catch (cause) {
    if (cause instanceof TRPCError) {
      const httpCode = getHTTPStatusCodeFromError(cause);
      return res.status(httpCode).json(cause);
    }
    console.error(cause);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default handler;
