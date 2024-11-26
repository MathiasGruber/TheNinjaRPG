import { sql } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userData, dailyReset } from "@/drizzle/schema";
import { lockWithGameTimer, handleEndpointError } from "@/libs/gamesettings";
import { cookies } from "next/headers";

export async function GET() {
  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  cookies();

  // Check timer
  const response = await lockWithGameTimer(drizzleDB, 24, "h", "daily-counters");
  if (response) return response;

  try {
    await drizzleDB.update(userData).set({
      villagePrestige: sql`${userData.villagePrestige} + 1`,
      dailyArenaFights: 0,
      dailyMissions: 0,
      dailyErrands: 0,
      dailyTrainings: 0,
    });

    await drizzleDB.insert(dailyReset).values({
      id: crypto.randomUUID(), // Generate a unique ID for the reset entry
      resetType: "daily-pvp",
      scheduledDate: new Date().toISOString(), // Use current timestamp for scheduled date
      executedDate: new Date().toISOString(), // Log the execution timestamp
      status: "completed", // Mark as completed since the reset was successful
      lastChecked: new Date().toISOString(),
      retryCount: 0,
      isManualOverride: false,
    });
    return Response.json(`OK`);
  } catch (cause) {
    await drizzleDB.insert(dailyReset).values({
      id: crypto.randomUUID(),
      resetType: "daily-pvp",
      scheduledDate: new Date().toISOString(),
      executedDate: null, // No execution timestamp since it failed
      status: "failed",
      lastChecked: new Date().toISOString(),
      retryCount: 0,
      isManualOverride: false,
      errorLog: String(cause), // Capture the error for debugging
    });
    return handleEndpointError(cause);
  }
}
