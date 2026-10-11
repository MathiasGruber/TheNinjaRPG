import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { nanoid } from "nanoid";
import type { WarState, WarType } from "@/drizzle/constants";
import {
  BRACKET_IMMUNITY_LIFT_SECS,
  TERR_BOT_ID,
  WAR_ATTACKER_EXHAUSTION_MULTIPLIER,
  WAR_DECLARATION_COST,
  WAR_DEFEAT_STRUCTURE_PENALTY_DAYS,
  WAR_DEFEAT_STRUCTURE_PENALTY_LEVELS,
  WAR_LOSING_COOLDOWN_DAYS,
  WAR_PARTICIPANT_SECS,
  WAR_PURCHASE_SHRINE_TOKEN_COST,
  WAR_RAID_SHRINE_HP,
  WAR_SECTOR_LOSS_TOWNHALL_DAMAGE,
  WAR_VICTORY_BOOSTED_STRUCTURES,
  WAR_VICTORY_STRUCTURE_BOOST_DAYS,
  WAR_VICTORY_STRUCTURE_BOOST_LEVELS,
  WAR_VICTORY_TOKEN_BONUS,
  WAR_WINNING_BOOST_DAYS,
  WAR_WINNING_BOOST_REGEN_PERC,
  WAR_WINNING_BOOST_TRAINING_PERC,
  WAR_WINNING_COOLDOWN_DAYS,
} from "@/drizzle/constants";
import {
  gameSetting,
  mpvpBattleQueue,
  notification,
  sector,
  userData,
  userRequest,
  village,
  villageStructure,
  war,
} from "@/drizzle/schema";
import { isVillageInvolvedInAnyWar } from "@/libs/war";
import type { FetchActiveWarsReturnType } from "@/server/api/routers/war";
import { type DrizzleClient, drizzleDB } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { logError } from "@/server/utils/sentry";
import { activeWarAllyWhere } from "@/server/utils/warAlly";
import { DAY_S, secondsFromDate } from "@/utils/time";
import type { WarSettlement } from "@/validators/war";

/**
 * SQL fragment that extends `userData.warParticipantUntil` to the larger of its current
 * value and `NOW() + WAR_PARTICIPANT_SECS`, so an existing longer stamp is never shortened.
 */
export const extendWarParticipantSql = () =>
  sql`GREATEST(${userData.warParticipantUntil}, NOW() + INTERVAL ${WAR_PARTICIPANT_SECS} SECOND)`;

/**
 * SQL fragment that lifts `userData.bracketImmunityLiftedUntil` to the larger of its current
 * value and `NOW() + BRACKET_IMMUNITY_LIFT_SECS`, so an existing longer lift is never shortened.
 */
export const liftBracketImmunitySql = () =>
  sql`GREATEST(${userData.bracketImmunityLiftedUntil}, NOW() + INTERVAL ${BRACKET_IMMUNITY_LIFT_SECS} SECOND)`;

