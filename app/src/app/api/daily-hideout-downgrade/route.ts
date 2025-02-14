import { NextResponse } from "next/server";
import { eq, and, lt, sql, inArray } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { village, clan } from "@/drizzle/schema";
import { updateGameSetting } from "@/libs/gamesettings";
import { lockWithDailyTimer, handleEndpointError } from "@/libs/gamesettings";
import { TOWN_MONTHLY_MAINTENANCE } from "@/drizzle/constants";
import { cookies } from "next/headers";

const ENDPOINT_NAME = "daily-hideout-downgrade";

export async function GET() {
  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  await cookies();

  // Check timer
  const timerCheck = await lockWithDailyTimer(drizzleDB, ENDPOINT_NAME);
  if (!timerCheck.isNewDay && timerCheck.response) return timerCheck.response;

  try {
    // Get all active bans and silences that have expired
    const townsDueForMaintainance = await drizzleDB
      .select()
      .from(village)
      .innerJoin(clan, eq(village.id, clan.villageId))
      .where(
        and(
          eq(village.type, "TOWN"),
          lt(village.lastMaintenancePaidAt, sql`NOW() - INTERVAL 30 DAY`),
        ),
      );

    // Split into those who have the points and those who do now
    const hasFactionPoints = townsDueForMaintainance.filter(
      (v) => v.Clan && v.Clan.points >= TOWN_MONTHLY_MAINTENANCE,
    );
    const missingFactionPoints = townsDueForMaintainance.filter(
      (v) => v.Clan && v.Clan.points < TOWN_MONTHLY_MAINTENANCE,
    );

    // Mutation
    await Promise.all([
      ...(hasFactionPoints.length > 0
        ? [
            drizzleDB
              .update(clan)
              .set({ points: sql`${clan.points} - ${TOWN_MONTHLY_MAINTENANCE}` })
              .where(
                inArray(
                  clan.id,
                  hasFactionPoints.map((v) => v.Clan.id),
                ),
              ),
          ]
        : []),
      ...(missingFactionPoints.length > 0
        ? [
            drizzleDB
              .update(clan)
              .set({ points: 0 })
              .where(
                inArray(
                  clan.id,
                  missingFactionPoints.map((v) => v.Clan.id),
                ),
              ),
            drizzleDB
              .update(village)
              .set({ type: "HIDEOUT" })
              .where(
                inArray(
                  village.id,
                  missingFactionPoints.map((v) => v.Village.id),
                ),
              ),
          ]
        : []),
    ]);

    return NextResponse.json({
      success: true,
      message: `Processed ${townsDueForMaintainance.length} towns`,
    });
  } catch (cause) {
    // Rollback
    await updateGameSetting(drizzleDB, ENDPOINT_NAME, 0, timerCheck.prevTime);
    return handleEndpointError(cause);
  }
}
