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

    // Claim maintenance and charge or downgrade together, using the current locked balance.
    await Promise.all(
      strongholdsDueForMaintainance.map(({ Clan: faction, Village: settlement }) => {
        const guards = and(
          eq(clan.id, faction.id),
          eq(village.id, settlement.id),
          eq(village.type, "STRONGHOLD"),
          eq(village.lastMaintenancePaidAt, settlement.lastMaintenancePaidAt),
        );
        // LIMIT prevents derived-table merging. The locking snapshot keeps the payment
        // decision independent of joined UPDATE assignment order and sees waiting debits.
        const snapshot = drizzleDB
          .select({ id: village.id, points: clan.points })
          .from(village)
          .innerJoin(clan, eq(clan.villageId, village.id))
          .where(guards)
          .limit(1)
          .for("update")
          .as("maintenance_snapshot");
        const canPay = gte(snapshot.points, STRONGHOLD_MONTHLY_MAINTENANCE);
        return retryOnDeadlock(() =>
          drizzleDB.execute(sql`
            UPDATE ${village}
            INNER JOIN ${clan} ON ${clan.villageId} = ${village.id}
            INNER JOIN ${snapshot} ON ${snapshot.id} = ${village.id}
            SET ${clan.points} = IF(${canPay}, ${snapshot.points} - ${STRONGHOLD_MONTHLY_MAINTENANCE}, ${snapshot.points}),
                ${village.lastMaintenancePaidAt} = ${new Date()},
                ${village.type} = IF(${canPay}, ${village.type}, 'HIDEOUT'),
                ${village.wasDowngraded} = IF(${canPay}, ${village.wasDowngraded}, TRUE)
            WHERE ${guards}
          `),
        );
      }),
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
