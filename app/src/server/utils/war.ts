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
  FACTION_RAID_BOOST_HOURS,
  FACTION_RAID_COST,
  FACTION_RAID_DAILY_DRAIN,
  FACTION_RAID_FAILURE_COOLDOWN_HOURS,
  FACTION_RAID_MAX_DAYS,
  FACTION_RAID_MIN_MEMBERS,
  FACTION_RAID_REWARD,
  FACTION_RAID_STRUCTURE_HP,
  FACTION_RAID_TARGET_COOLDOWN_HOURS,
  OBJECTIVE_WAR_ATTACKER_COOLDOWN_DAYS,
  OBJECTIVE_WAR_DEFEAT_PENALTY_DAYS,
  OBJECTIVE_WAR_DEFEAT_PENALTY_LEVELS,
  OBJECTIVE_WAR_DEFENDER_COOLDOWN_DAYS,
  TERR_BOT_ID,
  VILLAGE_SYNDICATE_ID,
  WAR_ATTACKER_EXHAUSTION_MULTIPLIER,
  WAR_DECLARATION_COST,
  WAR_DEFEAT_STRUCTURE_PENALTY_DAYS,
  WAR_DEFEAT_STRUCTURE_PENALTY_LEVELS,
  WAR_DRAW_PENALTY_LEVELS,
  WAR_LOSING_COOLDOWN_DAYS,
  WAR_OBJECTIVES_PER_SIDE,
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
  clan,
  gameSetting,
  mpvpBattleQueue,
  notification,
  sector,
  userData,
  userRequest,
  village,
  villageStructure,
  type War,
  war,
  warAlly,
} from "@/drizzle/schema";
import { selectWarObjectives } from "@/libs/objectiveWar";
import {
  getRaidDeclarationBlock,
  getShrineHpByLevel,
  isFactionVillage,
  isVillageInvolvedInAnyWar,
  shouldEndRaid,
} from "@/libs/war";
import type { FetchActiveWarsReturnType } from "@/server/api/routers/war";
import { type DrizzleClient, drizzleDB } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { fetchWarRules, settleObjectiveWarSchedule } from "@/server/utils/objectiveWar";
import { logError } from "@/server/utils/sentry";
import { activeWarAllyWhere } from "@/server/utils/warAlly";
import { DAY_S, secondsFromDate } from "@/utils/time";
import type { WarSettlement } from "@/validators/war";

