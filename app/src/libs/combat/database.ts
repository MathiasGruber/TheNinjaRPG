import { eq, and, sql } from "drizzle-orm";
import { VILLAGE_LONG, VILLAGE_LAT } from "../travel/constants";
import { battle, battleAction, userData } from "../../../drizzle/schema";
import type { DrizzleClient } from "../../server/db";
import type { Battle } from "../../../drizzle/schema";
import type { CombatResult, ReturnedUserState } from "./types";
import type { UserEffect, GroundEffect, ActionEffect } from "./types";

/**
 * Update the battle state with raw queries for speed
 */
export const updateBattle = async (
  result: CombatResult | null,
  curBattle: Battle,
  finalUsersState: ReturnedUserState[],
  newUsersEffects: UserEffect[],
  newGroundEffects: GroundEffect[],
  client: DrizzleClient
) => {
  // Calculations
  const battleOver = result && result.friendsLeft + result.targetsLeft === 0;

  // Update the battle, return undefined if the battle was updated by another process
  if (battleOver) {
    await client.delete(battle).where(eq(battle.id, curBattle.id));
    await client.delete(battleAction).where(eq(battleAction.battleId, curBattle.id));
  } else {
    const result = await client
      .update(battle)
      .set({
        version: curBattle.version + 1,
        usersState: finalUsersState,
        usersEffects: newUsersEffects,
        groundEffects: newGroundEffects,
      })
      .where(and(eq(battle.id, curBattle.id), eq(battle.version, curBattle.version)));
    if (result.rowsAffected === 0) {
      throw new Error("Failed to update battle");
    }
  }
  const newBattle = {
    ...curBattle,
    version: battleOver ? curBattle.version : curBattle.version + 1,
    usersState: finalUsersState,
    usersEffects: newUsersEffects,
    groundEffects: newGroundEffects,
  };
  return newBattle;
};

/**
 * Insert directly into the data model for speed (i.e. no SELECT subsequently)
 */
export const createAction = async (
  battleDescription: string,
  battle: Battle,
  effects: ActionEffect[],
  client: DrizzleClient
) => {
  return await client.insert(battleAction).values({
    battleId: battle.id,
    battleVersion: battle.version + 1,
    description: battleDescription,
    appliedEffects: effects,
  });
};

/**
 * Update the user with battle result using raw queries for speed
 */
export const updateUser = async (
  result: CombatResult | null,
  battle: Battle,
  userId: string,
  client: DrizzleClient
) => {
  if (result) {
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
              immunityUntil:
                battle.battleType === "COMBAT"
                  ? sql`NOW() + INTERVAL 5 MINUTE`
                  : sql`immunityUntil`,
            }
          : { status: "AWAKE" }),
      })
      .where(eq(userData.userId, userId));
  }
};