/** Close a war and change balances in one guarded statement; finish durable delivery receipts afterward. */
export const handleWarEnd = async (
  activeWar: FetchActiveWarsReturnType,
  client: DrizzleClient = drizzleDB,
  options: {
    losingVillageId?: string;
    shrineBuilderId?: string;
    resolveByHealth?: boolean;
  } = {},
): Promise<FetchActiveWarsReturnType> => {
  let current = activeWar;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (current.status !== "ACTIVE" || current.endedAt) {
      await finishWarSettlement(client, current);
      return current;
    }
    if (
      options.shrineBuilderId &&
      (current.type !== "SECTOR_WAR" ||
        current.defenderShrineHp > 0 ||
        current.attackerVillage.kageId !== options.shrineBuilderId ||
        current.attackerVillage.tokens < WAR_PURCHASE_SHRINE_TOKEN_COST)
    )
      return current;

    if (
      !options.losingVillageId &&
      !options.shrineBuilderId &&
      !options.resolveByHealth &&
      current.attackerVillage.tokens > 0 &&
      current.defenderVillage.tokens > 0 &&
      current.attackerWarHealth > 0 &&
      current.defenderWarHealth > 0
    )
      return current;

    const endedAt = new Date();
    const isSector = current.type === "SECTOR_WAR";
    const attackerLost =
      options.losingVillageId === current.attackerVillageId ||
      current.attackerVillage.tokens <= 0 ||
      current.attackerWarHealth <= 0;
    const defenderLost =
      !!options.shrineBuilderId ||
      options.losingVillageId === current.defenderVillageId ||
      current.defenderVillage.tokens <= 0 ||
      current.defenderWarHealth <= 0;
    const isDraw =
      (attackerLost && defenderLost) ||
      (!attackerLost &&
        !defenderLost &&
        current.attackerWarHealth === current.defenderWarHealth);
    const winnerId =
      (attackerLost && !defenderLost) ||
      (!attackerLost &&
        !defenderLost &&
        current.attackerWarHealth < current.defenderWarHealth)
        ? current.defenderVillageId
        : current.attackerVillageId;
    const loserId =
      winnerId === current.attackerVillageId
        ? current.defenderVillageId
        : current.attackerVillageId;
    const status: WarState = isDraw
      ? "DRAW"
      : winnerId === current.attackerVillageId
        ? "ATTACKER_VICTORY"
        : "DEFENDER_VICTORY";
    const winningVillageIds = isDraw
      ? []
      : [
          ...new Set([
            winnerId,
            ...current.warAllies
              .filter((ally) => ally.supportVillageId === winnerId)
              .map((ally) => ally.villageId),
          ]),
        ].sort();
    const share = winningVillageIds.length
      ? Math.floor(WAR_VICTORY_TOKEN_BONUS / winningVillageIds.length)
      : 0;
    const winnerTokens =
      share +
      (winningVillageIds.length
        ? WAR_VICTORY_TOKEN_BONUS % winningVillageIds.length
        : 0);
    const sectorWars = isSector
      ? await client.query.war.findMany({
          where: and(
            eq(war.sector, current.sector),
            eq(war.type, "SECTOR_WAR"),
            eq(war.status, "ACTIVE"),
          ),
          with: { warAllies: { where: activeWarAllyWhere() } },
        })
      : [];
    const villageIds = [
      ...new Set([
        current.attackerVillageId,
        current.defenderVillageId,
        ...current.warAllies.map((ally) => ally.villageId),
        ...sectorWars.flatMap((other) => [
          other.attackerVillageId,
          other.defenderVillageId,
          ...other.warAllies.map((ally) => ally.villageId),
        ]),
      ]),
    ];
    const winnerName =
      winnerId === current.attackerVillageId
        ? current.attackerVillage.name
        : current.defenderVillage.name;
    const settlement: WarSettlement = {
      villageIds,
      winningVillageIds,
      warIds: [...new Set([current.id, ...sectorWars.map((other) => other.id)])],
      notificationContent: isSector
        ? `Sector ${current.sector} has been claimed by ${winnerName}. `
        : `War between ${current.attackerVillage.name} and ${current.defenderVillage.name} has ended. ${isDraw ? "The result was a draw." : `${winnerName} won the war and received ${winnerTokens} tokens. `}`,
      boostsDelivered: isSector || isDraw,
      structuresDelivered: isSector,
      notified: false,
    };
    const winnerCooldown = secondsFromDate(
      WAR_WINNING_COOLDOWN_DAYS *
        DAY_S *
        (winnerId === current.attackerVillageId
          ? WAR_ATTACKER_EXHAUSTION_MULTIPLIER
          : 1),
      endedAt,
    );
    const loserCooldown = secondsFromDate(
      WAR_LOSING_COOLDOWN_DAYS *
        DAY_S *
        (loserId === current.attackerVillageId
          ? WAR_ATTACKER_EXHAUSTION_MULTIPLIER
          : 1),
      endedAt,
    );
    const attackerDrawCooldown = secondsFromDate(
      WAR_LOSING_COOLDOWN_DAYS * DAY_S * WAR_ATTACKER_EXHAUSTION_MULTIPLIER,
      endedAt,
    );
    const defenderDrawCooldown = secondsFromDate(
      WAR_LOSING_COOLDOWN_DAYS * DAY_S,
      endedAt,
    );
    const recipient = alias(village, "recipient");
    const attacker = alias(village, "attacker");
    const defender = alias(village, "defender");
    const related = alias(war, "related");
    const unlisted = alias(war, "unlisted");
    const rosterMatches = current.warAllies.length
      ? sql.join(
          current.warAllies.map(
            (ally) =>
              sql`(wa.villageId = ${ally.villageId} AND wa.supportVillageId = ${ally.supportVillageId})`,
          ),
          sql` OR `,
        )
      : sql`FALSE`;

    // Drizzle cannot update multiple tables. This follows purchase delivery's atomic
    // receipt/balance write: failed or duplicate claims cannot lose or repeat value.
    // SYSDATE freezes cleanup when the write runs, including time spent waiting on locks.
    const claimed = await retryOnDeadlock(() =>
      client.execute(sql`
      UPDATE ${war}
      INNER JOIN ${village} AS attacker ON ${attacker.id} = ${war.attackerVillageId}
      INNER JOIN ${village} AS defender ON ${defender.id} = ${war.defenderVillageId}
      INNER JOIN ${village} AS recipient ON ${inArray(recipient.id, villageIds)}
      ${
        isSector
          ? sql`
        INNER JOIN ${sector} ON ${sector.sector} = ${war.sector}
        LEFT JOIN ${villageStructure} ON ${villageStructure.villageId} = ${loserId} AND ${villageStructure.route} = '/townhall'
        LEFT JOIN ${war} AS related ON ${related.id} != ${war.id} AND ${inArray(
          related.id,
          sectorWars.map((other) => other.id),
        )}
          AND ${related.status} = 'ACTIVE' AND ${related.endedAt} IS NULL
        LEFT JOIN ${war} AS unlisted ON ${unlisted.sector} = ${war.sector}
          AND ${unlisted.type} = 'SECTOR_WAR' AND ${unlisted.status} = 'ACTIVE' AND ${unlisted.endedAt} IS NULL
          AND ${notInArray(unlisted.id, settlement.warIds)}
      `
          : sql``
      }
      SET ${war.status} = ${status}, ${war.endedAt} = ${endedAt},
          ${war.settlement} = JSON_SET(${JSON.stringify(settlement)}, '$.cleanupCutoff', CAST(UNIX_TIMESTAMP(SYSDATE(3)) * 1000 AS UNSIGNED)), ${war.settlementPending} = TRUE,
          ${recipient.tokens} = ${recipient.tokens} + ${
            isSector
              ? sql`CASE WHEN ${recipient.id} = ${current.attackerVillageId} THEN ${options.shrineBuilderId ? -WAR_PURCHASE_SHRINE_TOKEN_COST : 0} ELSE 0 END`
              : winningVillageIds.length
                ? sql`CASE WHEN ${recipient.id} = ${winnerId} THEN ${winnerTokens} WHEN ${inArray(recipient.id, winningVillageIds)} THEN ${share} ELSE 0 END`
                : sql`0`
          }
          ${
            !isSector
              ? sql`, ${recipient.warExhaustionEndedAt} = CASE
            WHEN ${recipient.id} = ${current.attackerVillageId} AND ${isDraw} THEN ${attackerDrawCooldown}
            WHEN ${recipient.id} = ${current.defenderVillageId} AND ${isDraw} THEN ${defenderDrawCooldown}
            WHEN ${recipient.id} = ${winnerId} THEN ${winnerCooldown}
            WHEN ${recipient.id} = ${loserId} THEN ${loserCooldown}
            ELSE ${recipient.warExhaustionEndedAt} END,
            ${recipient.lastWarEndedAt} = CASE WHEN ${inArray(recipient.id, [winnerId, loserId])} THEN ${endedAt} ELSE ${recipient.lastWarEndedAt} END`
              : sql`,
            ${winnerId !== current.defenderVillageId ? sql`${sector.villageId} = ${winnerId}, ${sector.shrineLevel} = 1, ${sector.capturedAt} = ${endedAt},` : sql``}
            ${villageStructure.curSp} = GREATEST(${villageStructure.curSp} - ${WAR_SECTOR_LOSS_TOWNHALL_DAMAGE}, 0),
            ${related.status} = 'DEFENDER_VICTORY', ${related.endedAt} = ${endedAt}`
          }
      WHERE ${war.id} = ${current.id} AND ${war.status} = 'ACTIVE' AND ${war.endedAt} IS NULL
        AND ${war.attackerWarHealth} = ${current.attackerWarHealth} AND ${war.defenderWarHealth} = ${current.defenderWarHealth}
        AND ${attacker.tokens} = ${current.attackerVillage.tokens} AND ${defender.tokens} = ${current.defenderVillage.tokens}
        ${options.shrineBuilderId ? sql`AND ${attacker.kageId} = ${options.shrineBuilderId} AND ${attacker.tokens} >= ${WAR_PURCHASE_SHRINE_TOKEN_COST} AND ${war.defenderShrineHp} <= 0` : sql``}
        ${isSector ? sql`AND ${sector.villageId} = ${current.defenderVillageId} AND ${unlisted.id} IS NULL` : sql``}
        AND (SELECT COUNT(*) FROM WarAlly wa WHERE wa.warId = ${war.id} AND wa.acceptedAt IS NOT NULL AND wa.endedAt IS NULL) = ${current.warAllies.length}
        AND NOT EXISTS (SELECT 1 FROM WarAlly wa WHERE wa.warId = ${war.id} AND wa.acceptedAt IS NOT NULL AND wa.endedAt IS NULL AND NOT (${rosterMatches}))
    `),
    );
    if (claimed.rowsAffected > 0) {
      current = { ...current, status, endedAt, settlement, settlementPending: true };
      const saved = await fetchSettlementWar(client, current.id).catch((error) => {
        logError(error, "Failed to load war settlement receipt", { warId: current.id });
      });
      if (saved) {
        current = saved;
        await finishWarSettlement(client, current);
      }
      return current;
    }
    const saved = await fetchSettlementWar(client, current.id);
    if (!saved) throw new Error("War no longer exists");
    current = saved;
  }
  if (options.shrineBuilderId) return current;
  throw new Error("War changed while settling; retry with its current state");
};

