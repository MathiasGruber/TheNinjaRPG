import { publicState, allState } from "./constants";
import { getPower } from "./tags";
import { randomInt } from "../../utils/math";
import { availableUserActions } from "./actions";
import { calcActiveUser } from "./actions";
import { stillInBattle } from "./actions";
import type { CombatResult, CompleteBattle, ReturnedBattle } from "./types";
import type { ReturnedUserState, Consequence } from "./types";
import type { CombatAction, BattleUserState } from "./types";
import type { GroundEffect, UserEffect } from "../../libs/combat/types";
import type { Battle } from "../../../drizzle/schema";

/**
 * Finds a user in the battle state based on location
 */
export const findUser = (
  users: ReturnedUserState[],
  longitude: number,
  latitude: number
) => {
  return users.find(
    (u) =>
      u.longitude === longitude &&
      u.latitude === latitude &&
      u.curHealth > 0 &&
      !u.fledBattle
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
  battle: ReturnedBattle,
  targetId: string
) => {
  // Certain buff/debuffs are applied always (e.g. resolving against each attack)
  const alwaysApply = [
    "absorb",
    "armoradjust",
    "damagegivenadjust",
    "damagetakenadjust",
    "healadjust",
    "poolcostadjust",
    "statadjust",
    "fleeprevent",
    "onehitkillprevent",
    "reflect",
    "robprevent",
    "sealprevent",
    "stunprevent",
    "summonprevent",
  ];
  if (alwaysApply.includes(effect.type)) return 1;
  // Get latest application of effect to the given target
  let applyTimes = 1;
  if (effect.rounds !== undefined && effect.timeTracker) {
    const prevApply = effect.timeTracker[targetId];
    if (prevApply) {
      if (battle.round !== prevApply) {
        effect.timeTracker[targetId] = battle.round;
      } else {
        applyTimes = 0;
      }
    } else {
      effect.timeTracker[targetId] = battle.round;
    }
  }
  // If no rounds, or no previous applies, then apply 1 time
  return applyTimes;
};

/**
 * Calculate effect round information based on a given battle
 */
export const calcEffectRoundInfo = (
  effect: UserEffect | GroundEffect,
  battle: ReturnedBattle
) => {
  if (effect.rounds !== undefined && effect.createdRound !== undefined) {
    return { startRound: effect.createdRound, curRound: battle.round };
  }
  return { startRound: -1, curRound: battle.round };
};

/**
 * Filter for effects based on their duration
 */
export const isEffectActive = (effect: UserEffect | GroundEffect) => {
  // Check1: If rounds not specified on tag, then yes, still active
  if (effect.rounds === undefined) return true;
  // Check2: If rounds > 0 then still active
  if (effect.rounds > 1) return true;
  // If none of the above, then no longer active
  return false;
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
    "clear",
    "armoradjust",
    "poolcostadjust",
    "statadjust",
    "poolcostadjust",
    // Mid-modifiers
    "barrier",
    "clone",
    "damage",
    "fleeprevent",
    "flee",
    "heal",
    "onehitkillprevent",
    "onehitkill",
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
 * Given an action, list of user effects, and a target, calculate pool cost for the action
 */
export const calcPoolCost = (
  action: CombatAction,
  usersEffects: UserEffect[],
  target: BattleUserState
) => {
  let hpCost = (action.healthCostPerc * target.maxHealth) / 100;
  let cpCost = (action.chakraCostPerc * target.maxChakra) / 100;
  let spCost = (action.staminaCostPerc * target.maxStamina) / 100;
  usersEffects
    .filter((e) => e.type === "poolcostadjust" && e.targetId === target.userId)
    .forEach((e) => {
      const { power } = getPower(e);
      if ("poolsAffected" in e) {
        e.poolsAffected?.forEach((pool) => {
          if (pool === "Health") {
            hpCost =
              e.calculation === "static"
                ? hpCost + power
                : (hpCost * (100 + power)) / 100;
          } else if (pool === "Chakra") {
            cpCost =
              e.calculation === "static"
                ? cpCost + power
                : (cpCost * (100 + power)) / 100;
          } else if (pool === "Stamina") {
            spCost =
              e.calculation === "static"
                ? spCost + power
                : (spCost * (100 + power)) / 100;
          }
        });
      }
    });
  return { hpCost, cpCost, spCost };
};

/**
 * A reducer for collapsing a Map<string, Consequence> into a Consequence[]
 */
export const collapseConsequences = (acc: Consequence[], val: Consequence) => {
  const current = acc.find((c) => c.targetId === val.targetId);
  if (current) {
    if (val.damage) {
      current.damage = current.damage ? current.damage + val.damage : val.damage;
    }
    if (val.heal) {
      current.heal = current.heal ? current.heal + val.heal : val.heal;
    }
    if (val.reflect) {
      current.reflect = current.reflect ? current.reflect + val.reflect : val.reflect;
    }
    if (val.absorb_hp) {
      current.absorb_hp = current.absorb_hp
        ? current.absorb_hp + val.absorb_hp
        : val.absorb_hp;
    }
    if (val.absorb_sp) {
      current.absorb_sp = current.absorb_sp
        ? current.absorb_sp + val.absorb_sp
        : val.absorb_sp;
    }
    if (val.absorb_cp) {
      current.absorb_cp = current.absorb_cp
        ? current.absorb_cp + val.absorb_cp
        : val.absorb_cp;
    }
  } else {
    acc.push(val);
  }
  return acc;
};

/**
 * Masks information from a battle prior to returning it to the frontend,
 * i.e. do not leak opponents stats
 */
export const maskBattle = (battle: Battle, userId: string) => {
  return {
    ...battle,
    usersState: (battle.usersState as ReturnedUserState[]).map((user) => {
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
    usersEffects: battle.usersEffects as UserEffect[],
    groundEffects: battle.groundEffects as GroundEffect[],
  };
};

/**
 * Figure out if user is still in battle, and if not whether the user won or lost
 */
export const calcBattleResult = (battle: CompleteBattle, userId: string) => {
  const users = battle.usersState;
  const user = users.find((u) => u.userId === userId);
  const originals = users.filter((u) => u.isOriginal);
  if (user && !user.leftBattle) {
    // If 1v1, then friends/targets are the opposing team. If MPvP, separate by village
    let targets: BattleUserState[] = [];
    let friends: BattleUserState[] = [];
    if (originals.length === 2) {
      targets = originals.filter((u) => u.userId !== userId);
      friends = originals.filter((u) => u.userId === userId);
    } else {
      targets = originals.filter((u) => u.villageId !== user.villageId);
      friends = originals.filter((u) => u.villageId === user.villageId);
    }
    const survivingTargets = targets.filter((t) => t.curHealth > 0 && !t.fledBattle);
    if (!stillInBattle(user) || survivingTargets.length === 0) {
      // Update the user left
      user.leftBattle = true;

      // Calculate ELO change
      const uExp = friends.reduce((a, b) => a + b.experience, 0) / friends.length;
      const oExp = targets.reduce((a, b) => a + b.experience, 0) / targets.length;
      const didWin = user.curHealth > 0 && !user.fledBattle;
      const maxGain = 32 * battle.rewardScaling;
      // Calculate ELO change if user had won. User gets 1/4th if they lost
      const eloDiff = Math.max(calcEloChange(uExp, oExp, maxGain, true), 0.02);
      const experience = !user.fledBattle ? (didWin ? eloDiff : eloDiff / 2) : 0.01;

      // Find users who did not leave battle yet
      const friendsLeft = friends.filter((u) => !u.leftBattle && !u.isAi);
      const targetsLeft = targets.filter((u) => !u.leftBattle && !u.isAi);

      // Money/ryo calculation
      const newMoney = didWin
        ? user.money + randomInt(30, 40) + user.level
        : user.money;
      const moneyDelta = newMoney - user.originalMoney;

      // Result object
      const result: CombatResult = {
        experience: experience,
        eloPvp: 0,
        eloPve: 0,
        curHealth: user.curHealth,
        curStamina: user.curStamina,
        curChakra: user.curChakra,
        strength: 0,
        intelligence: 0,
        willpower: 0,
        speed: 0,
        ninjutsuOffence: 0,
        genjutsuOffence: 0,
        taijutsuOffence: 0,
        bukijutsuOffence: 0,
        ninjutsuDefence: 0,
        genjutsuDefence: 0,
        taijutsuDefence: 0,
        bukijutsuDefence: 0,
        money: moneyDelta,
        friendsLeft: friendsLeft.length,
        targetsLeft: targetsLeft.length,
      };

      // If any stats were used, distribute exp change on stats.
      // If not, then distribute equally among all stats & generals
      let total = user.usedStats.length + user.usedGenerals.length;
      if (total === 0) {
        user.usedStats = [
          "ninjutsuOffence",
          "ninjutsuDefence",
          "genjutsuOffence",
          "genjutsuDefence",
          "taijutsuOffence",
          "taijutsuDefence",
          "bukijutsuOffence",
          "bukijutsuDefence",
        ];
        user.usedGenerals = ["Strength", "Intelligence", "Willpower", "Speed"];
        total = 12;
      }
      const statGain = Math.floor((experience / total) * 100) / 100;
      user.usedStats.forEach((stat) => {
        result[stat] += statGain;
      });
      user.usedGenerals.forEach((stat) => {
        result[stat.toLowerCase() as keyof CombatResult] += statGain;
      });

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
  const ratingChange = kFactor * ((won ? 1 : 0) - expectedScore);
  return Math.floor(ratingChange * 100) / 100;
};

/**
 * Evaluate whether we should forward battle to next round
 */
export const hasNoAvailableActions = (battle: ReturnedBattle, actorId: string) => {
  const actor = battle.usersState.find((u) => u.userId === actorId);
  if (actor) {
    const done = actor.curHealth <= 0 || actor.fledBattle || actor.leftBattle;
    if (!done) {
      const actions = availableUserActions(battle, actorId, !actor.isAi);
      for (let j = 0; j < actions.length; j++) {
        const action = actions[j];
        if (action) {
          const notWait = action.id !== "wait";
          const hasPoints = action.actionCostPerc <= actor.actionPoints;
          const aiMove = actor.isAi === 1 && action.id === "move";
          if (hasPoints && notWait && !aiMove) {
            return false;
          }
        }
      }
    }
  }
  return true;
};

/**
 * Refill action points for all users in the battle
 */
export const refillActionPoints = (battle: ReturnedBattle) => {
  battle.usersState.forEach((u) => {
    u.actionPoints = 100;
  });
};

/** Align battle based on timestamp to update:
 * - The proper round & activeUserId
 * - The action points of all users, in case of next round */
export const alignBattle = (battle: ReturnedBattle, userId?: string) => {
  const { actor, progressRound } = calcActiveUser(battle, userId);
  // A variable for the current round to be used in the battle
  const actionRound = progressRound ? battle.round + 1 : battle.round;
  // If we progress the battle round;
  // 1. refill action points
  // 2. update round info on battle
  // 3. update all user effect rounds
  if (progressRound) {
    refillActionPoints(battle);
    battle.roundStartAt = new Date();
    battle.round = actionRound;
    battle.usersEffects.forEach((e) => {
      if (e.rounds !== undefined && e.targetId === battle.activeUserId) {
        e.rounds = e.rounds - 1;
      }
    });
  }
  // Update the active user on the battle
  battle.activeUserId = actor.userId;
  battle.updatedAt = new Date();
  // TOOD: Debug
  // if (progressRound) console.log("==================");
  // console.log(
  //   battle.activeUserId,
  //   actor.userId,
  //   actor.username,
  //   battle.roundStartAt,
  //   battle.round,
  //   battle.version,
  //   Date.now()
  // );
  return { actor, progressRound, actionRound };
};
