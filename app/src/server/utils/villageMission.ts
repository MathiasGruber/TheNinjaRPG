import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  type VillageMissionTask,
  WAR_SHRINE_CAPTURE_WARHEALTH_DMG,
} from "@/drizzle/constants";
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
 * Remove shrine HP and credit eligible village progress in one atomic statement.
 * LIMIT prevents merging the derived table, preserving pre-damage HP independently
 * of multi-table assignment order. Its locking read serializes concurrent damage
 * inside the UPDATE, without an application fetch or transaction round-trips.
 */
export const applyVillageMissionShrineDamage = async (
  client: Pick<DrizzleClient, "execute">,
  villageId: string | null,
  userId: string,
  warId: string,
  shrine: "attackerShrineHp" | "defenderShrineHp",
  damage: number,
  canCapture = false,
) => {
  if (damage <= 0) return false;
  const hp = war[shrine];
  const status =
    shrine === "attackerShrineHp" ? war.attackerShrineStatus : war.defenderShrineStatus;
  const health =
    shrine === "attackerShrineHp" ? war.attackerWarHealth : war.defenderWarHealth;
  const assignments = [
    sql`${hp} = GREATEST(shrine_snapshot.hp - ${damage}, 0)`,
    ...(villageId
      ? [
          sql`${village.missionCounters} = JSON_SET(${village.missionCounters}, '$.siege_operation', COALESCE(JSON_EXTRACT(${village.missionCounters}, '$.siege_operation'), 0) + LEAST(shrine_snapshot.hp, ${damage}))`,
        ]
      : []),
    ...(canCapture
      ? [
          // MySQL has no UPDATE RETURNING: LAST_INSERT_ID(expr) returns the capture
          // flag in this statement's OK packet while IF stores the required status.
          sql`${status} = IF(LAST_INSERT_ID(shrine_snapshot.shouldCapture), 'CAPTURED', shrine_snapshot.status)`,
          sql`${health} = IF(shrine_snapshot.shouldCapture, GREATEST(${health} - ${WAR_SHRINE_CAPTURE_WARHEALTH_DMG}, 0), ${health})`,
        ]
      : []),
  ];
  const result = await client.execute(sql`
    UPDATE ${war}
    INNER JOIN (
      SELECT ${war.id} AS id, ${hp} AS hp, ${status} AS status,
        ${canCapture ? sql`IF(${status} = 'ACTIVE' AND ${hp} <= ${damage}, 1, 0)` : sql`0`} AS shouldCapture
      FROM ${war}
      WHERE ${war.id} = ${warId} AND ${war.endedAt} IS NULL
      LIMIT 1 FOR UPDATE
    ) AS shrine_snapshot ON ${war.id} = shrine_snapshot.id
    ${
      villageId
        ? sql`LEFT JOIN ${village}
      ON ${village.id} = ${villageId}
      AND ${village.type} = 'VILLAGE'
      AND ${village.activeMission} IS NOT NULL
      AND EXISTS (SELECT 1 FROM ${userData} WHERE ${userData.userId} = ${userId} AND ${userData.villageId} = ${village.id} AND ${userData.isOutlaw} = false)`
        : sql``
    }
    SET ${sql.join(assignments, sql`, `)}
    WHERE ${war.id} = ${warId} AND ${war.endedAt} IS NULL
  `);
  return canCapture && result.rowsAffected > 0 && result.insertId === "1";
};
