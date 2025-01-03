import { NextResponse } from "next/server";
import { eq, and, lt, inArray } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userReport, userData } from "@/drizzle/schema";
import { updateGameSetting } from "@/libs/gamesettings";
import { lockWithDailyTimer, handleEndpointError } from "@/libs/gamesettings";
import { cookies } from "next/headers";

const ENDPOINT_NAME = "daily-reports";

export async function GET() {
  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  await cookies();

  // Check timer
  const timerCheck = await lockWithDailyTimer(drizzleDB, ENDPOINT_NAME);
  // if (!timerCheck.isNewDay && timerCheck.response) return timerCheck.response;

  try {
    // Get all active bans and silences that have expired
    const expiredReports = await drizzleDB.query.userReport.findMany({
      where: and(
        inArray(userReport.status, ["BAN_ACTIVATED", "SILENCE_ACTIVATED"]),
        lt(userReport.banEnd, new Date()),
      ),
      with: {
        reportedUser: {
          columns: {
            userId: true,
            isBanned: true,
            isSilenced: true,
          },
        },
      },
    });

    // Process each expired report
    for (const report of expiredReports) {
      if (report.status === "BAN_ACTIVATED" && report.reportedUser?.isBanned) {
        // Unban user if ban has expired
        await drizzleDB
          .update(userData)
          .set({ isBanned: false })
          .where(eq(userData.userId, report.reportedUser.userId));
      } else if (
        report.status === "SILENCE_ACTIVATED" &&
        report.reportedUser?.isSilenced
      ) {
        // Unsilence user if silence has expired
        await drizzleDB
          .update(userData)
          .set({ isSilenced: false })
          .where(eq(userData.userId, report.reportedUser.userId));
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${expiredReports.length} expired reports`,
    });
  } catch (cause) {
    // Rollback
    await updateGameSetting(drizzleDB, ENDPOINT_NAME, 0, timerCheck.prevTime);
    return handleEndpointError(cause);
  }
}
