import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { CLAN_BATTLE_REWARD_POINTS, CLAN_BATTLE_REWARD_RYO } from "@/drizzle/constants";
import {
  battle,
  battleAction,
  battleHistory,
  clan,
  mpvpBattleQueue,
  mpvpBattleUser,
  userData,
} from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";

/**
 * Claim and credit a shared victory atomically, so participant reports and retries pay once.
 * Returns true only when an unclaimed clan battle credits its participating winning clan;
 * missing lobbies/clans, other battle types and duplicate reports return false. A failed
 * credit leaves the winner unclaimed and balances unchanged; deadlocks retry the statement.
 */
export const rewardClanBattleVictory = async (
  client: DrizzleClient,
  battleId: string,
  clanId: string,
) =>
  retryOnDeadlock(async () => {
    // Drizzle's MySQL update builder cannot JOIN and SET both tables. As with purchase
    // delivery, parameterized SQL keeps the claim and credit in one atomic statement.
    const credited = await client.execute(sql`
      UPDATE ${mpvpBattleQueue}
      INNER JOIN ${clan} ON ${clan.id} = ${clanId}
      SET ${mpvpBattleQueue.winnerId} = ${clanId},
          ${clan.points} = ${clan.points} + ${CLAN_BATTLE_REWARD_POINTS},
          ${clan.activityPoints} = ${clan.activityPoints} + ${CLAN_BATTLE_REWARD_POINTS},
          ${clan.bank} = ${clan.bank} + ${CLAN_BATTLE_REWARD_RYO},
          ${clan.pvpActivity} = ${clan.pvpActivity} + 1
      WHERE ${mpvpBattleQueue.battleId} = ${battleId}
        AND ${mpvpBattleQueue.battleType} = 'CLAN_BATTLE'
        AND ${mpvpBattleQueue.winnerId} IS NULL
        AND (${mpvpBattleQueue.attackerEntityId} = ${clanId}
          OR ${mpvpBattleQueue.defenderEntityId} = ${clanId})
    `);
    return credited.rowsAffected > 0;
  });

type ClanBattleSnapshot = { id: string; battleId: string | null };

/**
 * Claim deletion of exactly the observed clan lobby, then release its combat and members.
 * Returns false without cleanup when the lobby is gone or its combat reservation changed;
 * true means cleanup completed. The guarded DELETE serializes startup and payout, and does
 * not reverse credited rewards. Cleanup retries only idempotent writes for the old IDs.
 * A persistent database failure after the DELETE can leave combat, logs, memberships or
 * queued users for support cleanup: the lobby stays deleted and the router cannot retry it.
 */
export const deleteClanBattle = async (
  client: DrizzleClient,
  snapshot: ClanBattleSnapshot,
) => {
  const deleted = await retryOnDeadlock(() =>
    client
      .delete(mpvpBattleQueue)
      .where(
        and(
          eq(mpvpBattleQueue.id, snapshot.id),
          eq(mpvpBattleQueue.battleType, "CLAN_BATTLE"),
          snapshot.battleId !== null
            ? eq(mpvpBattleQueue.battleId, snapshot.battleId)
            : isNull(mpvpBattleQueue.battleId),
        ),
      ),
  );
  if (deleted.rowsAffected !== 1) return false;
  // The deletion is durable. Retry cleanup alone so a deadlock cannot skip it when
  // a second DELETE finds no lobby; retain memberships until queued users are awake.
  await retryOnDeadlock(async () => {
    if (snapshot.battleId !== null) await clearClanCombat(client, snapshot.battleId);
    await client
      .update(userData)
      .set({ status: "AWAKE" })
      .where(
        and(
          eq(userData.status, "QUEUED"),
          isNull(userData.battleId),
          inArray(
            userData.userId,
            client
              .select({ userId: mpvpBattleUser.userId })
              .from(mpvpBattleUser)
              .where(eq(mpvpBattleUser.clanBattleId, snapshot.id)),
          ),
        ),
      );
    await client
      .delete(mpvpBattleUser)
      .where(eq(mpvpBattleUser.clanBattleId, snapshot.id));
  });
  return true;
};

/**
 * Idempotently remove combat and logs for an exclusive clan combat ID, including a startup
 * that lost its lobby. Release only users still holding that ID, preserving newer combats
 * and non-battle statuses. Writes finish in order before resolving; a database failure may
 * leave partial cleanup, which can safely be retried with the same ID.
 */
export const clearClanCombat = async (client: DrizzleClient, battleId: string) => {
  await client
    .delete(battle)
    .where(and(eq(battle.id, battleId), eq(battle.battleType, "CLAN_BATTLE")));
  await client
    .update(userData)
    .set({
      status: sql`CASE WHEN ${userData.status} = 'BATTLE' THEN 'AWAKE' ELSE ${userData.status} END`,
      battleId: null,
    })
    .where(eq(userData.battleId, battleId));
  await client.delete(battleAction).where(eq(battleAction.battleId, battleId));
  await client.delete(battleHistory).where(eq(battleHistory.battleId, battleId));
};
