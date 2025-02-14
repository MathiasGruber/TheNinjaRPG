import { NextResponse } from "next/server";
import { eq, and, sql, inArray } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { village, userData } from "@/drizzle/schema";
import { updateGameSetting } from "@/libs/gamesettings";
import { lockWithHourlyTimer, handleEndpointError } from "@/libs/gamesettings";
import { KAGE_CHALLENGE_LOSE_PRESTIGE_PER_HOUR } from "@/drizzle/constants";
import { cookies } from "next/headers";

const ENDPOINT_NAME = "hourly-kage-prestige";

export async function GET() {
  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  await cookies();

  // Check timer
  const timerCheck = await lockWithHourlyTimer(drizzleDB, ENDPOINT_NAME);
  if (!timerCheck.isNewHour && timerCheck.response) return timerCheck.response;

  try {
    // Get all kages who have challenges disabled
    const kagesWithClosedChallenges = await drizzleDB.query.village.findMany({
      where: eq(village.openForChallenges, false),
    });
    const kageIds = kagesWithClosedChallenges
      .filter((v) => v.kageId)
      .map((v) => v.kageId);

    if (kageIds.length > 0) {
      await drizzleDB
        .update(userData)
        .set({
          villagePrestige: sql`${userData.villagePrestige} - ${KAGE_CHALLENGE_LOSE_PRESTIGE_PER_HOUR}`,
        })
        .where(and(inArray(userData.userId, kageIds), eq(userData.isAi, false)));
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${kageIds.length} kages`,
    });
  } catch (cause) {
    // Rollback
    await updateGameSetting(drizzleDB, ENDPOINT_NAME, 0, timerCheck.prevTime);
    return handleEndpointError(cause);
  }
}
