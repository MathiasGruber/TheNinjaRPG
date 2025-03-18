import { NextResponse } from "next/server";
import { and, lt, inArray, gt } from "drizzle-orm";
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

    if (expiredReports.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No expired reports to process",
      });
    }

    // Log for debugging
    console.log(`Found ${expiredReports.length} expired reports`);

    // Group reports by user ID and type
    const userBanReports = new Map<string, boolean>();
    const userSilenceReports = new Map<string, boolean>();

    // Track users who are currently banned or silenced
    const bannedUsers = new Map<string, boolean>();
    const silencedUsers = new Map<string, boolean>();

    for (const report of expiredReports) {
      if (!report.reportedUser?.userId) continue;

      const userId = report.reportedUser.userId;

      // Track if user is currently banned or silenced
      if (report.reportedUser.isBanned) {
        bannedUsers.set(userId, true);
      }

      if (report.reportedUser.isSilenced) {
        silencedUsers.set(userId, true);
      }

      // Track which type of report is expiring
      if (report.status === "BAN_ACTIVATED") {
        userBanReports.set(userId, true);
      } else if (report.status === "SILENCE_ACTIVATED") {
        userSilenceReports.set(userId, true);
      }
    }

    // Get all active reports for these users in a single query
    const activeReports = await drizzleDB.query.userReport.findMany({
      where: and(
        inArray(userReport.reportedUserId, [
          ...bannedUsers.keys(),
          ...silencedUsers.keys(),
        ]),
        inArray(userReport.status, ["BAN_ACTIVATED", "SILENCE_ACTIVATED"]),
        gt(userReport.banEnd, new Date()),
      ),
    });

    console.log(`Found ${activeReports.length} active reports for affected users`);

    // Group active reports by user and type
    const userHasActiveBan = new Map<string, boolean>();
    const userHasActiveSilence = new Map<string, boolean>();

    for (const report of activeReports) {
      if (!report.reportedUserId) continue;

      if (report.status === "BAN_ACTIVATED") {
        userHasActiveBan.set(report.reportedUserId, true);
      } else if (report.status === "SILENCE_ACTIVATED") {
        userHasActiveSilence.set(report.reportedUserId, true);
      }
    }

    // Determine which users need to be unbanned or unsilenced
    const usersToUnban: string[] = [];
    const usersToUnsilence: string[] = [];

    // For each banned user, check if they have any active ban reports
    for (const [userId, _] of bannedUsers) {
      // Only unban if they had an expired ban report and have no active ban reports
      if (userBanReports.has(userId) && !userHasActiveBan.has(userId)) {
        usersToUnban.push(userId);
      }
    }

    // For each silenced user, check if they have any active silence reports
    for (const [userId, _] of silencedUsers) {
      // Only unsilence if they had an expired silence report and have no active silence reports
      if (userSilenceReports.has(userId) && !userHasActiveSilence.has(userId)) {
        usersToUnsilence.push(userId);
      }
    }

    console.log(
      `Users to unban: ${usersToUnban.length}, Users to unsilence: ${usersToUnsilence.length}`,
    );

    // Execute updates in batch if needed
    const updates = [];

    if (usersToUnban.length > 0) {
      updates.push(
        drizzleDB
          .update(userData)
          .set({ isBanned: false })
          .where(inArray(userData.userId, usersToUnban)),
      );
    }

    if (usersToUnsilence.length > 0) {
      updates.push(
        drizzleDB
          .update(userData)
          .set({ isSilenced: false })
          .where(inArray(userData.userId, usersToUnsilence)),
      );
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${expiredReports.length} expired reports. Unbanned ${usersToUnban.length} users and unsilenced ${usersToUnsilence.length} users.`,
      details: {
        expiredReportsCount: expiredReports.length,
        activeReportsCount: activeReports.length,
        bannedUsersCount: bannedUsers.size,
        silencedUsersCount: silencedUsers.size,
        usersToUnbanCount: usersToUnban.length,
        usersToUnsilenceCount: usersToUnsilence.length,
        usersToUnban,
        usersToUnsilence,
      },
    });
  } catch (cause) {
    // Rollback
    await updateGameSetting(drizzleDB, ENDPOINT_NAME, 0, timerCheck.prevTime);
    return handleEndpointError(cause);
  }
}
