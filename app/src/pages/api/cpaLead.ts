import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { drizzleDB } from "@/server/db";
import { cpaLeadConversion } from "@/drizzle/schema";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import type { NextApiRequest, NextApiResponse } from "next";
// TODO: Import from env

type LeadType = {
  campaign_id: string;
  campaign_name: string;
  subid: string;
  payout: number;
  ip_address: string;
  gateway_id: string;
  lead_id: string;
  country_iso: string;
  password: string;
  virtual_currency: number;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Request IP
  let ip = req.headers["x-forwarded-for"];
  ip = typeof ip === "string" ? ip.split(/, /)[0] : req.socket.remoteAddress;

  // Create context
  const body = req.query as unknown as LeadType;

  // Check password
  if (body.password !== process.env.CPALEAD_PASS) {
    return res.status(403).json(`Invalid password`);
  }

  // Check IP
  if (ip !== process.env.CPALEAD_IP) {
    return res.status(401).json(`Invalid IP: ${ip}`);
  }

  // Handle the different events
  try {
    await drizzleDB.insert(cpaLeadConversion).values({
      id: nanoid(),
      userId: body.subid,
      campaignId: body.campaign_id,
      campaignName: body.campaign_name,
      payout: body.payout,
      ipAddress: body.ip_address,
      gatewayId: body.gateway_id,
      leadId: body.lead_id,
      countryIso: body.country_iso,
      virtualCurrency: body.virtual_currency,
    });
    return res.status(200).json("OK");
  } catch (cause) {
    if (cause instanceof TRPCError) {
      const httpCode = getHTTPStatusCodeFromError(cause);
      return res.status(httpCode).json(cause);
    }
    console.error(cause);
    return res.status(500).json("Internal server error");
  }
};

export default handler;
