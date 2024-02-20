import { nanoid } from "nanoid";
import { eq, and, sql, inArray } from "drizzle-orm";
import { HOSPITAL_LONG, HOSPITAL_LAT } from "@/libs//travel/constants";
import { battle, battleAction, userData, userItem } from "@/drizzle/schema";
import { kageDefendedChallenges, village } from "@/drizzle/schema";
import { dataBattleAction } from "@/drizzle/schema";
import { getNewTrackers } from "@/libs/quest";
import { stillInBattle } from "./actions";
import type { BattleTypes, BattleDataEntryType } from "@/drizzle/constants";
import type { DrizzleClient } from "@/server/db";
import type { Battle } from "@/drizzle/schema";
import type { CombatResult } from "@/libs/combat/types";
import type { ActionEffect } from "@/libs/combat/types";
import type { CompleteBattle } from "@/libs/combat/types";

type DataBattleAction = {
  type: (typeof BattleDataEntryType)[number];
  contentId: string;
  battleType: (typeof BattleTypes)[number];
  battleWon: number;
};

/**
 * Update the battle state with raw queries for speed
 */
export const updateBattle = async (
  client: DrizzleClient,
  result: CombatResult | null,
  newBattle: CompleteBattle,
  fetchedVersion: number,
) => {
  // Calculations
  const battleOver = result && result.friendsLeft + result.targetsLeft === 0;

  // Update the battle, return undefined if the battle was updated by another process
  if (battleOver) {
    await client.delete(battle).where(eq(battle.id, newBattle.id));
  } else {
    const result = await client
      .update(battle)
      .set({
        version: newBattle.version,
        createdAt: newBattle.createdAt,
        updatedAt: newBattle.updatedAt,
        usersState: newBattle.usersState,
        usersEffects: newBattle.usersEffects,
        groundEffects: newBattle.groundEffects,
        activeUserId: newBattle.activeUserId,
        roundStartAt: newBattle.roundStartAt,
        round: newBattle.round,
      })
      .where(and(eq(battle.id, newBattle.id), eq(battle.version, fetchedVersion)));
    if (result.rowsAffected === 0) {
      throw new Error(`Failed to update battle ${newBattle.id} with ${fetchedVersion}`);
    }
  }
};

/**
 * Insert battle actions for usage analytics
 */
export const saveUsage = async (
  client: DrizzleClient,
  curBattle: CompleteBattle,
  result: CombatResult | null,
  userId: string,
) => {
  const user = curBattle.usersState.find((user) => user.userId === userId);
  const battleType = curBattle.battleType;
  if (result && user) {
    const battleWon = result.curHealth <= 0 ? 0 : result.experience > 0.01 ? 1 : 2;
    // Basic actions from this user
    const data: DataBattleAction[] = [];
    user.usedActions?.map((action) => {
      data.push({ type: action.type, contentId: action.id, battleType, battleWon });
    });
    // Bloodline actions from this user
    if (user.bloodline) {
      const bid = user.bloodline.id;
      data.push({ type: "bloodline", contentId: bid, battleType, battleWon });
    }
    // If battle is over, check for any AIs in the battle, and add these as well to the statistics
    curBattle.usersState
      .filter((u) => u.isAi && u.userId === u.controllerId)
      .map((ai) => {
        data.push({ type: "ai", contentId: ai.userId, battleType, battleWon });
      });
    // Reduce data to only have unique type-contentId pairs
    const uniqueData = data.reduce((a, c) => {
      if (!a.find((d) => d.type === c.type && d.contentId === c.contentId)) {
        return a.concat([c]);
      } else {
        return a;
      }
    }, [] as DataBattleAction[]);
    if (uniqueData.length > 0) {
      await client.insert(dataBattleAction).values(uniqueData);
    }
  }
};

/**
 * Insert directly into the data model for speed (i.e. no SELECT subsequently)
 */
export const createAction = async (
  client: DrizzleClient,
  newBattle: Battle,
  history: {
    battleRound: number;
    appliedEffects: ActionEffect[];
    description: string;
    battleVersion: number;
  }[],
) => {
  if (history.length > 0) {
    const actions = history
      .sort((a, b) => b.battleVersion - a.battleVersion)
      .map((entry) => {
        return {
          id: nanoid(),
          battleId: newBattle.id,
          battleVersion: entry.battleVersion,
          battleRound: entry.battleRound,
          createdAt: new Date(),
          updatedAt: new Date(),
          description: entry.description,
          appliedEffects: entry.appliedEffects,
        };
      });
    await client.insert(battleAction).values(actions);
    return actions;
  }
};

