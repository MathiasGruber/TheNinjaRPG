import { type NextApiRequest, type NextApiResponse } from "next";
import { nanoid } from "nanoid";
import { paypalWebhookMessage } from "../../../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { appRouter } from "../../server/api/root";
import { createTRPCContext } from "../../server/api/trpc";

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
  const ctx = createTRPCContext({ req, res });
  const caller = appRouter.createCaller(ctx);
  const body = req.body as IBody;

  try {
    let handled = false;
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
        handled = true;
        await caller.paypal.resolveSubscription({
          subscriptionId: body.resource.id,
        });
        break;
      default:
        break;
    }
    await ctx.drizzle.insert(paypalWebhookMessage).values({
      id: nanoid(),
      rawData: body,
      eventType: body.event_type,
      handled: handled ? 1 : 0,
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