const fetchSettlementWar = (client: DrizzleClient, warId: string) =>
  client.query.war.findFirst({
    where: eq(war.id, warId),
    with: {
      attackerVillage: { with: { structures: true } },
      defenderVillage: { with: { structures: true } },
      warAllies: { where: activeWarAllyWhere(), with: { village: true } },
    },
  });

/** Resume delivery independently of daily war decay. */
export const resumePendingWarSettlements = async (client: DrizzleClient) => {
  const pending = await client.query.war.findMany({
    where: eq(war.settlementPending, true),
    with: {
      attackerVillage: { with: { structures: true } },
      defenderVillage: { with: { structures: true } },
      warAllies: { where: activeWarAllyWhere(), with: { village: true } },
    },
  });
  await Promise.all(pending.map((endedWar) => finishWarSettlement(client, endedWar)));
};

/** Every effect is repeatable or coupled to its own receipt in one statement. */
const finishWarSettlement = async (
  client: DrizzleClient,
  endedWar: FetchActiveWarsReturnType,
) => {
  const receipt = endedWar.settlement;
  if (!receipt || !endedWar.endedAt || !endedWar.settlementPending) return;
  const endedAt = endedWar.endedAt;
  const cleanupCutoff = new Date(receipt.cleanupCutoff ?? endedAt.getTime());
  const winningIds = receipt.winningVillageIds;
  const isSector = endedWar.type === "SECTOR_WAR";
  const isDraw = endedWar.status === "DRAW";
  const winnerId =
    endedWar.status === "DEFENDER_VICTORY"
      ? endedWar.defenderVillageId
      : endedWar.attackerVillageId;
  const loserId =
    winnerId === endedWar.attackerVillageId
      ? endedWar.defenderVillageId
      : endedWar.attackerVillageId;
  const boostEnd = secondsFromDate(WAR_WINNING_BOOST_DAYS * DAY_S, endedAt);
  const structureEnd = secondsFromDate(
    (isDraw ? WAR_DEFEAT_STRUCTURE_PENALTY_DAYS : WAR_VICTORY_STRUCTURE_BOOST_DAYS) *
      DAY_S,
    endedAt,
  );
  const penaltyEnd = secondsFromDate(
    WAR_DEFEAT_STRUCTURE_PENALTY_DAYS * DAY_S,
    endedAt,
  );
  const stepGuard = (
    key: "boostsDelivered" | "structuresDelivered" | "notified",
  ) => sql`
    ${war.id} = ${endedWar.id} AND ${war.settlementPending} = TRUE
    AND JSON_UNQUOTE(JSON_EXTRACT(${war.settlement}, ${`$.${key}`})) = 'false'`;
  const stepReceipt = (key: "boostsDelivered" | "structuresDelivered" | "notified") =>
    sql`JSON_SET(${war.settlement}, ${`$.${key}`}, CAST('true' AS JSON))`;
  const queueMatch = and(
    eq(mpvpBattleQueue.battleType, "SHRINE_BATTLE"),
    isNull(mpvpBattleQueue.battleId),
    lte(mpvpBattleQueue.createdAt, cleanupCutoff),
    isSector
      ? eq(mpvpBattleQueue.sector, endedWar.sector)
      : or(
          inArray(mpvpBattleQueue.attackerEntityId, receipt.villageIds),
          inArray(mpvpBattleQueue.defenderEntityId, receipt.villageIds),
        ),
  );
  try {
    await Promise.all([
      !receipt.boostsDelivered
        ? retryOnDeadlock(() =>
            client.execute(sql`
        UPDATE ${war} LEFT JOIN ${gameSetting} ON ${inArray(gameSetting.name, [...winningIds.map((id) => `war-${id}-regen`), `war-${winnerId}-train`])}
        SET ${gameSetting.value} = CASE WHEN ${gameSetting.time} <= ${endedAt} OR ${gameSetting.time} < ${boostEnd}
          THEN CASE WHEN ${gameSetting.name} = ${`war-${winnerId}-train`} THEN ${WAR_WINNING_BOOST_TRAINING_PERC} ELSE ${WAR_WINNING_BOOST_REGEN_PERC} END ELSE ${gameSetting.value} END,
            ${gameSetting.time} = GREATEST(${gameSetting.time}, ${boostEnd}),
            ${war.settlement} = ${stepReceipt("boostsDelivered")}
        WHERE ${stepGuard("boostsDelivered")}
      `),
          )
        : Promise.resolve(),
      !receipt.structuresDelivered
        ? retryOnDeadlock(() =>
            client.execute(sql`
        UPDATE ${war} LEFT JOIN ${villageStructure} ON
          ((${villageStructure.villageId} = ${loserId} ${endedWar.type === "WAR_RAID" ? sql`AND ${villageStructure.route} = ${endedWar.targetStructureRoute}` : sql``})
          OR (${villageStructure.villageId} = ${winnerId} ${isDraw ? (endedWar.type === "WAR_RAID" ? sql`AND ${villageStructure.route} = ${endedWar.targetStructureRoute}` : sql``) : sql`AND ${inArray(villageStructure.route, [...WAR_VICTORY_BOOSTED_STRUCTURES])}`}))
        LEFT JOIN ${village} ON ${village.id} = ${villageStructure.villageId}
        SET ${villageStructure.temporaryLevelBonus} = CASE
              WHEN ${village.lastWarEndedAt} IS NULL OR ${village.lastWarEndedAt} <= ${endedAt}
              THEN CASE WHEN ${isDraw} OR ${villageStructure.villageId} = ${loserId} THEN ${-WAR_DEFEAT_STRUCTURE_PENALTY_LEVELS} ELSE ${WAR_VICTORY_STRUCTURE_BOOST_LEVELS} END
              ELSE ${villageStructure.temporaryLevelBonus} END,
            ${villageStructure.temporaryLevelBonusExpiresAt} = CASE
              WHEN ${village.lastWarEndedAt} IS NULL OR ${village.lastWarEndedAt} <= ${endedAt}
              THEN CASE WHEN ${isDraw} OR ${villageStructure.villageId} = ${loserId} THEN ${penaltyEnd} ELSE ${structureEnd} END
              ELSE ${villageStructure.temporaryLevelBonusExpiresAt} END,
            ${war.settlement} = ${stepReceipt("structuresDelivered")}
        WHERE ${stepGuard("structuresDelivered")}
      `),
          )
        : Promise.resolve(),
      retryOnDeadlock(() =>
        client
          .insert(notification)
          .values({
            warId: endedWar.id,
            userId: TERR_BOT_ID,
            content: receipt.notificationContent,
          })
          .onDuplicateKeyUpdate({ set: { warId: sql`${notification.warId}` } }),
      ),
      retryOnDeadlock(() =>
        client
          .delete(userRequest)
          .where(
            and(
              eq(userRequest.type, "WAR_ALLY"),
              lte(userRequest.createdAt, cleanupCutoff),
              inArray(userRequest.relatedId, receipt.warIds),
            ),
          ),
      ),
      retryOnDeadlock(() =>
        client.execute(sql`
        DELETE qh FROM QuestHistory qh INNER JOIN UserData ud ON qh.userId = ud.userId
        WHERE qh.questType = 'war' AND qh.completed = 0 AND qh.startedAt <= ${cleanupCutoff}
          AND ud.villageId IN (${sql.join(
            receipt.villageIds.map((id) => sql`${id}`),
            sql`, `,
          )})
      `),
      ),
    ]);
    // The feed entry is durable before its count receipt is claimed; retries never increment twice.
    if (!receipt.notified)
      await retryOnDeadlock(() =>
        client.execute(sql`
      UPDATE ${war} LEFT JOIN ${userData} ON ${inArray(userData.villageId, [endedWar.attackerVillageId, endedWar.defenderVillageId])}
      SET ${userData.unreadNotifications} = ${userData.unreadNotifications} + 1, ${war.settlement} = ${stepReceipt("notified")}
      WHERE ${stepGuard("notified")}
    `),
      );
    await Promise.all([
      retryOnDeadlock(() =>
        client
          .update(userData)
          .set({ warParticipantUntil: new Date(0) })
          .where(
            and(
              inArray(userData.villageId, receipt.villageIds),
              sql`NOT EXISTS (SELECT 1 FROM War w WHERE w.endedAt IS NULL AND (w.attackerVillageId = ${userData.villageId} OR w.defenderVillageId = ${userData.villageId}))`,
              sql`NOT EXISTS (SELECT 1 FROM WarAlly wa INNER JOIN War w ON wa.warId = w.id WHERE w.endedAt IS NULL AND wa.acceptedAt IS NOT NULL AND wa.endedAt IS NULL AND wa.villageId = ${userData.villageId})`,
            ),
          ),
      ),
      retryOnDeadlock(() =>
        client.execute(sql`
        UPDATE ${userData} INNER JOIN MpvpBattleUser mbu ON ${userData.userId} = mbu.userId
        INNER JOIN ${mpvpBattleQueue} ON mbu.clanBattleId = ${mpvpBattleQueue.id}
        SET ${userData.status} = 'AWAKE' WHERE ${queueMatch} AND ${userData.status} = 'QUEUED'
      `),
      ),
    ]);
    // Wake users while their membership rows exist, then remove memberships before the queue.
    await retryOnDeadlock(() =>
      client.execute(sql`
      DELETE mbu FROM MpvpBattleUser mbu INNER JOIN ${mpvpBattleQueue} ON mbu.clanBattleId = ${mpvpBattleQueue.id}
      WHERE ${queueMatch}
    `),
    );
    await retryOnDeadlock(() => client.delete(mpvpBattleQueue).where(queueMatch));
    await retryOnDeadlock(() =>
      client
        .update(war)
        .set({ settlementPending: false })
        .where(eq(war.id, endedWar.id)),
    );
    endedWar.settlementPending = false;
  } catch (error) {
    // Balances and the terminal outcome have committed. Reads and the hourly job retry
    // pending delivery; callers keep their success response rather than paying again.
    logError(error, "Failed to finish war settlement delivery", { warId: endedWar.id });
  }
};

