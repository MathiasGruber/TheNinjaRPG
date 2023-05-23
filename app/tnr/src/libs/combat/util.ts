import type { Battle } from "@prisma/client";
import type { CombatResult } from "./types";
import type { ReturnedUserState, GroundEffect, UserEffect } from "./types";
import { publicState, allState } from "./types";
import { secondsPassed, secondsFromDate } from "../../utils/time";
import { COMBAT_SECONDS } from "./constants";

/**
 * Finds a user in the battle state based on location
 */
export const findUser = (
  users: ReturnedUserState[],
  longitude: number,
  latitude: number
) => {
  return users.find(
    (u) => u.longitude === longitude && u.latitude === latitude && u.cur_health > 0
  );
};

/**
 * Finds a ground effect in the battle state based on location
 */
export const findBarrier = (
  groundEffects: GroundEffect[],
  longitude: number,
  latitude: number
) => {
  return groundEffects.find(
    (b) => b.longitude === longitude && b.latitude === latitude && b.type === "barrier"
  );
};

/**
 * Given a UserEffect, check if it is time to apply it. The effect is applied if:
 * 1. The effect is not already applied to the user
 * 2. A round has passed
 */
export const shouldApplyEffectTimes = (
  effect: UserEffect | GroundEffect,
  targetId: string
) => {
  // By default apply once
  let applyTimes = 1;
  // Get latest application of effect to the given target
  if (effect.timeTracker) {
    const prevApply = effect.timeTracker[targetId];
    if (prevApply) {
      applyTimes = secondsPassed(new Date(prevApply)) / COMBAT_SECONDS;
      if (applyTimes > 0) {
        effect.timeTracker[targetId] = Date.now();
      }
    }
    // Update the time tracker
    if (applyTimes > 0) {
      effect.timeTracker[targetId] = Date.now();
    }
  }
  // Return number of times to apply effect
  return applyTimes;
};

/**
 * Filter effects based on their duration
 */
export const isEffectStillActive = (effect: UserEffect | GroundEffect) => {
  if (effect.rounds !== undefined && effect.createdAt) {
    const total = effect.rounds * COMBAT_SECONDS;
    const isActive = secondsFromDate(total, new Date(effect.createdAt)) > new Date();
    if (!isActive) console.log("Effect expired: ", effect.type);
    return isActive;
  }
  return true;
};

/**
 * Sort order in which effects are applied
 */
export const sortEffects = (
  a: UserEffect | GroundEffect,
  b: UserEffect | GroundEffect
) => {
  const ordered = [
    // Pre-modifiers
    "armoradjust",
    "poolcostadjust",
    "statadjust",
    "poolcostadjust",
    // Mid-modifiers
    "barrier",
    "clear",
    "clone",
    "damage",
    "flee",
    "fleeprevent",
    "heal",
    "onehitkill",
    "onehitkillprevent",
    "robprevent",
    "rob",
    "sealprevent",
    "seal",
    "stunprevent",
    "stun",
    "summonprevent",
    "summon",
    // Post-moodifiers
    "absorb",
    "damagegivenadjust",
    "damagetakenadjust",
    "healadjust",
    "reflect",
    // End-modifiers
    "move",
    "visual",
  ];
  if (ordered.includes(a.type) && ordered.includes(b.type)) {
    return ordered.indexOf(a.type) > ordered.indexOf(b.type) ? 1 : -1;
  }
  return 0;
};

/**
 * Masks information from a battle prior to returning it to the frontend,
 * i.e. do not leak opponents stats
 */
export const maskBattle = (battle: Battle, userId: string) => {
  return {
    ...battle,
    usersState: (battle.usersState as unknown as ReturnedUserState[]).map((user) => {
      if (user.controllerId !== userId) {
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
  const originals = users.filter((u) => u.is_original);
  if (user && user.cur_stamina && user.cur_chakra) {
    // If 1v1, then friends/targets are the opposing team. If MPvP, separate by village
    let targets: ReturnedUserState[] = [];
    let friends: ReturnedUserState[] = [];
    if (originals.length === 2) {
      targets = originals.filter((u) => u.userId !== userId);
      friends = originals.filter((u) => u.userId === userId);
    } else {
      targets = originals.filter((u) => u.villageId !== user.villageId);
      friends = originals.filter((u) => u.villageId === user.villageId);
    }
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
