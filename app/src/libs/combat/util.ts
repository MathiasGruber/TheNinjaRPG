import { publicState, allState } from "./constants";
import { getPower } from "./tags";
import { randomInt } from "@/utils/math";
import { availableUserActions } from "./actions";
import { calcActiveUser } from "./actions";
import { stillInBattle } from "./actions";
import { secondsPassed, secondsFromNow, secondsFromDate } from "@/utils/time";
import { realizeTag } from "./process";
import { KAGE_PRESTIGE_COST, FRIENDLY_PRESTIGE_COST } from "@/utils/kage";
import { calcIsInVillage } from "@/libs/travel/controls";
import { structureBoost } from "@/utils/village";
import { DecreaseDamageTakenTag } from "@/libs/combat/types";
import { StatTypes, GeneralType } from "@/drizzle/constants";
import { CLAN_BATTLE_REWARD_POINTS } from "@/drizzle/constants";
import { findRelationship } from "@/utils/alliance";
import { canTrainJutsu } from "@/libs/train";
import { USER_CAPS } from "@/drizzle/constants";
import { Orientation, Grid, rectangle } from "honeycomb-grid";
import { defineHex } from "../hexgrid";
import { COMBAT_HEIGHT, COMBAT_WIDTH, COMBAT_SECONDS } from "./constants";
import type { PathCalculator } from "../hexgrid";
import type { TerrainHex } from "../hexgrid";
import type { CombatResult, CompleteBattle, ReturnedBattle } from "./types";
import type { ReturnedUserState, Consequence } from "./types";
import type { CombatAction, BattleUserState } from "./types";
import type { ZodAllTags } from "./types";
import type { GroundEffect, UserEffect, BattleEffect } from "@/libs/combat/types";
import type { Battle, VillageAlliance, Village } from "@/drizzle/schema";
import type { Item, UserItem } from "@/drizzle/schema";
import type { BattleType } from "@/drizzle/constants";

/**
 * Retrieves the battle grid.
 */
export const getBattleGrid = (hexsize: number, origin?: { x: number; y: number }) => {
  const Tile = defineHex({
    dimensions: hexsize,
    origin,
    orientation: Orientation.FLAT,
  });
  const grid = new Grid(Tile, rectangle({ width: COMBAT_WIDTH, height: COMBAT_HEIGHT }))
    .filter((tile) => {
      try {
        return tile.width !== 0;
      } catch (e) {
        return false;
      }
    })
    .map((tile) => {
      tile.cost = 1;
      return tile;
    });
  return grid;
};

/**
 * Finds a user in the battle state based on location
 */
export const findUser = (
  users: ReturnedUserState[],
  longitude: number,
  latitude: number,
) => {
  return users.find(
    (u) => u.longitude === longitude && u.latitude === latitude && stillInBattle(u),
  );
};

/**
 * Finds a ground effect in the battle state based on location
 */
export const findBarrier = (
  groundEffects: GroundEffect[],
  longitude: number,
  latitude: number,
) => {
  return groundEffects.find(
    (b) => b.longitude === longitude && b.latitude === latitude && b.type === "barrier",
  );
};

/** Get a copy of the barriers between two tiles on the grid, as well as the total absorbtion along that path */
export const getBarriersBetween = (
  aStar: PathCalculator,
  groundEffects: GroundEffect[],
  origin: TerrainHex,
  target: TerrainHex,
) => {
  // Get all the barriers
  const barriers = (aStar
    .getShortestPath(origin, target)
    ?.map((t) => structuredClone(findBarrier(groundEffects, t.col, t.row)))
    .filter((b) => b !== undefined) ?? []) as BattleEffect[];
  // Calculate how much total is absorbed by the barriers
  const totalAbsorb = barriers.reduce((acc, b) => {
    if ("absorbPercentage" in b) {
      const remainder = 1 - acc;
      const absorb = remainder * (b.absorbPercentage / 100);
      b.absorbPercentage = absorb;
      return acc + absorb;
    }
    return acc;
  }, 0);
  return { barriers, totalAbsorb };
};

/**
 * Given a UserEffect, check if it is time to apply it. The effect is applied if:
 * 1. The effect is not already applied to the user
 * 2. A round has passed
 */