/**
 * Start an approved declaration only while both villages remain available and the
 * attacker can afford it. The token charge and war commit together; leaders are
 * notified after success. Rejected declarations leave tokens and wars unchanged.
 */
export const startDeclaredWar = async (
  client: DrizzleClient,
  declaration: {
    attackerVillageId: string;
    attackerVillageName: string;
    defenderVillageId: string;
    defenderVillageName: string;
    defenderKageId?: string | null;
    initiatedByUserId: string;
    warType: WarType;
    targetStructureRoute: string;
  },
) => {
  const started = await retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      // Shared village rows serialize overlapping declarations; sorted locks avoid inversion.
      const villageIds = [
        declaration.attackerVillageId,
        declaration.defenderVillageId,
      ].sort();
      const lockedVillages = await tx
        .select({ id: village.id })
        .from(village)
        .where(inArray(village.id, villageIds))
        .orderBy(asc(village.id))
        .for("update");
      if (lockedVillages.length !== 2) return false;

      const activeWars = await tx.query.war.findMany({
        where: and(
          eq(war.status, "ACTIVE"),
          inArray(war.type, ["VILLAGE_WAR", "WAR_RAID"]),
        ),
        with: { warAllies: { where: activeWarAllyWhere() } },
      });
      if (villageIds.some((id) => isVillageInvolvedInAnyWar(activeWars, id)))
        return false;

      const tokenResult = await tx
        .update(village)
        .set({ tokens: sql`${village.tokens} - ${WAR_DECLARATION_COST}` })
        .where(
          and(
            eq(village.id, declaration.attackerVillageId),
            gte(village.tokens, WAR_DECLARATION_COST),
          ),
        );
      if (tokenResult.rowsAffected === 0) return false;

      await tx.insert(war).values({
        id: nanoid(),
        attackerVillageId: declaration.attackerVillageId,
        defenderVillageId: declaration.defenderVillageId,
        status: "ACTIVE",
        type: declaration.warType,
        targetStructureRoute: declaration.targetStructureRoute,
        attackerShrineHp: WAR_RAID_SHRINE_HP,
        attackerShrineMaxHp: WAR_RAID_SHRINE_HP,
        attackerShrineStatus: "ACTIVE",
        defenderShrineHp: WAR_RAID_SHRINE_HP,
        defenderShrineMaxHp: WAR_RAID_SHRINE_HP,
        defenderShrineStatus: "ACTIVE",
      });
      return true;
    }),
  );
  if (!started) return false;

  const warContent = `${declaration.attackerVillageName} has declared war on ${declaration.defenderVillageName}!`;
  const notifyKageIds = [declaration.initiatedByUserId];
  if (declaration.defenderKageId) notifyKageIds.push(declaration.defenderKageId);
  try {
    await Promise.all([
      client
        .insert(notification)
        .values(notifyKageIds.map((userId) => ({ userId, content: warContent }))),
      client
        .update(userData)
        .set({ unreadNotifications: sql`unreadNotifications + 1` })
        .where(inArray(userData.userId, notifyKageIds)),
    ]);
  } catch (error) {
    // The war has committed; keep the client's success response and war refresh intact.
    logError(error, "Failed to notify leaders about a started war", {
      attackerVillageId: declaration.attackerVillageId,
      defenderVillageId: declaration.defenderVillageId,
    });
  }
  return true;
};
