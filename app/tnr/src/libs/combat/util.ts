import type { Battle } from "@prisma/client";
import { UserStatus } from "@prisma/client";
import type { ReturnedUserState, CombatResult } from "./types";
import { publicState, allState } from "./types";
import { VILLAGE_LONG, VILLAGE_LAT } from "../travel/constants";
import { type PrismaClient } from "@prisma/client/edge";

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
  };
};

/**
 * Figure out if user is still in battle, and if not whether the user won or lost
 */
export const calcBattleResult = (users: ReturnedUserState[], userId: string) => {
  const user = users.find((u) => u.userId === userId);
  if (user && user.cur_stamina && user.cur_chakra) {
    const targets = users.filter((u) => u.villageId !== user.villageId);
    const survivingTargets = targets.filter((t) => t.cur_health > 0);
    if (user.cur_health < 0 || survivingTargets.length === 0) {
      // Calculate ELO change
      const friends = users.filter((u) => u.villageId === user.villageId);
      const survivingFriends = friends.filter((t) => t.cur_health > 0);
      const aElo = friends.reduce((a, b) => a + b.elo_pvp, 0) / friends.length;
      const oElo = targets.reduce((a, b) => a + b.elo_pvp, 0) / targets.length;
      const didWin = survivingTargets.length === 0 && user.cur_health > 0;
      const eloDiff = calcEloChange(aElo, oElo, 32, didWin);

      // Result object
      const result: CombatResult = {
        experience: Math.round(eloDiff),
        elo_pvp: Math.round(eloDiff),
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
        friendsLeft: survivingFriends.length,
        targetsLeft: survivingTargets.length,
      };

      // TODO: distribute elo_points among stats used during battle

      // Return results
      return result;
    }
  }
  return null;
};


/**
 * Computes change in ELO rating based on original ELO ratings
 */
const calcEloChange = (user: number, opponent: number, kFactor = 32, won: boolean) => {
  const expectedScore = 1 / (1 + 10 ** ((opponent - user) / 400));
  const newRating = user + kFactor * ((won ? 1 : 0) - expectedScore);
  return newRating;
};
