import type { Battle } from "@prisma/client";
import type { CombatResult } from "./types";
import type { ReturnedUserState, GroundEffect, UserEffect } from "./types";
import { publicState, allState } from "./types";

/**
 * Masks information from a battle prior to returning it to the frontend,
 * i.e. do not leak opponents stats
 */
export const maskBattle = (battle: Battle, userId: string) => {
  return {
    ...battle,
    usersState: (battle.usersState as unknown as ReturnedUserState[]).map((user) => {
      if (user.userId !== userId) {
        return Object.fromEntries(
          publicState.map((key) => [key, user[key]])
        ) as unknown as ReturnedUserState;
      } else {
        return Object.fromEntries(
          allState.map((key) => [key, user[key]])
        ) as unknown as ReturnedUserState;
      }
    }),
    usersEffects: battle.usersEffects as unknown as UserEffect[],
    groundEffects: battle.groundEffects as unknown as GroundEffect[],
  };
};

/**
 * Figure out if user is still in battle, and if not whether the user won or lost
 */
export const calcBattleResult = (users: ReturnedUserState[], userId: string) => {
  const user = users.find((u) => u.userId === userId);
  if (user && user.cur_stamina && user.cur_chakra) {
    // If 1v1, then friends/targets are the opposing team. If MPvP, separate by village
    let targets: ReturnedUserState[] = [];
    let friends: ReturnedUserState[] = [];
    if (users.length === 2) {
      targets = users.filter((u) => u.userId !== userId);
      friends = users.filter((u) => u.userId === userId);
    } else {
      targets = users.filter((u) => u.villageId !== user.villageId);
      friends = users.filter((u) => u.villageId === user.villageId);
    }
    console.log(users);
    const survivingTargets = targets.filter((t) => t.cur_health > 0);
    if (user.cur_health <= 0 || survivingTargets.length === 0) {
      // Update the user left
      user.leftBattle = true;

      // Calculate ELO change
      const aElo = friends.reduce((a, b) => a + b.elo_pvp, 0) / friends.length;
      const oElo = targets.reduce((a, b) => a + b.elo_pvp, 0) / targets.length;
      const didWin = user.cur_health > 0;
      const eloDiff = calcEloChange(aElo, oElo, 32, didWin);

      // Find users who did not leave battle yet
      const friendsLeft = friends.filter((u) => !u.leftBattle);
      const targetsLeft = targets.filter((u) => !u.leftBattle);

      // Result object
      const result: CombatResult = {
        experience: 0,
        elo_pvp: 0,
        elo_pve: 0,
        cur_health: user.cur_health,
        cur_stamina: user.cur_stamina,
        cur_chakra: user.cur_chakra,
        strength: 0,
        intelligence: 0,
        willpower: 0,
        speed: 0,
        ninjutsu_offence: 0,
        genjutsu_offence: 0,
        taijutsu_offence: 0,
        bukijutsu_offence: 0,
        ninjutsu_defence: 0,
        genjutsu_defence: 0,
        taijutsu_defence: 0,
        bukijutsu_defence: 0,
        friendsLeft: friendsLeft.length,
        targetsLeft: targetsLeft.length,
      };

      // TODO: distribute elo_points among stats used during battle
      console.log(result);
      // Return results
      return { finalUsersState: users, result: result };
    }
  }
  return { finalUsersState: users, result: null };
};

/**
 * Computes change in ELO rating based on original ELO ratings
 */
const calcEloChange = (user: number, opponent: number, kFactor = 32, won: boolean) => {
  const expectedScore = 1 / (1 + 10 ** ((opponent - user) / 400));
  const newRating = user + kFactor * ((won ? 1 : 0) - expectedScore);
  return newRating;
};
