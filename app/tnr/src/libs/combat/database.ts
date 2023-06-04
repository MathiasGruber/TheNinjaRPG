import type { Battle, PrismaClient } from "@prisma/client";
import { UserStatus, Prisma } from "@prisma/client";
import type { CombatResult, ReturnedUserState } from "./types";
import type { UserEffect, GroundEffect, CombatAction, ActionEffect } from "./types";
import { VILLAGE_LONG, VILLAGE_LAT } from "../travel/constants";
import type { PrismaTransactionClient } from "../../utils/typeutils";

/**
 * Update the battle state with raw queries for speed
 */
export const updateBattle = async (
  result: CombatResult | null,
  battle: Battle,
  finalUsersState: ReturnedUserState[],
  newUsersEffects: UserEffect[],
  newGroundEffects: GroundEffect[],
  prisma: PrismaClient | PrismaTransactionClient
) => {
  // Calculations
  const battleOver = result && result.friendsLeft + result.targetsLeft === 0;
  // Update the battle, return undefined if the battle was updated by another process
  if (battleOver) {
    await prisma.$executeRaw`DELETE FROM Battle WHERE id = ${battle.id} LIMIT 1`;
    await prisma.$executeRaw`DELETE FROM BattleAction WHERE battleId = ${battle.id}`;
  } else {
    const updatedRows = await prisma.$executeRaw`
      UPDATE Battle 
      SET 
        version = version + 1,
        usersState = ${JSON.stringify(finalUsersState)},
        usersEffects = ${JSON.stringify(newUsersEffects)},
        groundEffects = ${JSON.stringify(newGroundEffects)}
      WHERE id = ${battle.id} AND version = ${battle.version}
      LIMIT 1
    `;
    if (updatedRows === 0) return undefined;
  }
  const newBattle = {
    ...battle,
    version: battle.version + 1,
    usersState: finalUsersState as unknown as Prisma.JsonArray,
    usersEffects: newUsersEffects as unknown as Prisma.JsonArray,
    groundEffects: newGroundEffects as unknown as Prisma.JsonArray,
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
  prisma: PrismaClient | PrismaTransactionClient
) => {
  return await prisma.$executeRaw`
    INSERT INTO BattleAction 
      (battleId, battleVersion, description, appliedEffects) 
    VALUES (
      ${battle.id}, 
      ${battle.version + 1}, 
      ${battleDescription}, 
      ${JSON.stringify(effects)}
    )
  `;
};

/**
 * Update the user with battle result using raw queries for speed
 */
export const updateUser = async (
  result: CombatResult | null,
  userId: string,
  prisma: PrismaClient | PrismaTransactionClient
) => {
  if (result) {
    console.log(result);
    return await prisma.$executeRaw`
      UPDATE UserData 
      SET
        experience = experience + ${result.experience},
        elo_pve = elo_pve + ${result.elo_pve},
        elo_pvp = elo_pvp + ${result.elo_pvp},
        cur_health = ${result.cur_health},
        cur_stamina = ${result.cur_stamina},
        cur_chakra = ${result.cur_chakra},
        strength = strength + ${result.strength},
        intelligence = intelligence + ${result.intelligence},
        willpower = willpower + ${result.willpower},
        speed = speed + ${result.speed},
        ${result.money ? Prisma.sql`money = ${result.money}` : Prisma.empty},
        ninjutsu_offence = ninjutsu_offence + ${result.ninjutsu_offence},
        genjutsu_offence = genjutsu_offence + ${result.genjutsu_offence},
        taijutsu_offence = taijutsu_offence + ${result.taijutsu_offence},
        bukijutsu_offence = bukijutsu_offence + ${result.bukijutsu_offence},
        ninjutsu_defence = ninjutsu_defence + ${result.ninjutsu_defence},
        genjutsu_defence = genjutsu_defence + ${result.genjutsu_defence},
        taijutsu_defence = taijutsu_defence + ${result.taijutsu_defence},
        bukijutsu_defence = bukijutsu_defence + ${result.bukijutsu_defence},
        battleId = null,
        regenAt = ${new Date()},
        ${
          result.cur_health <= 0
            ? Prisma.sql`status = ${UserStatus.HOSPITALIZED}, longitude = ${VILLAGE_LONG}, latitude = ${VILLAGE_LAT}`
            : Prisma.sql`status = ${UserStatus.AWAKE}`
        }      
      WHERE userId = ${userId}
      LIMIT 1
    `;
  }
};
