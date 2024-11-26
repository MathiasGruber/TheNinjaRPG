import { drizzleDB } from "@/server/db";
import { dailyReset } from "@/drizzle/schema";
import { eq, gte, and } from "drizzle-orm";
import { lockWithGameTimer, handleEndpointError } from "@/libs/gamesettings";

export async function GET() {
  try {
    // Ensure this function doesn't run too frequently
    const timerCheck = await lockWithGameTimer(drizzleDB, 3, "h", "daily-reset-check");
    if (timerCheck) return timerCheck;

    // Get the current game date (adjust as per game time logic if needed)
    const gameNow = new Date();
    const gameDayStart = new Date(
      gameNow.getFullYear(),
      gameNow.getMonth(),
      gameNow.getDate(),
    );
    const gameDayEnd = new Date(gameDayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    // Define the required resets
    const requiredResets = ["daily-bank", "daily-counters", "daily-pvp", "daily-quest"];

    for (const resetType of requiredResets) {
      // Check if a successful reset for this type exists today
      const existingReset = await drizzleDB.query.dailyReset.findFirst({
        where: and(
          eq(dailyReset.resetType, resetType),
          eq(dailyReset.status, "completed"),
          gte(dailyReset.executedDate, gameDayStart),
        ),
      });

      if (!existingReset) {
        // Attempt to trigger the reset by calling its endpoint
        const resetResponse = await fetch(`/api/${resetType}`, {
          method: "GET",
        });

        if (!resetResponse.ok) {
          // Log a failed attempt in the database
          await drizzleDB.insert(dailyReset).values({
            id: crypto.randomUUID(),
            resetType,
            scheduledDate: gameNow.toISOString(),
            executedDate: null,
            status: "failed",
            lastChecked: gameNow.toISOString(),
            retryCount: 0,
            isManualOverride: false,
            errorLog: `Failed to trigger reset for ${resetType}: ${resetResponse.statusText}`,
          });
        }
      }
    }

    return Response.json(`Daily reset check completed`, { status: 200 });
  } catch (cause) {
    return handleEndpointError(cause);
  }
}
