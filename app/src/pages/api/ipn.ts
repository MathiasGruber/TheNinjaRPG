import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { drizzleDB } from "@/server/db";
import { paypalWebhookMessage } from "@/drizzle/schema";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { getPaypalAccessToken } from "@/routers/paypal";
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

  // Verification of the webhook message
  const token = await getPaypalAccessToken();
  const verification = {
    auth_algo: req.headers["paypal-auth-algo"],
    cert_url: req.headers["paypal-cert-url"],
    transmission_id: req.headers["paypal-transmission-id"],
    transmission_sig: req.headers["paypal-transmission-sig"],
    transmission_time: req.headers["paypal-transmission-time"],
    webhook_id: "1EV68140AN4888416",
    webhook_event: body,
  };
  const verified = await verifyWebhookEvent({ body: verification, token: token });
  if (verified.verification_status !== "SUCCESS") {
    console.error(verified);
    res.status(500).json({ message: "Error with verification of event" });
    return;
  }

  // Handle the different events
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

/**
 * Fetch a paypal order
 */
export const verifyWebhookEvent = async (input: { body: any; token: string }) => {
  const order = await fetch(
    `${process.env.NEXT_PUBLIC_PAYPAL_URL}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + input.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.body),
    }
  )
    .then((response) => {
      return response.json();
    })
    .then((data: { verification_status: string }) => {
      return data;
    });
  return order;
};
