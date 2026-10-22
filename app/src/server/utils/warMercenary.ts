import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { WAR_MERCENARY_RYO_PER_TOKEN } from "@/drizzle/constants";
import { userData, war, warCamp, warMercenary } from "@/drizzle/schema";
import { getWarSide, isObjectiveWarActive } from "@/libs/objectiveWar";
import { errorResponse } from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { isMysqlDuplicateKeyError, retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { activeWarAllyWhere } from "@/server/utils/warAlly";

/** Accepted contracts are loaded with the parent war, then frozen into battle state. */
export const activeWarMercenaryWhere = () =>
  and(isNotNull(warMercenary.acceptedAt), isNull(warMercenary.endedAt));

/** One indexed membership read; callers schedule it with their other initial queries. */
export const fetchMercenaryWarId = async (client: DrizzleClient, userId: string) => {
  const rows = await client
    .select({ warId: warMercenary.warId })
    .from(warMercenary)
    .innerJoin(war, eq(war.id, warMercenary.warId))
    .where(
      and(
        eq(warMercenary.userId, userId),
        activeWarMercenaryWhere(),
        eq(war.status, "ACTIVE"),
        isNull(war.endedAt),
        sql`${war.attackerWarHealth} > 0 AND ${war.defenderWarHealth} > 0 AND SYSDATE(3) < DATE_ADD(${war.combatStartedAt}, INTERVAL CAST(JSON_EXTRACT(${war.rules}, '$.durationDays') AS UNSIGNED) DAY)`,
      ),
    );
  return rows[0]?.warId ?? null;
};

/** Recheck live affiliation when a mission is claimed, including a racing resignation. */
export const warMissionMembershipGuard = (
  warId: string,
  side: string,
  userId: string,
) => sql`
  (NOT EXISTS (SELECT 1 FROM WarMercenary exclusiveMerc INNER JOIN War exclusiveWar ON exclusiveWar.id = exclusiveMerc.warId
      WHERE exclusiveMerc.userId = ${userId} AND exclusiveMerc.warId != ${warId} AND exclusiveMerc.acceptedAt IS NOT NULL AND exclusiveMerc.endedAt IS NULL AND exclusiveWar.status = 'ACTIVE' AND exclusiveWar.endedAt IS NULL
      AND exclusiveWar.attackerWarHealth > 0 AND exclusiveWar.defenderWarHealth > 0 AND SYSDATE(3) < DATE_ADD(exclusiveWar.combatStartedAt, INTERVAL CAST(JSON_EXTRACT(exclusiveWar.rules, '$.durationDays') AS UNSIGNED) DAY)))
  AND ((${userData.villageId} = ${side} OR EXISTS (SELECT 1 FROM WarAlly ally WHERE ally.warId = ${warId}
      AND ally.villageId = ${userData.villageId} AND ally.supportVillageId = ${side} AND ally.acceptedAt IS NOT NULL AND ally.endedAt IS NULL))
   OR EXISTS (SELECT 1 FROM WarMercenary merc WHERE merc.warId = ${warId} AND merc.userId = ${userId}
     AND merc.sideVillageId = ${side} AND merc.acceptedAt IS NOT NULL AND merc.endedAt IS NULL))`;

/** Debit, pay and claim the invitation in one statement; retries cannot pay twice. */
export const acceptWarMercenary = async (
  client: DrizzleClient,
  id: string,
  userId: string,
) => {
  await client.execute(sql`UPDATE WarMercenary m INNER JOIN War w ON w.id = m.warId
    SET m.endedAt = COALESCE(w.endedAt, SYSDATE(3))
    WHERE m.userId = ${userId} AND m.endedAt IS NULL AND (w.status != 'ACTIVE' OR w.endedAt IS NOT NULL OR w.attackerWarHealth <= 0 OR w.defenderWarHealth <= 0 OR SYSDATE(3) >= DATE_ADD(w.combatStartedAt, INTERVAL CAST(JSON_EXTRACT(w.rules, '$.durationDays') AS UNSIGNED) DAY))`);
  try {
    const result = await retryOnDeadlock(() =>
      client.execute(sql`
      UPDATE WarMercenary m
      INNER JOIN War w ON w.id = m.warId
      INNER JOIN Village payer ON payer.id = m.sideVillageId
      INNER JOIN UserData recipient ON recipient.userId = m.userId
      SET payer.tokens = payer.tokens - m.tokens,
        recipient.money = recipient.money + m.tokens * ${WAR_MERCENARY_RYO_PER_TOKEN},
        m.acceptedAt = SYSDATE(3)
      WHERE m.id = ${id} AND m.userId = ${userId} AND m.acceptedAt IS NULL AND m.endedAt IS NULL
        AND w.status = 'ACTIVE' AND w.endedAt IS NULL AND w.rules IS NOT NULL
        AND w.attackerWarHealth > 0 AND w.defenderWarHealth > 0
        AND SYSDATE(3) < DATE_ADD(w.combatStartedAt, INTERVAL CAST(JSON_EXTRACT(w.rules, '$.durationDays') AS UNSIGNED) DAY)
        AND payer.kageId = m.invitedById AND payer.tokens >= m.tokens
        AND payer.id IN (w.attackerVillageId, w.defenderVillageId)
        AND NOT EXISTS (SELECT 1 FROM War otherWar WHERE otherWar.id != w.id AND otherWar.status = 'ACTIVE' AND otherWar.endedAt IS NULL AND (recipient.villageId IN (otherWar.attackerVillageId, otherWar.defenderVillageId) OR EXISTS (SELECT 1 FROM WarAlly otherAlly WHERE otherAlly.warId = otherWar.id AND otherAlly.villageId = recipient.villageId AND otherAlly.acceptedAt IS NOT NULL AND otherAlly.endedAt IS NULL)))
        AND recipient.isBanned = FALSE AND recipient.isAi = FALSE AND recipient.status != 'BATTLE' AND recipient.warMission IS NULL
        AND (recipient.villageId IS NULL OR recipient.villageId != payer.id)
        AND (recipient.villageId IS NULL OR recipient.villageId != IF(payer.id = w.attackerVillageId, w.defenderVillageId, w.attackerVillageId))
        AND NOT EXISTS (SELECT 1 FROM WarAlly enemy WHERE enemy.warId = w.id AND enemy.villageId = recipient.villageId
          AND enemy.supportVillageId != payer.id AND enemy.acceptedAt IS NOT NULL AND enemy.endedAt IS NULL)
    `),
    );
    return result.rowsAffected > 0
      ? {
          success: true,
          message: "Contract accepted. Your Ryo payment has been delivered.",
        }
      : errorResponse(
          "The offer, war, Kage, balance or your eligibility changed. Refresh and try again while out of battle.",
        );
  } catch (error) {
    if (isMysqlDuplicateKeyError(error))
      return errorResponse("You can only serve as a mercenary in one war at a time.");
    throw error;
  }
};

/** Open camp sectors admit both war sides; existing occupants remain free to leave. */
export const canEnterWarCampSector = async (
  client: DrizzleClient,
  user: { userId: string; villageId: string | null; sector: number },
  destination: number,
) => {
  if (destination === user.sector) return true;
  const [wars, mercenaryWarId] = await Promise.all([
    client.query.war.findMany({
      where: inArray(
        war.id,
        client
          .select({ warId: warCamp.warId })
          .from(warCamp)
          .where(
            and(
              eq(warCamp.sector, destination),
              isNull(warCamp.resolvedAt),
              sql`${warCamp.startsAt} <= SYSDATE(3) AND ${warCamp.endsAt} > SYSDATE(3)`,
            ),
          ),
      ),
      with: {
        warAllies: { where: activeWarAllyWhere() },
        warMercenaries: { where: activeWarMercenaryWhere() },
      },
    }),
    fetchMercenaryWarId(client, user.userId),
  ]);
  return wars
    .filter((w) => isObjectiveWarActive(w))
    .every((w) => !!getWarSide(w, user.villageId, user.userId, mercenaryWarId));
};
