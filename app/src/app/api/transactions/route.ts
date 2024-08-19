import { TRPCError } from "@trpc/server";
import { drizzleDB } from "@/server/db";
import { getPaypalAccessToken } from "@/server/api/routers/paypal";
import { syncTransactions } from "@/server/api/routers/paypal";
import { getPaypalTransactions } from "@/server/api/routers/paypal";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { updateGameSetting, checkGameTimer } from "@/libs/gamesettings";
import { cookies } from "next/headers";

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