/** Raid combat closes at the deadline or the first defeated structure, even before settlement runs. */
export const warRaidCombatGuard = () =>
  // SYSDATE reevaluates wall time after a row-lock wait; NOW freezes it at statement start.
  sql`(${war.type} != 'WAR_RAID' OR (${war.startedAt} > SYSDATE(3) - INTERVAL ${FACTION_RAID_MAX_DAYS * 24} HOUR AND ${war.attackerWarHealth} > 0 AND ${war.defenderWarHealth} > 0))`;

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
  if (
    current.rules &&
    !current.endedAt &&
    current.combatStartedAt &&
    (Date.now() >=
      current.combatStartedAt.getTime() + current.rules.durationDays * DAY_S * 1000 ||
      Date.now() >= current.lastTokenReductionAt.getTime() + DAY_S * 1000)
  ) {
    await settleObjectiveWarSchedule(client, current);
    current = (await fetchSettlementWar(client, current.id)) ?? current;
  }
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

    const now = new Date();
    const deadline =
      current.rules && current.combatStartedAt
        ? current.combatStartedAt.getTime() + current.rules.durationDays * DAY_S * 1000
        : now.getTime();
    const endedAt = new Date(Math.min(now.getTime(), deadline));
    const isRaid = current.type === "WAR_RAID";
    const canSurrenderRaid = isRaid && !shouldEndRaid(current, endedAt);
    const losingVillageId =
      !isRaid || canSurrenderRaid ? options.losingVillageId : undefined;
    if (isRaid && !losingVillageId && !shouldEndRaid(current, endedAt)) return current;
    if (
      !isRaid &&
      !options.losingVillageId &&
      !options.shrineBuilderId &&
      !options.resolveByHealth &&
      !(
        current.rules &&
        current.combatStartedAt &&
        Date.now() >=
          current.combatStartedAt.getTime() + current.rules.durationDays * DAY_S * 1000
      ) &&
      (current.rules || current.attackerVillage.tokens > 0) &&
      (current.rules || current.defenderVillage.tokens > 0) &&
      current.attackerWarHealth > 0 &&
      current.defenderWarHealth > 0
    )
      return current;

    const isSector = current.type === "SECTOR_WAR";
    const attackerLost =
      losingVillageId === current.attackerVillageId ||
      (!isRaid && !current.rules && current.attackerVillage.tokens <= 0) ||
      current.attackerWarHealth <= 0;
    const defenderLost =
      !!options.shrineBuilderId ||
      losingVillageId === current.defenderVillageId ||
      (!isRaid && !current.rules && current.defenderVillage.tokens <= 0) ||
      current.defenderWarHealth <= 0;
    const isDraw =
      !isRaid &&
      ((attackerLost && defenderLost) ||
        (!attackerLost &&
          !defenderLost &&
          current.attackerWarHealth === current.defenderWarHealth));
    const winnerId = isRaid
      ? defenderLost && !attackerLost
        ? current.attackerVillageId
        : current.defenderVillageId
      : (attackerLost && !defenderLost) ||
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
    const winningVillageIds = isRaid
      ? [winnerId]
      : isDraw
        ? []
        : [
            ...new Set([
              winnerId,
              ...current.warAllies
                .filter((ally) => ally.supportVillageId === winnerId)
                .map((ally) => ally.villageId),
            ]),
          ].sort();
    const share = isRaid
      ? winnerId === current.attackerVillageId
        ? FACTION_RAID_REWARD
        : 0
      : winningVillageIds.length
        ? Math.floor(WAR_VICTORY_TOKEN_BONUS / winningVillageIds.length)
        : 0;
    const winnerTokens =
      share +
      (!isRaid && winningVillageIds.length
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
      notificationContent: isRaid
        ? `Raid between ${current.attackerVillage.name} and ${current.defenderVillage.name} has ended. ${winnerName} receives the structure raid bonus.${winnerTokens ? ` The attacking faction receives ${winnerTokens.toLocaleString()} tokens.` : ""}`
        : isSector
          ? `Sector ${current.sector} has been claimed by ${winnerName}. `
          : `War between ${current.attackerVillage.name} and ${current.defenderVillage.name} has ended. ${isDraw ? "The result was a draw." : `${winnerName} won the war and received ${winnerTokens} tokens. `}`,
      boostsDelivered: isRaid || isSector || isDraw,
      structuresDelivered: isRaid || isSector,
      notified: false,
    };
    const attackerCooldown = current.rules
      ? secondsFromDate(
          (status === "ATTACKER_VICTORY"
            ? WAR_WINNING_COOLDOWN_DAYS
            : OBJECTIVE_WAR_ATTACKER_COOLDOWN_DAYS) * DAY_S,
          endedAt,
        )
      : secondsFromDate(
          (status === "ATTACKER_VICTORY"
            ? WAR_WINNING_COOLDOWN_DAYS
            : WAR_LOSING_COOLDOWN_DAYS) *
            DAY_S *
            WAR_ATTACKER_EXHAUSTION_MULTIPLIER,
          endedAt,
        );
    const defenderCooldown = current.rules
      ? secondsFromDate(
          (status === "DEFENDER_VICTORY"
            ? WAR_WINNING_COOLDOWN_DAYS
            : OBJECTIVE_WAR_DEFENDER_COOLDOWN_DAYS) * DAY_S,
          endedAt,
        )
      : secondsFromDate(
          (status === "DEFENDER_VICTORY"
            ? WAR_WINNING_COOLDOWN_DAYS
            : WAR_LOSING_COOLDOWN_DAYS) * DAY_S,
          endedAt,
        );
    const recipient = alias(village, "recipient");
    const attacker = alias(village, "attacker");
    const defender = alias(village, "defender");
    const related = alias(war, "related");
    const unlisted = alias(war, "unlisted");
    const membership = alias(warAlly, "wa");
    const raidStructure = alias(villageStructure, "raid_structure");
    const rosterMatches = current.warAllies.length
      ? sql.join(
          current.warAllies.map(
            (ally) =>
              sql`(${membership.villageId} = ${ally.villageId} AND ${membership.supportVillageId} = ${ally.supportVillageId})`,
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
      ${isRaid ? sql`LEFT JOIN ${villageStructure} AS raid_structure ON ${raidStructure.villageId} = ${recipient.id} AND ${raidStructure.route} = ${current.targetStructureRoute}` : sql``}
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
            isRaid
              ? sql`,
              ${raidStructure.raidProtectedUntil} = CASE WHEN ${raidStructure.villageId} = ${current.defenderVillageId} THEN ${secondsFromDate(FACTION_RAID_TARGET_COOLDOWN_HOURS * 3600, endedAt)} ELSE ${raidStructure.raidProtectedUntil} END,
              ${raidStructure.raidBoostExpiresAt} = CASE WHEN ${raidStructure.villageId} = ${winnerId} AND (${raidStructure.raidBoostExpiresAt} IS NULL OR ${raidStructure.raidBoostExpiresAt} <= ${endedAt}) THEN ${secondsFromDate(FACTION_RAID_BOOST_HOURS * 3600, endedAt)} ELSE ${raidStructure.raidBoostExpiresAt} END,
              ${recipient.raidRetryCooldowns} = CASE WHEN ${status === "DEFENDER_VICTORY"} AND ${recipient.id} = ${current.attackerVillageId} THEN JSON_SET(${recipient.raidRetryCooldowns}, ${`$.${JSON.stringify(current.defenderVillageId)}`}, ${secondsFromDate(FACTION_RAID_FAILURE_COOLDOWN_HOURS * 3600, endedAt).toISOString()}) ELSE ${recipient.raidRetryCooldowns} END`
              : !isSector
                ? sql`, ${recipient.warExhaustionEndedAt} = CASE
            WHEN ${recipient.id} = ${current.attackerVillageId} THEN ${attackerCooldown}
            WHEN ${recipient.id} = ${current.defenderVillageId} THEN ${defenderCooldown}
            ELSE ${recipient.warExhaustionEndedAt} END,
            ${recipient.lastWarEndedAt} = CASE WHEN ${inArray(recipient.id, current.rules ? villageIds : [winnerId, loserId])} THEN GREATEST(COALESCE(${recipient.lastWarEndedAt}, ${endedAt}), ${endedAt}) ELSE ${recipient.lastWarEndedAt} END`
                : sql`,
            ${winnerId !== current.defenderVillageId ? sql`${sector.villageId} = ${winnerId}, ${sector.shrineLevel} = 1, ${sector.capturedAt} = ${endedAt},` : sql``}
            ${villageStructure.curSp} = GREATEST(${villageStructure.curSp} - ${WAR_SECTOR_LOSS_TOWNHALL_DAMAGE}, 0),
            ${related.status} = 'DEFENDER_VICTORY', ${related.endedAt} = ${endedAt}`
          }
      WHERE ${war.id} = ${current.id} AND ${war.status} = 'ACTIVE' AND ${war.endedAt} IS NULL
        AND ${war.attackerWarHealth} = ${current.attackerWarHealth} AND ${war.defenderWarHealth} = ${current.defenderWarHealth}
        AND ${attacker.tokens} = ${current.attackerVillage.tokens} AND ${defender.tokens} = ${current.defenderVillage.tokens}
        ${isRaid && losingVillageId ? sql`AND ${warRaidCombatGuard()}` : sql``}
        ${options.shrineBuilderId ? sql`AND ${attacker.kageId} = ${options.shrineBuilderId} AND ${attacker.tokens} >= ${WAR_PURCHASE_SHRINE_TOKEN_COST} AND ${war.defenderShrineHp} <= 0` : sql``}
        ${isSector ? sql`AND ${sector.villageId} = ${current.defenderVillageId} AND ${unlisted.id} IS NULL` : sql``}
        AND (SELECT COUNT(*) FROM ${warAlly} wa WHERE ${membership.warId} = ${war.id} AND ${membership.acceptedAt} IS NOT NULL AND ${membership.endedAt} IS NULL) = ${current.warAllies.length}
        AND NOT EXISTS (SELECT 1 FROM ${warAlly} wa WHERE ${membership.warId} = ${war.id} AND ${membership.acceptedAt} IS NOT NULL AND ${membership.endedAt} IS NULL AND NOT (${rosterMatches}))
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
  });
  await Promise.all(pending.map((endedWar) => finishWarSettlement(client, endedWar)));
};

