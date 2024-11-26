import { eq, inArray, isNull, isNotNull, and, or, sql } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { quest, questHistory, userData, dailyReset } from "@/drizzle/schema";
import { UserRanks } from "@/drizzle/constants";
import { availableQuestLetterRanks } from "@/libs/train";
import { sleep } from "@/utils/time";
import { lockWithGameTimer, handleEndpointError } from "@/libs/gamesettings";
import { upsertQuestEntries } from "@/routers/quests";
import { cookies } from "next/headers";

export async function GET() {
  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  cookies();

  // Check timer
  const response = await lockWithGameTimer(drizzleDB, 24, "h", "daily-quest");
  if (response) return response;

  // Query
  const villages = await drizzleDB.query.village.findMany({
    with: { structures: true },
  });

  try {
    // Reset all current dailies
    await drizzleDB
      .update(questHistory)
      .set({ completed: 0, endAt: new Date() })
      .where(and(eq(questHistory.questType, "daily"), eq(questHistory.completed, 0)));

    // For each user rank, get a random daily quest
    for (const rank of UserRanks) {
      const ranks = availableQuestLetterRanks(rank);
      if (ranks.length > 0) {
        for (const village of villages) {
          const newDaily = await drizzleDB.query.quest.findFirst({
            where: and(
              eq(quest.questType, "daily"),
              isNotNull(quest.content),
              inArray(quest.questRank, ranks),
              or(
                isNull(quest.requiredVillage),
                eq(quest.requiredVillage, village.id ?? ""),
              ),
            ),
            orderBy: sql`RAND()`,
          });
          if (newDaily) {
            await upsertQuestEntries(
              drizzleDB,
              newDaily,
              and(eq(userData.rank, rank), eq(userData.villageId, village.id)),
            );
          }
        }
      }
      // Await a bit to avoid too many open connections
      await sleep(500);
    }

    await drizzleDB.insert(dailyReset).values({
      id: crypto.randomUUID(), // Generate a unique ID for the reset entry
      resetType: "daily-quest",
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
      resetType: "daily-quest",
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
