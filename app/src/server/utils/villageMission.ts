import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { VillageMissionTask } from "@/drizzle/constants";
import { userData, village, war } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";

/** Atomic counters need no read, including in combat's final mutation phase. */
export const recordVillageMissionProgress = async (
  client: Pick<DrizzleClient, "update">,
  villageId: string | null,
  userId: string,
  events: Partial<Record<VillageMissionTask, number>>,
) => {
  const increments = Object.entries(events).filter(
    ([, increment]) => Number.isFinite(increment) && increment > 0,
  );
  if (!villageId || increments.length === 0) return;
  const argumentsSql = increments.flatMap(([task, increment]) => {
    const path = `$.${task}`;
    return [
      sql`${path}`,
      sql`COALESCE(JSON_EXTRACT(${village.missionCounters}, ${path}), 0) + ${increment}`,
    ];
  });
  await retryOnDeadlock(() =>
    client
      .update(village)
      .set({
        missionCounters: sql`JSON_SET(${village.missionCounters}, ${sql.join(argumentsSql, sql`, `)})`,
      })
      .where(
        and(
          eq(village.id, villageId),
          eq(village.type, "VILLAGE"),
          isNotNull(village.activeMission),
          // A player who changed villages while an activity was in flight cannot credit the old village.
          sql`EXISTS (SELECT 1 FROM ${userData} WHERE ${userData.userId} = ${userId} AND ${userData.villageId} = ${village.id} AND ${userData.isOutlaw} = false)`,
        ),
      ),
  );
};

/**
 * Credit only HP removed by the following shrine write in the same short transaction.
 * The locking scalar subquery reads current HP inside the UPDATE: combat adds no fetch,
 * and concurrent attackers cannot credit the same remaining HP twice.
 */
export const recordVillageMissionShrineDamage = async (
  client: Pick<DrizzleClient, "update">,
  villageId: string,
  userId: string,
  warId: string,
  shrine: "attackerShrineHp" | "defenderShrineHp",
  damage: number,
) => {
  if (damage <= 0) return;
  const hp = war[shrine];
  await client
    .update(village)
    .set({
      missionCounters: sql`JSON_SET(${village.missionCounters}, '$.siege_operation', COALESCE(JSON_EXTRACT(${village.missionCounters}, '$.siege_operation'), 0) + COALESCE((SELECT LEAST(${hp}, ${damage}) FROM ${war} WHERE ${war.id} = ${warId} AND ${war.endedAt} IS NULL FOR UPDATE), 0))`,
    })
    .where(
      and(
        eq(village.id, villageId),
        eq(village.type, "VILLAGE"),
        isNotNull(village.activeMission),
        sql`EXISTS (SELECT 1 FROM ${userData} WHERE ${userData.userId} = ${userId} AND ${userData.villageId} = ${village.id} AND ${userData.isOutlaw} = false)`,
      ),
    );
};
