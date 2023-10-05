import { nanoid } from "nanoid";
import { eq, and, sql } from "drizzle-orm";
import { VILLAGE_LONG, VILLAGE_LAT } from "../travel/constants";
import { battle, battleAction, userData } from "../../../drizzle/schema";
import { dataBattleAction } from "../../../drizzle/schema";
import type { DrizzleClient } from "../../server/db";
import type { Battle } from "../../../drizzle/schema";
import type { InsertDataBattleActionsSchema } from "../../../drizzle/schema";
import type { CombatResult } from "./types";
import type { ActionEffect } from "./types";
import type { CompleteBattle } from "./types";

/**
 * Update the battle state with raw queries for speed
 */
export const updateBattle = async (
  client: DrizzleClient,
  result: CombatResult | null,
  newBattle: CompleteBattle,
  fetchedVersion: number
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
      throw new Error("Failed to update battle");
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
  userId: string
) => {
  const user = curBattle.usersState.find((user) => user.userId === userId);
  const battleType = curBattle.battleType;
  if (result && user) {
    const battleWon = result.curHealth <= 0 ? 0 : result.experience > 0.01 ? 1 : 2;
    // Basic actions from this user
    const data: InsertDataBattleActionsSchema[] = [];
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
    }, [] as InsertDataBattleActionsSchema[]);
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
  }[]
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

/**
 * Update the user with battle result using raw queries for speed
 */
export const updateUser = async (
  client: DrizzleClient,
  curBattle: CompleteBattle,
  result: CombatResult | null,
  userId: string
) => {
  const user = curBattle.usersState.find((user) => user.userId === userId);
  if (result && user) {
    return await client
      .update(userData)
      .set({
        experience: sql`experience + ${result.experience}`,
        eloPve: sql`eloPve + ${result.eloPve}`,
        eloPvp: sql`eloPvp + ${result.eloPvp}`,
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
        battleId: null,
        regenAt: new Date(),
        ...(result.curHealth <= 0
          ? {
              status: "HOSPITALIZED",
              longitude: VILLAGE_LONG,
              latitude: VILLAGE_LAT,
              sector: user.village?.sector,
              immunityUntil:
                curBattle.battleType === "COMBAT"
                  ? sql`NOW() + INTERVAL 5 MINUTE`
                  : sql`immunityUntil`,
            }
          : { status: "AWAKE" }),
      })
      .where(eq(userData.userId, userId));
  }
};