export const updateVillage = async (
  client: DrizzleClient,
  curBattle: CompleteBattle,
  result: CombatResult | null,
  userId: string,
) => {
  // Fetch
  const user = curBattle.usersState.find((u) => u.userId === userId);
  const kage = curBattle.usersState.find((u) => u.userId !== userId && !u.isSummon);
  // Guards
  if (curBattle.battleType !== "KAGE") return;
  if (!user || !user.villageId || !kage || !kage.villageId) return;
  if (user.villageId !== kage.villageId) return;
  // Apply
  if (result) {
    if (result && result.didWin > 0) {
      await Promise.all([
        client
          .update(village)
          .set({ kageId: user.userId })
          .where(eq(village.id, user.villageId)),
        client
          .delete(kageDefendedChallenges)
          .where(eq(kageDefendedChallenges.villageId, kage.villageId)),
      ]);
    } else {
      await client.insert(kageDefendedChallenges).values({
        id: nanoid(),
        villageId: user.villageId,
        userId: user.userId,
        kageId: kage.userId,
        rounds: curBattle.round,
      });
    }
  }
};

/**
 * Update the user with battle result using raw queries for speed
 */
export const updateUser = async (
  client: DrizzleClient,
  curBattle: CompleteBattle,
  result: CombatResult | null,
  userId: string,
) => {
  const user = curBattle.usersState.find((user) => user.userId === userId);
  if (result && user) {
    // Update quest tracker with battle result
    if (result.didWin > 0) {
      if (curBattle.battleType === "COMBAT") {
        const { trackers } = getNewTrackers(user, [
          { task: "pvp_kills", increment: 1 },
        ]);
        user.questData = trackers;
      }
      if (curBattle.battleType === "ARENA") {
        const { trackers } = getNewTrackers(user, [
          { task: "arena_kills", increment: 1 },
        ]);
        user.questData = trackers;
      }
      const { trackers } = getNewTrackers(
        user,
        curBattle.usersState
          .filter((u) => !stillInBattle(u))
          .map((u) => ({
            task: "defeat_opponents",
            contentId: u.userId,
          })),
      );
      user.questData = trackers;
    }
    // Any items to be deleted?
    const deleteItems = user.items.filter((ui) => ui.quantity <= 0).map((i) => i.id);
    // Update user
    await Promise.all([
      ...(deleteItems.length > 0
        ? [client.delete(userItem).where(inArray(userItem.id, deleteItems))]
        : []),
      client
        .update(userData)
        .set({
          experience: sql`experience + ${result.experience}`,
          eloPve: sql`eloPve + ${result.eloPve}`,
          eloPvp: sql`eloPvp + ${result.eloPvp}`,
          pvpStreak: result.pvpStreak,
          curHealth: result.curHealth,
          curStamina: result.curStamina,
          curChakra: result.curChakra,
          strength: sql`strength + ${result.strength}`,
          intelligence: sql`intelligence + ${result.intelligence}`,
          willpower: sql`willpower + ${result.willpower}`,
          speed: sql`speed + ${result.speed}`,
          money: result.money ? sql`money + ${result.money}` : sql`money`,
          ninjutsuOffence: sql`ninjutsuOffence + ${result.ninjutsuOffence}`,
          genjutsuOffence: sql`genjutsuOffence + ${result.genjutsuOffence}`,
          taijutsuOffence: sql`taijutsuOffence + ${result.taijutsuOffence}`,
          bukijutsuOffence: sql`bukijutsuOffence + ${result.bukijutsuOffence}`,
          ninjutsuDefence: sql`ninjutsuDefence + ${result.ninjutsuDefence}`,
          genjutsuDefence: sql`genjutsuDefence + ${result.genjutsuDefence}`,
          taijutsuDefence: sql`taijutsuDefence + ${result.taijutsuDefence}`,
          bukijutsuDefence: sql`bukijutsuDefence + ${result.bukijutsuDefence}`,
          villagePrestige: sql`villagePrestige + ${result.villagePrestige}`,
          questData: user.questData,
          battleId: null,
          regenAt: new Date(),
          ...(result.curHealth <= 0 && curBattle.battleType !== "SPARRING"
            ? {
                status: "HOSPITALIZED",
                longitude: HOSPITAL_LONG,
                latitude: HOSPITAL_LAT,
                sector: user.village?.sector,
                immunityUntil:
                  curBattle.battleType === "COMBAT"
                    ? sql`NOW() + INTERVAL 5 MINUTE`
                    : sql`immunityUntil`,
              }
            : { status: "AWAKE" }),
        })
        .where(eq(userData.userId, userId)),
    ]);
  }
};
