import { lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { anbuSquad, userData } from "@/drizzle/schema";
import {
  handleEndpointError,
  lockWithWeeklyTimer,
  updateGameSetting,
} from "@/libs/gamesettings";
import { drizzleDB } from "@/server/db";
import { authenticateCronRequest } from "@/server/utils/cron";
import { periodStart } from "@/utils/time";

const ENDPOINT_NAME = "weekly-pvp";

export async function GET(request: Request) {
  const authError = authenticateCronRequest(request);
  if (authError) return authError;

  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  await cookies();

  // Check timer
  const timerCheck = await lockWithWeeklyTimer(drizzleDB, ENDPOINT_NAME);
  if (!timerCheck.isNewWeek && timerCheck.response) return timerCheck.response;

  // Perform work
  try {
    const weekStart = periodStart("weekly", new Date());
    await Promise.all([
      // Kills earned after the week boundary survive a delayed reset or job retry.
      drizzleDB
        .update(userData)
        .set({
          weeklyPvpKills: 0,
          weeklyPvpKillsAt: weekStart,
          updatedAt: sql`GREATEST(NOW(3), TIMESTAMPADD(MICROSECOND, 1000, ${userData.updatedAt}))`,
        })
        .where(lt(userData.weeklyPvpKillsAt, weekStart)),
      drizzleDB.update(anbuSquad).set({
        pvpActivity: 0,
      }),
    ]);
    return Response.json(`OK`);
  } catch (cause) {
    // Rollback
    await updateGameSetting(drizzleDB, ENDPOINT_NAME, 0, timerCheck.prevTime);
    return await handleEndpointError(cause);
  }
}
