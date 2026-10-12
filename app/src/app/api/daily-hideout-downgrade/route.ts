import { and, eq, gte, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { STRONGHOLD_MONTHLY_MAINTENANCE } from "@/drizzle/constants";
import { clan, village } from "@/drizzle/schema";
import {
  handleEndpointError,
  lockWithDailyTimer,
  updateGameSetting,
} from "@/libs/gamesettings";
import { drizzleDB } from "@/server/db";
import { authenticateCronRequest } from "@/server/utils/cron";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";

const ENDPOINT_NAME = "daily-hideout-downgrade";

export async function GET(request: Request) {
  const authError = authenticateCronRequest(request);
  if (authError) return authError;

  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  await cookies();

  // Check timer
  const timerCheck = await lockWithDailyTimer(drizzleDB, ENDPOINT_NAME);
  if (!timerCheck.isNewDay && timerCheck.response) return timerCheck.response;

  try {
    // Fetch Strongholds whose monthly maintenance is due.
    const strongholdsDueForMaintainance = await drizzleDB
      .select()
      .from(village)
      .innerJoin(clan, eq(village.id, clan.villageId))
      .where(
        and(
          eq(village.type, "STRONGHOLD"),
          lt(village.lastMaintenancePaidAt, sql`NOW() - INTERVAL 30 DAY`),
        ),
      );

    // The maintenance claim and charge commit together; a concurrent debit cannot overdraw faction points.
    await Promise.all(
      strongholdsDueForMaintainance.map(({ Clan: faction, Village: settlement }) =>
        retryOnDeadlock(() =>
          drizzleDB.transaction(async (tx) => {
            const claimed = await tx
              .update(village)
              .set({ lastMaintenancePaidAt: new Date() })
              .where(
                and(
                  eq(village.id, settlement.id),
                  eq(village.type, "STRONGHOLD"),
                  eq(village.lastMaintenancePaidAt, settlement.lastMaintenancePaidAt),
                ),
              );
            if (claimed.rowsAffected === 0) return;
            const payment = await tx
              .update(clan)
              .set({ points: sql`${clan.points} - ${STRONGHOLD_MONTHLY_MAINTENANCE}` })
              .where(
                and(
                  eq(clan.id, faction.id),
                  gte(clan.points, STRONGHOLD_MONTHLY_MAINTENANCE),
                ),
              );
            if (payment.rowsAffected === 0)
              await tx
                .update(village)
                .set({ type: "HIDEOUT", wasDowngraded: true })
                .where(eq(village.id, settlement.id));
          }),
        ),
      ),
    );

    return NextResponse.json({
      success: true,
      message: `Processed ${strongholdsDueForMaintainance.length} strongholds`,
    });
  } catch (cause) {
    // Rollback
    await updateGameSetting(drizzleDB, ENDPOINT_NAME, 0, timerCheck.prevTime);
    return await handleEndpointError(cause);
  }
}
