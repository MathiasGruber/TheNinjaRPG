import { and, eq, exists, isNotNull, isNull, lte, sql } from "drizzle-orm";
import {
  type VillageMissionTask,
  WAR_SHRINE_CAPTURE_WARHEALTH_DMG,
} from "@/drizzle/constants";
import { userData, village, war } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { warRaidCombatGuard } from "@/server/utils/war";

/** Atomic counters need no read, including in combat's final mutation phase. */
export const recordVillageMissionProgress = async (
  client: Pick<DrizzleClient, "update" | "select">,
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
          exists(
            client
              .select({ userId: userData.userId })
              .from(userData)
              .where(
                and(
                  eq(userData.userId, userId),
                  eq(userData.villageId, village.id),
                  eq(userData.isOutlaw, false),
                ),
              ),
          ),
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
  client: Pick<DrizzleClient, "execute" | "select">,
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
  const snapshot = client
    .select({
      id: war.id,
      hp,
      status,
      shouldCapture: (canCapture
        ? sql<number>`IF(${and(eq(status, "ACTIVE"), lte(hp, damage))}, 1, 0)`
        : sql<number>`0`
      ).as("shouldCapture"),
    })
    .from(war)
    .where(and(eq(war.id, warId), isNull(war.endedAt), warRaidCombatGuard()))
    .limit(1)
    .for("update")
    .as("shrine_snapshot");
  // Drizzle emits computed selection aliases without table qualification in SQL
  // fragments, so qualify this derived field explicitly.
  const captureFlag = sql`${sql.identifier("shrine_snapshot")}.${sql.identifier("shouldCapture")}`;
  const eligibleVillage = and(
    eq(village.id, villageId ?? ""),
    eq(village.type, "VILLAGE"),
    isNotNull(village.activeMission),
    exists(
      client
        .select({ userId: userData.userId })
        .from(userData)
        .where(
          and(
            eq(userData.userId, userId),
            eq(userData.villageId, village.id),
            eq(userData.isOutlaw, false),
          ),
        ),
    ),
  );
  const assignments = [
    sql`${hp} = GREATEST(${snapshot.hp} - ${damage}, 0)`,
    ...(villageId
      ? [
          sql`${village.missionCounters} = JSON_SET(${village.missionCounters}, '$.siege_operation', COALESCE(JSON_EXTRACT(${village.missionCounters}, '$.siege_operation'), 0) + LEAST(${snapshot.hp}, ${damage}))`,
        ]
      : []),
    ...(canCapture
      ? [
          // MySQL has no UPDATE RETURNING: LAST_INSERT_ID(expr) returns the capture
          // flag in this statement's OK packet while IF stores the required status.
          sql`${status} = IF(LAST_INSERT_ID(${captureFlag}), 'CAPTURED', ${snapshot.status})`,
          sql`${health} = IF(${captureFlag}, GREATEST(${health} - ${WAR_SHRINE_CAPTURE_WARHEALTH_DMG}, 0), ${health})`,
        ]
      : []),
  ];
  // Drizzle's MySQL builder cannot update multiple tables; only the joined write
  // needs SQL, while its snapshot and guards use the typed query builders.
  const result = await client.execute(sql`
    UPDATE ${war}
    INNER JOIN ${snapshot} ON ${eq(war.id, snapshot.id)}
    ${villageId ? sql`LEFT JOIN ${village} ON ${eligibleVillage}` : sql``}
    SET ${sql.join(assignments, sql`, `)}
    WHERE ${and(eq(war.id, warId), isNull(war.endedAt), warRaidCombatGuard())}
  `);
  return canCapture && result.rowsAffected > 0 && result.insertId === "1";
};
