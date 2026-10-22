import { and, eq, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import {
  CLAN_BOOST_PERCENT_PER_LEVEL,
  PVP_EXPERIENCE_DAILY_DECAY,
} from "@/drizzle/constants";
import { anbuSquad, clan, userData } from "@/drizzle/schema";
import { handleEndpointError, lockWithDailyTimer } from "@/libs/gamesettings";
import { drizzleDB } from "@/server/db";
import { authenticateCronRequest } from "@/server/utils/cron";
import { periodStart } from "@/utils/time";

const ENDPOINT_NAME = "daily-pvp";

export async function GET(request: Request) {
  const authError = authenticateCronRequest(request);
  if (authError) return authError;

  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  await cookies();

  // Check timer
  const timerCheck = await lockWithDailyTimer(drizzleDB, ENDPOINT_NAME);
  if (!timerCheck.isNewDay && timerCheck.response) return timerCheck.response;

  // Perform work
  try {
    const dayStart = periodStart("daily", new Date());
    await Promise.all([
      // A failed sibling write can retry this job without decaying XP twice.
      // Leave updatedAt alone: it doubles as last activity (online counts, cleanup,
      // sector lists), and no snapshot claim writes these columns as absolute values.
      drizzleDB
        .update(userData)
        .set({
          pvpExperience: sql`FLOOR(${userData.pvpExperience} * ${1 - PVP_EXPERIENCE_DAILY_DECAY} * 100) / 100`,
          pvpExperienceDecayAt: dayStart,
        })
        .where(
          and(eq(userData.isAi, false), lt(userData.pvpExperienceDecayAt, dayStart)),
        ),
      drizzleDB.update(anbuSquad).set({
        pvpActivity: sql`${anbuSquad.pvpActivity} * 0.95`,
      }),
      drizzleDB.update(clan).set({
        pvpActivity: sql`${clan.pvpActivity} * 0.95`,
        trainingBoost: sql`GREATEST(${clan.trainingBoost} - ${CLAN_BOOST_PERCENT_PER_LEVEL}, 0)`,
        ryoBoost: sql`GREATEST(${clan.ryoBoost} - ${CLAN_BOOST_PERCENT_PER_LEVEL}, 0)`,
        regenBoost: sql`GREATEST(${clan.regenBoost} - ${CLAN_BOOST_PERCENT_PER_LEVEL}, 0)`,
        missionRewardBoost: sql`GREATEST(${clan.missionRewardBoost} - ${CLAN_BOOST_PERCENT_PER_LEVEL}, 0)`,
        craftingTimeBoost: sql`GREATEST(${clan.craftingTimeBoost} - ${CLAN_BOOST_PERCENT_PER_LEVEL}, 0)`,
        craftingExpBoost: sql`GREATEST(${clan.craftingExpBoost} - ${CLAN_BOOST_PERCENT_PER_LEVEL}, 0)`,
        hunterExpBoost: sql`GREATEST(${clan.hunterExpBoost} - ${CLAN_BOOST_PERCENT_PER_LEVEL}, 0)`,
        gathererExpBoost: sql`GREATEST(${clan.gathererExpBoost} - ${CLAN_BOOST_PERCENT_PER_LEVEL}, 0)`,
      }),
    ]);
    return Response.json(`OK`);
  } catch (cause) {
    // Rollback
    await timerCheck.release();
    return await handleEndpointError(cause);
  }
}
