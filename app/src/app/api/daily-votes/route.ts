import { drizzleDB } from "@/server/db";
import { userVote } from "@/drizzle/schema";
import { updateGameSetting } from "@/libs/gamesettings";
import { ACTIVE_VOTING_SITES } from "@/drizzle/constants";
import { lockWithDailyTimer, handleEndpointError } from "@/libs/gamesettings";
import { cookies } from "next/headers";

const ENDPOINT_NAME = "daily-votes";

export async function GET() {
  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  await cookies();

  // Check timer
  const timerCheck = await lockWithDailyTimer(drizzleDB, ENDPOINT_NAME);
  if (!timerCheck.isNewDay && timerCheck.response) return timerCheck.response;

  // Perform work
  try {
    await drizzleDB.update(userVote).set({
      claimed: false,
      ...Object.fromEntries(ACTIVE_VOTING_SITES.map((site) => [site, false])),
    });
    return Response.json(`OK`);
  } catch (cause) {
    // Rollback
    await updateGameSetting(drizzleDB, ENDPOINT_NAME, 0, timerCheck.prevTime);
    return handleEndpointError(cause);
  }
}
