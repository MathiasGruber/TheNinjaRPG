import { and, eq, inArray, sql } from "drizzle-orm";
import { battle, dungeonMember, dungeonRun, userData } from "@/drizzle/schema";
import { combatEnergyRecoverySql } from "@/libs/combat/database";
import type { CompleteBattle } from "@/libs/combat/types";
import { dungeonBattleOutcome, dungeonNextState } from "@/libs/dungeon";
import type { DrizzleClient } from "@/server/db";
import { cleanupCoopBattleStart } from "@/server/utils/coop";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";

/** Compensate every committed sibling write before reopening a failed floor start. */
export const rollbackDungeonStart = (
  client: DrizzleClient,
  run: typeof dungeonRun.$inferSelect,
  battleId: string,
  version: number,
) =>
  retryOnDeadlock(async () => {
    const {
      entryStartedAt: _started,
      entryPreviousDeadline: _deadline,
      ...state
    } = run.state;
    await cleanupCoopBattleStart(client, battleId, run.state.memberIds);
    // Reopen only after all cleanup finished; the CAS rejects stale or competing recovery.
    await client
      .update(dungeonRun)
      .set({
        status: run.expiresAt ? "BETWEEN" : "LOBBY",
        battleId: null,
        expiresAt: run.expiresAt,
        version: sql`${dungeonRun.version} + 1`,
        state: { ...state, readyIds: [] },
      })
      .where(
        and(
          eq(dungeonRun.id, run.id),
          eq(dungeonRun.battleId, battleId),
          eq(dungeonRun.version, version),
        ),
      );
  });

/**
 * Atomically claim the battle version, advance its run and restore every bound member.
 * Uses only preloaded combat state: settlement adds no reads to the action mutation phase.
 * Return false when another caller won the battle claim; a run mismatch throws and rolls back
 * the deletion, keeping the battle available for recovery instead of losing party progress.
 */
export const settleDungeonBattle = async (
  client: DrizzleClient,
  current: CompleteBattle,
  fetchedVersion: number,
) => {
  const settledAt = new Date();
  const meta = current.extraState.dungeon;
  const outcome = dungeonBattleOutcome(current);
  if (!meta || !outcome) return false;
  const next = dungeonNextState(meta.runState, outcome, meta.roomKind);
  if (outcome === "ended") next.message = meta.failedReason ?? "Dungeon ended.";
  const status =
    outcome === "ended"
      ? "ENDED"
      : next.floor === meta.totalFloors
        ? "COMPLETED"
        : "BETWEEN";
  // These changes span battle, run, character and membership rows. A single guarded update
  // cannot delete the battle too; retain a short transaction so failed revival is retryable.
  return retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      const claim = await tx
        .delete(battle)
        .where(and(eq(battle.id, current.id), eq(battle.version, fetchedVersion)));
      if (claim.rowsAffected === 0) return false;
      const run = await tx
        .update(dungeonRun)
        .set({
          state: next,
          status,
          battleId: null,
          version: sql`${dungeonRun.version} + 1`,
        })
        .where(
          and(
            eq(dungeonRun.id, meta.runId),
            eq(dungeonRun.battleId, current.id),
            eq(dungeonRun.version, meta.runVersion),
            eq(dungeonRun.status, "FIGHTING"),
          ),
        );
      if (run.rowsAffected !== 1)
        throw new Error("Dungeon run changed during floor settlement");
      await tx
        .update(userData)
        .set({
          status: "AWAKE",
          battleId: null,
          curHealth: sql`${userData.maxHealth}`,
          curChakra: sql`${userData.maxChakra}`,
          curStamina: sql`${userData.maxStamina}`,
          curEnergy: dungeonEnergyRecoverySql(
            current,
            meta.runState.memberIds,
            settledAt,
          ),
          regenAt: settledAt,
          updatedAt: settledAt,
        })
        .where(
          and(
            inArray(userData.userId, meta.runState.memberIds),
            eq(userData.battleId, current.id),
          ),
        );
      if (status === "ENDED")
        await tx
          .update(dungeonMember)
          .set({ activeUserId: null })
          .where(eq(dungeonMember.runId, meta.runId));
      return true;
    }),
  );
};

/**
 * End an expired run, delete its battle, restore bound members and release reservations.
 * A loaded run version claims the whole cleanup; terminal, unexpired and stale snapshots
 * are no-ops. Fetch the battle only when needed for its preloaded energy recovery values.
 */
export const expireDungeonRun = async (
  client: DrizzleClient,
  run: typeof dungeonRun.$inferSelect,
) => {
  if (
    !run.expiresAt ||
    run.expiresAt.getTime() > Date.now() ||
    ["COMPLETED", "ENDED"].includes(run.status)
  )
    return;
  const settledAt = new Date();
  const snapshot = run.battleId
    ? await client.query.battle.findFirst({ where: eq(battle.id, run.battleId) })
    : undefined;
  // The terminal status disables future expiry, so battle removal, revival and reservation
  // release must commit with it. A single run CAS cannot express those multi-table effects.
  await retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      const claim = await tx
        .update(dungeonRun)
        .set({
          status: "ENDED",
          battleId: null,
          version: sql`${dungeonRun.version} + 1`,
          state: {
            ...run.state,
            readyIds: [],
            message: "The one-hour dungeon deadline expired.",
          },
        })
        .where(and(eq(dungeonRun.id, run.id), eq(dungeonRun.version, run.version)));
      if (claim.rowsAffected === 0) return;
      if (run.battleId) {
        await tx.delete(battle).where(eq(battle.id, run.battleId));
        await tx
          .update(userData)
          .set({
            status: "AWAKE",
            battleId: null,
            curHealth: sql`${userData.maxHealth}`,
            curChakra: sql`${userData.maxChakra}`,
            curStamina: sql`${userData.maxStamina}`,
            curEnergy: dungeonEnergyRecoverySql(
              snapshot,
              run.state.memberIds,
              settledAt,
            ),
            updatedAt: settledAt,
            regenAt: settledAt,
          })
          .where(
            and(
              inArray(userData.userId, run.state.memberIds),
              eq(userData.battleId, run.battleId),
            ),
          );
      }
      await tx
        .update(dungeonMember)
        .set({ activeUserId: null })
        .where(eq(dungeonMember.runId, run.id));
    }),
  );
};

/** Recover each member's energy using combat's preloaded regeneration and capacity. */
const dungeonEnergyRecoverySql = (
  snapshot: CompleteBattle | undefined,
  memberIds: string[],
  at: Date,
) =>
  sql`CASE ${sql.join(
    memberIds.map(
      (id) =>
        sql`WHEN ${eq(userData.userId, id)} THEN ${combatEnergyRecoverySql(snapshot, id, 0, at)}`,
    ),
    sql` `,
  )} ELSE ${userData.curEnergy} END`;
