import { eq, sql } from "drizzle-orm";
import { PVP_EXPERIENCE_AVERAGE_SETTING } from "@/drizzle/constants";
import type { GameSetting } from "@/drizzle/schema";
import { userData } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { scopedRead } from "@/server/requestScope";

// The average scans every human UserData row and moves only slowly, while combat,
// travel, quests, profile and the user queue read it on almost every request. Each
// server instance therefore keeps it for a few minutes; a boost tier computed from
// an average that is minutes old is indistinguishable from a fresh one.
const PVP_EXPERIENCE_AVERAGE_TTL_MS = 5 * 60 * 1000;

interface CachedAverage {
  value: number;
  fetchedAt: number;
}

let cachedAverage: CachedAverage | null = null;
// Concurrent misses share one query instead of each scanning the table.
let pendingAverage: Promise<CachedAverage> | null = null;

/** Query the population average and store it in the instance cache. */
const loadAverage = async (client: Pick<DrizzleClient, "select">) => {
  const [row] = await client
    .select({
      average: sql<number>`COALESCE(AVG(${userData.pvpExperience}), 0)`.mapWith(Number),
    })
    .from(userData)
    .where(eq(userData.isAi, false));
  cachedAverage = { value: row?.average ?? 0, fetchedAt: Date.now() };
  return cachedAverage;
};

/**
 * Average PvP experience of human players (AI templates excluded), as a game setting.
 *
 * Served from a per-instance cache that lives for PVP_EXPERIENCE_AVERAGE_TTL_MS; a miss
 * issues one query shared by every concurrent caller, and a failed query is not cached.
 * `scopedRead` still shares the result across the procedures of one tRPC batch.
 */
export const fetchPvpExperienceAverage = (
  client: Pick<DrizzleClient, "select">,
): Promise<GameSetting> =>
  scopedRead("pvpExperienceAverage", async () => {
    let average = cachedAverage;
    if (!average || Date.now() - average.fetchedAt >= PVP_EXPERIENCE_AVERAGE_TTL_MS) {
      pendingAverage ??= loadAverage(client).finally(() => {
        pendingAverage = null;
      });
      average = await pendingAverage;
    }
    return {
      id: PVP_EXPERIENCE_AVERAGE_SETTING,
      name: PVP_EXPERIENCE_AVERAGE_SETTING,
      value: average.value,
      time: new Date(average.fetchedAt),
    };
  });

/** Drop the cached average. Used by tests that need a fresh read. */
export const resetPvpExperienceAverageCache = (): void => {
  cachedAverage = null;
  pendingAverage = null;
};
