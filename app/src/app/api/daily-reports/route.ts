import { NextResponse } from "next/server";
import { eq, and, lt, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { userReport, userData } from "@/drizzle/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get all active bans and silences that have expired
    const expiredReports = await db.query.userReport.findMany({
      where: and(
        inArray(userReport.status, ["BAN_ACTIVATED", "SILENCE_ACTIVATED"]),
        lt(userReport.banEnd, new Date())
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
      if (report.status === "BAN_ACTIVATED" && report.reportedUser.isBanned) {
        // Unban user if ban has expired
        await db
          .update(userData)
          .set({ isBanned: false })
          .where(eq(userData.userId, report.reportedUserId));
      } else if (report.status === "SILENCE_ACTIVATED" && report.reportedUser.isSilenced) {
        // Unsilence user if silence has expired
        await db
          .update(userData)
          .set({ isSilenced: false })
          .where(eq(userData.userId, report.reportedUserId));
      }

      // Update report status to indicate it's no longer active
      await db
        .update(userReport)
        .set({ status: "REPORT_CLEARED" })
        .where(eq(userReport.id, report.id));
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${expiredReports.length} expired reports`,
    });
  } catch (error) {
    console.error("Error in daily-reports:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