/** Every effect is repeatable or coupled to its own receipt in one statement. */
const finishWarSettlement = async (client: DrizzleClient, endedWar: War) => {
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
    WAR_VICTORY_STRUCTURE_BOOST_DAYS * DAY_S,
    endedAt,
  );
  const penaltyEnd = secondsFromDate(
    (endedWar.rules
      ? OBJECTIVE_WAR_DEFEAT_PENALTY_DAYS
      : WAR_DEFEAT_STRUCTURE_PENALTY_DAYS) * DAY_S,
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
    if (endedWar.rules && !receipt.boostsDelivered) {
      const names = [
        ...winningIds.map((id) => `war-${id}-regen`),
        ...(endedWar.rules ? winningIds : [winnerId]).map((id) => `war-${id}-train`),
      ];
      const existing = await client.query.gameSetting.findMany({
        where: inArray(gameSetting.name, names),
        columns: { name: true },
      });
      const missing = names.filter(
        (name) => !existing.some((row) => row.name === name),
      );
      if (missing.length)
        await client
          .insert(gameSetting)
          .ignore()
          .values(
            missing.map((name) => ({ id: name, name, value: 0, time: new Date(0) })),
          );
    }
    await Promise.all([
      endedWar.rules
        ? client
            .update(userData)
            .set({ warMission: null })
            .where(
              sql`JSON_UNQUOTE(JSON_EXTRACT(${userData.warMission}, '$.warId')) = ${endedWar.id}`,
            )
        : Promise.resolve(),
      !receipt.boostsDelivered
        ? retryOnDeadlock(() =>
            client.execute(sql`
        UPDATE ${war} LEFT JOIN ${gameSetting} ON ${inArray(gameSetting.name, [...winningIds.map((id) => `war-${id}-regen`), ...(endedWar.rules ? winningIds : [winnerId]).map((id) => `war-${id}-train`)])}
        SET ${gameSetting.value} = CASE WHEN ${gameSetting.time} < ${boostEnd}
          THEN CASE WHEN ${inArray(
            gameSetting.name,
            (endedWar.rules ? winningIds : [winnerId]).map((id) => `war-${id}-train`),
          )} THEN ${WAR_WINNING_BOOST_TRAINING_PERC} ELSE ${WAR_WINNING_BOOST_REGEN_PERC} END ELSE ${gameSetting.value} END,
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
          OR (${endedWar.rules && !isDraw ? inArray(villageStructure.villageId, winningIds) : eq(villageStructure.villageId, winnerId)} ${isDraw ? (endedWar.type === "WAR_RAID" ? sql`AND ${villageStructure.route} = ${endedWar.targetStructureRoute}` : sql``) : endedWar.rules ? sql`` : sql`AND ${inArray(villageStructure.route, [...WAR_VICTORY_BOOSTED_STRUCTURES])}`}))
        LEFT JOIN ${village} ON ${village.id} = ${villageStructure.villageId}
        SET ${villageStructure.temporaryLevelBonus} = CASE
              WHEN ${village.lastWarEndedAt} IS NULL OR ${village.lastWarEndedAt} <= ${endedAt}
              THEN CASE WHEN ${isDraw} OR ${villageStructure.villageId} = ${loserId} THEN ${-(endedWar.rules ? (isDraw ? WAR_DRAW_PENALTY_LEVELS : OBJECTIVE_WAR_DEFEAT_PENALTY_LEVELS) : WAR_DEFEAT_STRUCTURE_PENALTY_LEVELS)} ELSE ${WAR_VICTORY_STRUCTURE_BOOST_LEVELS} END
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
        DELETE qh FROM QuestHistory qh INNER JOIN ${userData} ON qh.userId = ${userData.userId}
        WHERE qh.questType = 'war' AND qh.completed = 0 AND qh.startedAt <= ${cleanupCutoff}
          AND ${inArray(userData.villageId, receipt.villageIds)}
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

/** Serialize sector declarations with objective selection and charge only committed wars. */
export const startSectorWar = async (
  client: DrizzleClient,
  declaration: {
    id: string;
    attackerVillageId: string;
    defenderVillageId: string;
    initiatedByUserId: string;
    sectorId: number;
  },
) =>
  retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      // Share declaration/settlement locks so objective selection cannot race a new sector war.
      const villageIds = [
        declaration.attackerVillageId,
        declaration.defenderVillageId,
      ].sort();
      const lockedVillages = await tx
        .select()
        .from(village)
        .where(inArray(village.id, villageIds))
        .orderBy(asc(village.id))
        .for("update");
      const attacker = lockedVillages.find(
        (v) => v.id === declaration.attackerVillageId,
      );
      if (
        lockedVillages.length !== 2 ||
        attacker?.kageId !== declaration.initiatedByUserId
      )
        return false;
      const [activeWars, targetSector] = await Promise.all([
        tx.query.war.findMany({
          where: eq(war.status, "ACTIVE"),
          with: { warAllies: { where: activeWarAllyWhere() } },
        }),
        tx.query.sector.findFirst({ where: eq(sector.sector, declaration.sectorId) }),
      ]);
      if (
        (targetSector?.villageId ?? VILLAGE_SYNDICATE_ID) !==
          declaration.defenderVillageId ||
        (targetSector &&
          attacker.warExhaustionEndedAt &&
          attacker.warExhaustionEndedAt > new Date()) ||
        villageIds.some((id) =>
          isVillageInvolvedInAnyWar(activeWars, id, undefined, [
            "VILLAGE_WAR",
            "WAR_RAID",
          ]),
        ) ||
        activeWars.some(
          (w) =>
            w.type === "SECTOR_WAR" &&
            (w.attackerVillageId === attacker.id ||
              w.defenderVillageId === attacker.id),
        )
      )
        return false;
      const charge = await tx
        .update(village)
        .set({ tokens: sql`${village.tokens} - ${WAR_DECLARATION_COST}` })
        .where(
          and(eq(village.id, attacker.id), gte(village.tokens, WAR_DECLARATION_COST)),
        );
      if (charge.rowsAffected === 0) return false;
      await tx.insert(war).values({
        id: declaration.id,
        attackerVillageId: attacker.id,
        defenderVillageId: declaration.defenderVillageId,
        status: "ACTIVE",
        type: "SECTOR_WAR",
        sector: declaration.sectorId,
        attackerShrineHp: 0,
        attackerShrineMaxHp: 0,
        attackerShrineStatus: "CAPTURED",
        defenderShrineHp: getShrineHpByLevel(targetSector?.shrineLevel),
        defenderShrineMaxHp: getShrineHpByLevel(targetSector?.shrineLevel),
        defenderShrineStatus: "ACTIVE",
      });
      if (!targetSector)
        await tx.insert(sector).values({
          sector: declaration.sectorId,
          villageId: declaration.defenderVillageId,
        });
      return true;
    }),
  );

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
  const configuredRules =
    declaration.warType === "VILLAGE_WAR" ? await fetchWarRules(client) : null;
  const rules = configuredRules?.enabled ? configuredRules : null;
  const started = await retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      // Lock settlements before any consistent read so a waiting declaration sees the preceding commit. Sorted locks avoid inversion.
      const villageIds = [
        declaration.attackerVillageId,
        declaration.defenderVillageId,
      ].sort();
      const lockedVillages = await tx
        .select()
        .from(village)
        .where(inArray(village.id, villageIds))
        .orderBy(asc(village.id))
        .for("update");
      if (lockedVillages.length !== 2) return false;

      const activeWars = await tx.query.war.findMany({
        where: and(
          eq(war.status, "ACTIVE"),
          inArray(
            war.type,
            rules
              ? ["VILLAGE_WAR", "WAR_RAID", "SECTOR_WAR"]
              : ["VILLAGE_WAR", "WAR_RAID"],
          ),
        ),
        with: { warAllies: { where: activeWarAllyWhere() } },
      });
      if (
        villageIds.some((id) =>
          isVillageInvolvedInAnyWar(
            activeWars.filter((w) => w.type !== "SECTOR_WAR"),
            id,
          ),
        )
      )
        return false;

      const isRaid = declaration.warType === "WAR_RAID";
      const cost = isRaid
        ? FACTION_RAID_COST
        : (rules?.declarationCost ?? WAR_DECLARATION_COST);
      const now = new Date();
      const combatStartedAt = rules
        ? secondsFromDate(rules.noticeHours * 3600, now)
        : null;
      const sectors = rules
        ? await tx.query.sector.findMany({
            where: inArray(sector.villageId, villageIds),
          })
        : [];
      const objectives = rules
        ? lockedVillages.flatMap((v) =>
            selectWarObjectives(
              sectors,
              v.id,
              v.sector,
              rules,
              Math.random,
              activeWars.filter((w) => w.type === "SECTOR_WAR").map((w) => w.sector),
            ),
          )
        : [];
      if (rules && objectives.length !== WAR_OBJECTIVES_PER_SIDE * 2) return false;
      if (isRaid) {
        const attacker = lockedVillages.find(
          (v) => v.id === declaration.attackerVillageId,
        )!;
        const defender = lockedVillages.find(
          (v) => v.id === declaration.defenderVillageId,
        )!;
        if (
          !isFactionVillage(attacker) ||
          attacker.kageId !== declaration.initiatedByUserId ||
          !["VILLAGE", "HIDEOUT", "STRONGHOLD"].includes(defender.type)
        )
          return false;
        const [members] = await tx
          .select({ count: sql<number>`COUNT(*)` })
          .from(userData)
          .innerJoin(clan, eq(clan.id, userData.clanId))
          .where(and(eq(clan.villageId, attacker.id), eq(userData.isAi, false)));
        const structures = await tx
          .select()
          .from(villageStructure)
          .where(inArray(villageStructure.villageId, villageIds));
        if (
          Number(members?.count ?? 0) < FACTION_RAID_MIN_MEMBERS ||
          getRaidDeclarationBlock(
            attacker,
            structures.filter((s) => s.villageId === attacker.id),
            structures.filter((s) => s.villageId === defender.id),
            defender.id,
            declaration.targetStructureRoute,
          )
        )
          return false;
      }
      const tokenResult = await tx
        .update(village)
        .set({ tokens: sql`${village.tokens} - ${cost}` })
        .where(
          and(eq(village.id, declaration.attackerVillageId), gte(village.tokens, cost)),
        );
      if (tokenResult.rowsAffected === 0) return false;

      await tx.insert(war).values({
        id: nanoid(),
        attackerVillageId: declaration.attackerVillageId,
        defenderVillageId: declaration.defenderVillageId,
        status: "ACTIVE",
        type: declaration.warType,
        rules,
        combatStartedAt,
        ...(rules
          ? {
              attackerWarHealth: rules.townhallHp,
              defenderWarHealth: rules.townhallHp,
              attackerWarHealthMax: rules.townhallHp,
              defenderWarHealthMax: rules.townhallHp,
              lastTokenReductionAt: combatStartedAt!,
              objectiveState: {
                objectives,
                attackerEspionage: 0,
                defenderEspionage: 0,
              },
            }
          : {}),
        targetStructureRoute: rules ? "/townhall" : declaration.targetStructureRoute,
        ...(isRaid
          ? {
              attackerWarHealth: FACTION_RAID_STRUCTURE_HP,
              defenderWarHealth: FACTION_RAID_STRUCTURE_HP,
              attackerWarHealthMax: FACTION_RAID_STRUCTURE_HP,
              defenderWarHealthMax: FACTION_RAID_STRUCTURE_HP,
            }
          : {}),
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

  const warContent = `${declaration.attackerVillageName} has declared ${declaration.warType === "WAR_RAID" ? "a raid" : "war"} on ${declaration.defenderVillageName}!`;
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

/** A timestamp CAS makes retries of a daily raid drain harmless. Treasury tokens are unaffected. */
export const applyRaidHealthDecay = async (
  client: DrizzleClient,
  raid: FetchActiveWarsReturnType,
  now = new Date(),
) => {
  const intervals = Math.floor(
    (now.getTime() - raid.lastTokenReductionAt.getTime()) / (DAY_S * 1000),
  );
  if (raid.type !== "WAR_RAID" || intervals <= 0) return;
  const drain = intervals * FACTION_RAID_DAILY_DRAIN;
  const result = await client
    .update(war)
    .set({
      attackerWarHealth: sql`GREATEST(${war.attackerWarHealth} - ${drain}, 0)`,
      defenderWarHealth: sql`GREATEST(${war.defenderWarHealth} - ${drain}, 0)`,
      lastTokenReductionAt: new Date(
        raid.lastTokenReductionAt.getTime() + intervals * DAY_S * 1000,
      ),
    })
    .where(
      and(
        eq(war.id, raid.id),
        isNull(war.endedAt),
        eq(war.lastTokenReductionAt, raid.lastTokenReductionAt),
        warRaidCombatGuard(),
      ),
    );
  if (
    result.rowsAffected > 0 &&
    (raid.attackerWarHealth <= drain || raid.defenderWarHealth <= drain)
  )
    await handleWarEnd(
      {
        ...raid,
        attackerWarHealth: Math.max(0, raid.attackerWarHealth - drain),
        defenderWarHealth: Math.max(0, raid.defenderWarHealth - drain),
      },
      client,
    );
};
