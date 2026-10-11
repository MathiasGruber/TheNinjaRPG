import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
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

/** Claim and pay the shared victory together; each participant may report the win. */
export const rewardClanBattleVictory = async (
  client: DrizzleClient,
  battleId: string,
  clanId: string,
) =>
  retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      const claimed = await tx
        .update(mpvpBattleQueue)
        .set({ winnerId: clanId })
        .where(
          and(
            eq(mpvpBattleQueue.battleId, battleId),
            eq(mpvpBattleQueue.battleType, "CLAN_BATTLE"),
            isNull(mpvpBattleQueue.winnerId),
            or(
              eq(mpvpBattleQueue.attackerEntityId, clanId),
              eq(mpvpBattleQueue.defenderEntityId, clanId),
            ),
          ),
        );
      if (claimed.rowsAffected === 0) return false;
      const credited = await tx
        .update(clan)
        .set({
          points: sql`${clan.points} + ${CLAN_BATTLE_REWARD_POINTS}`,
          activityPoints: sql`${clan.activityPoints} + ${CLAN_BATTLE_REWARD_POINTS}`,
          bank: sql`${clan.bank} + ${CLAN_BATTLE_REWARD_RYO}`,
          pvpActivity: sql`${clan.pvpActivity} + 1`,
        })
        .where(eq(clan.id, clanId));
      if (credited.rowsAffected !== 1) throw new Error("Winning clan no longer exists");
      return true;
    }),
  );

type ClanBattleSnapshot = { id: string; battleId: string | null };

/** Remove exactly the observed lobby, serializing deletion against startup and payout. */
export const deleteClanBattle = async (
  client: DrizzleClient,
  snapshot: ClanBattleSnapshot,
) =>
  retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      const deleted = await tx
        .delete(mpvpBattleQueue)
        .where(
          and(
            eq(mpvpBattleQueue.id, snapshot.id),
            eq(mpvpBattleQueue.battleType, "CLAN_BATTLE"),
            snapshot.battleId
              ? eq(mpvpBattleQueue.battleId, snapshot.battleId)
              : isNull(mpvpBattleQueue.battleId),
          ),
        );
      if (deleted.rowsAffected !== 1) return false;
      if (snapshot.battleId)
        await clearClanCombat(tx as DrizzleClient, snapshot.battleId);
      await tx
        .update(userData)
        .set({ status: "AWAKE" })
        .where(
          and(
            eq(userData.status, "QUEUED"),
            isNull(userData.battleId),
            inArray(
              userData.userId,
              tx
                .select({ userId: mpvpBattleUser.userId })
                .from(mpvpBattleUser)
                .where(eq(mpvpBattleUser.clanBattleId, snapshot.id)),
            ),
          ),
        );
      await tx
        .delete(mpvpBattleUser)
        .where(eq(mpvpBattleUser.clanBattleId, snapshot.id));
      return true;
    }),
  );

/** Also used after startup loses its lobby: the generated combat ID is exclusive to it. */
export const clearClanCombat = async (client: DrizzleClient, battleId: string) => {
  await client
    .delete(battle)
    .where(and(eq(battle.id, battleId), eq(battle.battleType, "CLAN_BATTLE")));
  // A transaction shares one serverless-driver session, so drain each write in order.
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