export const shouldApplyEffectTimes = (
  effect: UserEffect | GroundEffect,
  battle: ReturnedBattle,
  targetId: string,
) => {
  // Certain buff/debuffs are applied always (e.g. resolving against each attack)
  const alwaysApply: ZodAllTags["type"][] = [
    "absorb",
    "increasedamagegiven",
    "decreasedamagegiven",
    "increasedamagetaken",
    "decreasedamagetaken",
    "increaseheal",
    "decreaseheal",
    "increasepoolcost",
    "decreasepoolcost",
    "increasestat",
    "decreasestat",
    "fleeprevent",
    "onehitkillprevent",
    "reflect",
    "recoil",
    "lifesteal",
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
  battle: ReturnedBattle,
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
  if (effect.rounds > 0) return true;
  // If none of the above, then no longer active
  return false;
};

/**
 * Sort order in which effects are applied
 */
export const sortEffects = (
  a: UserEffect | GroundEffect,
  b: UserEffect | GroundEffect,
) => {
  const ordered: ZodAllTags["type"][] = [
    // Pre-modifiers
    "clear",
    "cleanse",
    "increasepoolcost",
    "decreasepoolcost",
    "increasestat",
    "decreasestat",
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
    "increasedamagegiven",
    "decreasedamagegiven",
    "increasedamagetaken",
    "decreasedamagetaken",
    "increaseheal",
    "decreaseheal",
    "reflect",
    "recoil",
    "lifesteal",
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
  target: BattleUserState,
) => {
  let hpCost = action.healthCost;
  let cpCost = action.chakraCost;
  let spCost = action.staminaCost;
  usersEffects
    .filter(
      (e) =>
        ["increasepoolcost", "decreasepoolcost"].includes(e.type) &&
        e.targetId === target.userId,
    )
    .forEach((e) => {
      // Get the power to apply (positive or negative)
      let { power } = getPower(e);
      if (e.type === "increasepoolcost" && power < 0) power *= -1;
      if (e.type === "decreasepoolcost" && power > 0) power *= -1;
      // Apply the power to the pools affected
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
    if (val.recoil) {
      current.recoil = current.recoil ? current.recoil + val.recoil : val.recoil;
    }
    if (val.lifesteal_hp) {
      current.lifesteal_hp = current.lifesteal_hp
        ? current.lifesteal_hp + val.lifesteal_hp
        : val.lifesteal_hp;
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
          publicState.map((key) => [key, user[key]]),
        ) as unknown as ReturnedUserState;
      } else {
        return Object.fromEntries(
          allState.map((key) => [key, user[key]]),
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
  const battleType = battle.battleType;
  const users = battle.usersState;
  const user = users.find((u) => u.userId === userId);
  if (user && !user.leftBattle) {
    // If single village, then friends/targets are the opposing team. If MPvP, separate by village
    const villageIds = [
      ...new Set(users.filter(stillInBattle).map((u) => u.villageId)),
    ];
    let targets: BattleUserState[] = [];
    let friends: BattleUserState[] = [];
    if (battleType === "CLAN_BATTLE") {
      targets = users.filter((u) => u.clanId !== user.clanId && !u.isSummon);
      friends = users.filter((u) => u.clanId === user.clanId && !u.isSummon);
    } else if (villageIds.length === 1) {
      targets = users.filter((u) => u.controllerId !== userId && !u.isSummon);
      friends = users.filter((u) => u.controllerId === userId && !u.isSummon);
    } else {
      targets = users.filter((u) => u.villageId !== user.villageId && !u.isSummon);
      friends = users.filter((u) => u.villageId === user.villageId && !u.isSummon);
    }
    const survivingTargets = targets.filter(stillInBattle);
    if (!stillInBattle(user) || survivingTargets.length === 0) {
      // Update the user left
      user.leftBattle = true;

      // Calculate ELO change
      const uExp = friends.reduce((a, b) => a + b.experience, 0) / friends.length;
      const oExp = targets.reduce((a, b) => a + b.experience, 0) / targets.length;
      const didWin = user.curHealth > 0 && !user.fledBattle;
      const maxGain = 32 * battle.rewardScaling;

      // Experience boost
      let expBoost = 1;
      user.village?.structures?.forEach((s) => {
        expBoost += (s.arenaRewardPerLvl * s.level) / 100;
      });
      if (user?.clan?.trainingBoost && user.clan.trainingBoost > 0) {
        expBoost += user.clan.trainingBoost / 100;
      }

      // Calculate ELO change if user had won. User gets 1/4th if they lost
      const eloDiff = Math.max(calcEloChange(uExp, oExp, maxGain, true), 0.02);
      const outcome = user.fledBattle ? "Fled" : didWin ? "Won" : "Lost";
      let experience = didWin ? eloDiff * expBoost : 0;

      // If Combat, then double the experience gain
      if (["COMBAT", "CLAN_BATTLE", "TOURNAMENT"].includes(battleType)) {
        experience *= 2;
      }

      // Find users who did not leave battle yet
      const friendsUsers = friends.filter((u) => !u.isAi);
      const targetUsers = targets.filter((u) => !u.isAi);
      const friendsLeft = friendsUsers.filter((u) => !u.leftBattle);
      const targetsLeft = targetUsers.filter((u) => !u.leftBattle);

      // Tokens & prestige
      let deltaTokens = 0;
      let deltaPrestige = 0;
      let clanPoints = 0;

      // Money/ryo calculation
      const moneyBoost = user?.clan?.ryoBoost ? 1 + user.clan.ryoBoost / 100 : 1;
      const moneyDelta = didWin ? (randomInt(30, 40) + user.level) * moneyBoost : 0;

      // Prestige calculation
      if (battleType === "KAGE_CHALLENGE" && !didWin && user.isAggressor) {
        deltaPrestige = -KAGE_PRESTIGE_COST;
      }

      // Check for clan points
      if (didWin) {
        if (user.clanId) clanPoints += 1;
        if (battleType === "CLAN_BATTLE") clanPoints += CLAN_BATTLE_REWARD_POINTS;
      }

      // Check for prestige, tokens, etc.
      const vilId = user.villageId;
      if (didWin && battleType === "COMBAT" && user.isAggressor) {
        targetUsers.forEach((target) => {
          // Prestige deduction for killing allies
          const isAlly = target.relations
            .filter((r) => r.status === "ALLY")
            .find(
              (r) =>
                (r.villageIdA === vilId && r.villageIdB === target.villageId) ||
                (r.villageIdA === target.villageId && r.villageIdB === vilId),
            );
          const sameVillage = target.villageId === vilId;
          deltaPrestige -= isAlly || sameVillage ? FRIENDLY_PRESTIGE_COST : 0;

          // Village tokens for killing enemies
          deltaTokens += target.relations
            .filter((r) => r.status === "ENEMY")
            .filter(
              (r) =>
                (r.villageIdA === vilId && r.villageIdB === target.villageId) ||
                (r.villageIdA === target.villageId && r.villageIdB === vilId),
            ).length;
        });
      }

      // ANBU boost to tokens
      if (user.anbuId) deltaTokens *= 2;

      // Result object
      const result: CombatResult = {
        outcome: outcome,
        didWin: didWin ? 1 : 0,
        experience: 0.01,
        pvpStreak:
          battleType === "COMBAT" ? (didWin ? user.pvpStreak + 1 : 0) : user.pvpStreak,
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
        money: 0,
        villagePrestige: deltaPrestige,
        friendsLeft: friendsLeft.length,
        targetsLeft: targetsLeft.length,
        villageTokens: deltaTokens,
        clanPoints: clanPoints,
      };

      // Things to reward for non-spars
      if (battleType !== "SPARRING") {
        // Money stolen/given
        result["money"] = moneyDelta;
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
        let assignedExp = 0;
        const gain = Math.floor((experience / total) * 100) / 100;
        const stats_cap = USER_CAPS[user.rank].STATS_CAP;
        const gens_cap = USER_CAPS[user.rank].GENS_CAP;
        user.usedStats.forEach((stat) => {
          const value = user[stat] + gain > stats_cap ? stats_cap - user[stat] : gain;
          result[stat] += value;
          assignedExp += value;
        });
        user.usedGenerals.forEach((stat) => {
          const gen = stat.toLowerCase() as Lowercase<typeof stat>;
          const value = user[gen] + gain > gens_cap ? gens_cap - user[gen] : gain;
          result[gen] += value;
          assignedExp += value;
        });
        // Experience
        result["experience"] = assignedExp;
      }

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
          const aiMove = actor.isAi && action.id === "move";
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

/**
 * Filters the given BattleEffect for round decrement.
 * @param effect - The BattleEffect to filter.
 * @returns True if the BattleEffect has rounds defined and is not new or cast this round, false otherwise.
 */
const filterForRoundDecrement = (effect: BattleEffect) => {
  return effect.rounds !== undefined && !effect.isNew && !effect.castThisRound;
};

/** Align battle based on timestamp to update:
 * - The proper round & activeUserId
 * - The action points of all users, in case of next round */
export const alignBattle = (battle: CompleteBattle, userId?: string) => {
  const now = new Date();
  const { actor, progressRound } = calcActiveUser(battle, userId);
  // A variable for the current round to be used in the battle
  const actionRound = progressRound ? battle.round + 1 : battle.round;
  // If we progress the battle round;
  // 1. refill action points
  // 2. update round info on battle
  // 3. update all user effect rounds
  // 4. update all updatedAt fields on items & jutsus
  if (progressRound) {
    const timeLeftInPrevRound = COMBAT_SECONDS - secondsPassed(battle.roundStartAt);
    refillActionPoints(battle);
    battle.roundStartAt = now;
    battle.round = actionRound;
    // console.log("Action round: ", actionRound);
    battle.usersEffects.filter(filterForRoundDecrement).forEach((e) => {
      if (e.rounds !== undefined && e.targetId === battle.activeUserId) {
        // console.log(`Updating effect ${e.type} round ${e.rounds} -> ${e.rounds - 1}`);
        e.rounds = e.rounds - 1;
      }
    });
    battle.groundEffects.filter(filterForRoundDecrement).forEach((e) => {
      if (e.rounds !== undefined && e.creatorId === battle.activeUserId) {
        // console.log(`Updating effect ${e.type} round ${e.rounds} -> ${e.rounds - 1}`);
        e.rounds = e.rounds - 1;
      }
    });
    battle.usersState.forEach((u) => {
      u.items.forEach((i) => {
        if (i.updatedAt) {
          i.updatedAt = secondsFromDate(-timeLeftInPrevRound, new Date(i.updatedAt));
        }
      });
      u.jutsus.forEach((j) => {
        if (j.updatedAt) {
          j.updatedAt = secondsFromDate(-timeLeftInPrevRound, new Date(j.updatedAt));
        }
      });
    });
  }
  // Update the active user on the battle
  battle.activeUserId = actor.userId;
  battle.updatedAt = now;
  // Is the new actor stunned?
  const isStunned = calcIsStunned(battle, actor.userId);
  // TOOD: Debug
  // console.log("New Actor: ", actor.username, battle.round, battle.version, Date.now());
  return { actor, progressRound, actionRound, isStunned };
};

export const calcIsStunned = (battle: ReturnedBattle, userId: string) => {
  const stunned = battle.usersEffects.find(
    (e) => e.type === "stun" && e.targetId === userId,
  );
  return stunned ? true : false;
};

export const rollInitiative = (
  user: BattleUserState,
  opponents?: BattleUserState[],
) => {
  // Get a random number between 1 and 20
  let roll = randomInt(1, 20);
  // Calculate level bonus
  if (opponents) {
    const avgLevel = opponents.reduce((a, b) => a + b.level, 0) / opponents.length;
    const levelBonus = Math.max((user.level - avgLevel) * 0.03, 0);
    roll = roll * (1 + levelBonus);
  }
  // Calculate territory bonus
  const ownTerritory = user.sector === user.village?.sector;
  const territoryBonus = ownTerritory ? 0.1 : -0.1;
  roll = roll * (1 + territoryBonus);
  // PvP bonus
  if (user.pvpStreak > 0) {
    let pvpBonus = 0;
    for (let i = 1; i <= user.pvpStreak; i++) {
      switch (i) {
        case 1:
          pvpBonus += 0.02;
          break;
        case 2:
          pvpBonus += 0.015;
          break;
        case 3:
          pvpBonus += 0.01;
          break;
        case 4:
          pvpBonus += 0.005;
          break;
        case 5:
          pvpBonus += 0.0025;
          break;
        default:
          pvpBonus += 0.0025;
          break;
      }
    }
    roll = roll * (1 + pvpBonus);
  }
  return roll;
};

/**
 * Processes the users for a battle.
 *
 * @param users - An array of `BattleUserState` objects representing the users participating in the battle.
 * @param hide - A boolean indicating whether to hide user on map. Defaults to `false`.
 * @returns An object containing the processed user effects, updated user states, and all summons.
 */
export const processUsersForBattle = (info: {
  users: BattleUserState[];
  relations: VillageAlliance[];
  villages: Village[];
  battleType: BattleType;
  hide: boolean;
  leftSideUserIds?: string[];
}) => {
  // Destructure
  const { users, relations, battleType, hide, leftSideUserIds } = info;
  // Collect user effects here
  const allSummons: string[] = [];
  const userEffects: UserEffect[] = [];
  const usersState = users.map((user, i) => {
    // Set controllerID and mark this user as the original
    user.controllerId = user.userId;

    // Set direction
    user.direction = i % 2 === 0 ? "right" : "left";

    // Set the updated at to now, so that action bar starts at 0
    user.updatedAt = new Date();

    // Set all users to not be agressors by default
    user.isAggressor = false;

    // Add regen to pools. Pools are not updated "live" in the database, but rather are calculated on the frontend
    // Therefore we need to calculate the current pools here, before inserting the user into battle
    const regen =
      (user.bloodline?.regenIncrease
        ? user.regeneration + user.bloodline.regenIncrease
        : user.regeneration) * secondsPassed(user.regenAt);
    user.curHealth = Math.min(user.curHealth + regen, user.maxHealth);
    user.curChakra = Math.min(user.curChakra + regen, user.maxChakra);
    user.curStamina = Math.min(user.curStamina + regen, user.maxStamina);

    // Add highest stat name to user
    const offences = {
      ninjutsuOffence: user.ninjutsuOffence,
      genjutsuOffence: user.genjutsuOffence,
      taijutsuOffence: user.taijutsuOffence,
      bukijutsuOffence: user.bukijutsuOffence,
    };
    type offenceKey = keyof typeof offences;
    user.highestOffence = Object.keys(offences).reduce((prev, cur) =>
      offences[prev as offenceKey] > offences[cur as offenceKey] ? prev : cur,
    ) as offenceKey;
    const defences = {
      ninjutsuDefence: user.ninjutsuDefence,
      genjutsuDefence: user.genjutsuDefence,
      taijutsuDefence: user.taijutsuDefence,
      bukijutsuDefence: user.bukijutsuDefence,
    };
    type defenceKey = keyof typeof defences;
    user.highestDefence = Object.keys(defences).reduce((prev, cur) =>
      defences[prev as defenceKey] > defences[cur as defenceKey] ? prev : cur,
    ) as defenceKey;

    // By default set iAmHere to false
    user.iAmHere = false;

    // Remember how much money this user had
    user.originalMoney = user.money;
    user.actionPoints = 100;

    // Convenience function for assigning location of user
    const takenLocations: { x: number; y: number }[] = [];
    const assignLocation = (min: number, max: number) => {
      let x = randomInt(min, max);
      let y = randomInt(1, 3);
      do {
        x = randomInt(min, max);
        y = randomInt(1, 3);
      } while (takenLocations.some((l) => l.x === x && l.y === y));
      takenLocations.push({ x, y });
      return { x, y };
    };

    // Store original location
    user.originalLongitude = user.longitude;
    user.originalLatitude = user.latitude;

    // Default locaton
    if (hide) {
      user.longitude = 0;
      user.latitude = 0;
      user.curHealth = 0;
    } else {
      if (leftSideUserIds?.includes(user.userId)) {
        const { x, y } = assignLocation(1, 5);
        user["longitude"] = x;
        user["latitude"] = y;
      } else {
        const { x, y } = assignLocation(7, 11);
        user["longitude"] = x;
        user["latitude"] = y;
      }
    }

    // By default the ones inserted initially are original
    user.isOriginal = true;
    user.isSummon = false;

    // Set the history lists to record actions during battle
    user.usedGenerals = [];
    user.usedStats = [];
    user.usedActions = [];

    // If in own village, add defence bonus
    const ownSector = user.sector === user.village?.sector;
    const inVillage = calcIsInVillage({ x: user.longitude, y: user.latitude });
    if (ownSector && inVillage && battleType !== "ARENA") {
      const boost = structureBoost("villageDefencePerLvl", user.village?.structures);
      const effect = DecreaseDamageTakenTag.parse({
        target: "SELF",
        statTypes: StatTypes,
        generalTypes: GeneralType,
        type: "decreasedamagetaken",
        power: boost,
        rounds: undefined,
      }) as unknown as UserEffect;
      const realized = realizeTag(effect, user, user.level);
      realized.isNew = false;
      realized.castThisRound = false;
      realized.targetId = user.userId;
      userEffects.push(realized);
    }

    // Add bloodline efects
    if (user.bloodline?.effects) {
      const effects = user.bloodline.effects as unknown as UserEffect[];
      effects.forEach((effect) => {
        const realized = realizeTag(effect, user, user.level);
        realized.isNew = false;
        realized.castThisRound = false;
        realized.targetId = user.userId;
        realized.fromType = "bloodline";
        userEffects.push(realized);
      });
    }

    // Set jutsus updatedAt to now (we use it for determining usage cooldowns)
    user.jutsus = user.jutsus
      .filter((userjutsu) => {
        // Not if no jutsu
        if (!userjutsu.jutsu) {
          return false;
        }
        // Not if not the right weapon
        if (userjutsu.jutsu.jutsuWeapon !== "NONE") {
          const equippedWeapon = user.items.find(
            (useritem) =>
              useritem.item.weaponType === userjutsu.jutsu.jutsuWeapon &&
              useritem.equipped !== "NONE",
          );
          if (!equippedWeapon) return false;
        }
        // Not if cannot train jutsu
        if (!canTrainJutsu(userjutsu.jutsu, user)) {
          return false;
        }
        // Add summons to list
        const effects = userjutsu.jutsu.effects as UserEffect[];
        effects
          .filter((e) => e.type === "summon")
          .forEach((e) => "aiId" in e && allSummons.push(e.aiId));
        // Not if not the right bloodline
        return (
          userjutsu.jutsu.bloodlineId === "" ||
          user.isAi ||
          user.bloodlineId === userjutsu.jutsu.bloodlineId
        );
      })
      .map((userjutsu) => {
        userjutsu.updatedAt = secondsFromNow(
          -userjutsu.jutsu.cooldown * COMBAT_SECONDS,
        );
        return userjutsu;
      });

    // Sort if we have a loadout
    if (user?.loadout?.jutsuIds) {
      user.jutsus.sort((a, b) => {
        const aIndex = user?.loadout?.jutsuIds.indexOf(a.jutsuId) ?? -1;
        const bIndex = user?.loadout?.jutsuIds.indexOf(b.jutsuId) ?? -1;
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    }

    // Add item effects
    const items: (UserItem & { item: Item })[] = [];
    user.items.forEach((useritem) => {
      const itemType = useritem.item.itemType;
      const effects = useritem.item.effects as UserEffect[];
      effects
        .filter((e) => e.type === "summon")
        .forEach((e) => "aiId" in e && allSummons.push(e.aiId));
      if (itemType === "ARMOR" || itemType === "ACCESSORY") {
        if (useritem.item.effects && useritem.equipped !== "NONE") {
          effects.forEach((effect) => {
            const realized = realizeTag(effect, user, user.level);
            realized.isNew = false;
            realized.castThisRound = false;
            realized.targetId = user.userId;
            userEffects.push(realized);
          });
        }
      } else {
        useritem.updatedAt = secondsFromNow(-useritem.item.cooldown * COMBAT_SECONDS);
        items.push(useritem);
      }
    });
    user.items = items;

    // Base values
    user.fledBattle = false;
    user.leftBattle = false;

    // Roll initiative
    user.initiative = rollInitiative(user, users);

    // Add relevant relations to usersState
    user.relations = relations.filter(
      (r) => r.villageIdA === user.villageId || r.villageIdB === user.villageId,
    );

    // Check if we are in ally village or not
    user.allyVillage = false;
    if (inVillage && !ownSector) {
      const sector = info.villages.find((v) => v.sector === user.sector);
      if (sector) {
        const relationship = findRelationship(relations, user.villageId, sector.id);
        if (relationship?.status === "ALLY") {
          user.allyVillage = true;
        }
      }
    }

    return user;
  });

  return { userEffects, usersState, allSummons };
};
