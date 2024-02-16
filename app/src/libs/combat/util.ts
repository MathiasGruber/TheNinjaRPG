import { publicState, allState } from "./constants";
import { getPower } from "./tags";
import { randomInt } from "@/utils/math";
import { availableUserActions } from "./actions";
import { calcActiveUser } from "./actions";
import { stillInBattle } from "./actions";
import { secondsPassed, secondsFromNow, secondsFromDate } from "@/utils/time";
import { realizeTag } from "./process";
import { COMBAT_SECONDS } from "./constants";
import { PRESTIGE_COST } from "@/utils/kage";
import type { PathCalculator } from "../hexgrid";
import type { TerrainHex } from "../hexgrid";
import type { CombatResult, CompleteBattle, ReturnedBattle } from "./types";
import type { ReturnedUserState, Consequence } from "./types";
import type { CombatAction, BattleUserState } from "./types";
import type { ZodAllTags } from "./types";
import type { GroundEffect, UserEffect, BattleEffect } from "@/libs/combat/types";
import type { Battle } from "../../../drizzle/schema";
import type { Item, UserItem } from "../../../drizzle/schema";

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
    "increasearmor",
    "decreasearmor",
    "increasedamagegiven",
    "decreasedamagegiven",
    "increasedamagetaken",
    "decreasedamagetaken",
    "increaseheal",
    "decreaseheal",
    "poolcostadjust",
    "increasepoolcost",
    "decreasepoolcost",
    "increasestat",
    "decreasestat",
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
    "increasearmor",
    "decreasearmor",
    "poolcostadjust",
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
  let hpCost = (action.healthCostPerc * target.maxHealth) / 100;
  let cpCost = (action.chakraCostPerc * target.maxChakra) / 100;
  let spCost = (action.staminaCostPerc * target.maxStamina) / 100;
  usersEffects
    .filter(
      (e) =>
        ["poolcostadjust", "increasepoolcost", "decreasepoolcost"].includes(e.type) &&
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
  const users = battle.usersState;
  const user = users.find((u) => u.userId === userId);
  if (user && !user.leftBattle) {
    // If single village, then friends/targets are the opposing team. If MPvP, separate by village
    const villageIds = [
      ...new Set(users.filter(stillInBattle).map((u) => u.villageId)),
    ];
    let targets: BattleUserState[] = [];
    let friends: BattleUserState[] = [];
    if (villageIds.length === 1) {
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

      // Prestige calculation
      let deltaPrestige = 0;
      if (battle.battleType === "KAGE" && !didWin) deltaPrestige = -PRESTIGE_COST;

      // Result object
      const result: CombatResult = {
        didWin: didWin ? 1 : 0,
        experience: 0.01,
        eloPvp: 0,
        eloPve: 0,
        pvpStreak: didWin && battle.battleType === "COMBAT" ? user.pvpStreak + 1 : 0,
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
      };

      // Things to reward for non-spars
      if (battle.battleType !== "SPARRING") {
        // Experience
        result["experience"] = experience;
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
        const statGain = Math.floor((experience / total) * 100) / 100;
        user.usedStats.forEach((stat) => {
          result[stat] += statGain;
        });
        user.usedGenerals.forEach((stat) => {
          result[stat.toLowerCase() as keyof CombatResult] += statGain;
        });
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
export const alignBattle = (battle: CompleteBattle, userId?: string) => {
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
    battle.roundStartAt = new Date();
    battle.round = actionRound;
    battle.usersEffects.forEach((e) => {
      if (e.rounds !== undefined && e.targetId === battle.activeUserId) {
        // console.log(`Updating effect ${e.type} round ${e.rounds} -> ${e.rounds - 1}`);
        e.rounds = e.rounds - 1;
      }
    });
    battle.groundEffects.forEach((e) => {
      if (e.rounds !== undefined && e.creatorId === battle.activeUserId && !e.isNew) {
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
  battle.updatedAt = new Date();
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

export const processUsersForBattle = (
  users: BattleUserState[],
  hide: boolean = false,
) => {
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

    // Default locaton
    if (hide) {
      user.longitude = 0;
      user.latitude = 0;
      user.curHealth = 0;
    }

    // By default the ones inserted initially are original
    user.isOriginal = true;
    user.isSummon = 0;

    // Set the history lists to record actions during battle
    user.usedGenerals = [];
    user.usedStats = [];
    user.usedActions = [];

    // Add bloodline efects
    if (user.bloodline?.effects) {
      const effects = user.bloodline.effects as unknown as UserEffect[];
      effects.forEach((effect) => {
        const realized = realizeTag(effect, user, user.level);
        realized.isNew = false;
        realized.castThisRound = false;
        realized.targetId = user.userId;
        realized.fromBloodline = true;
        userEffects.push(realized);
      });
    }

    // Set jutsus updatedAt to now (we use it for determining usage cooldowns)
    user.jutsus = user.jutsus
      .filter((userjutsu) => {
        if (!userjutsu.jutsu) return false;
        const effects = userjutsu.jutsu.effects as UserEffect[];
        effects
          .filter((e) => e.type === "summon")
          .forEach((e) => "aiId" in e && allSummons.push(e.aiId));
        return (
          userjutsu.jutsu.bloodlineId === "" ||
          user.isAi === 1 ||
          user.bloodlineId === userjutsu.jutsu.bloodlineId
        );
      })
      .map((userjutsu) => {
        userjutsu.updatedAt = secondsFromNow(
          -userjutsu.jutsu.cooldown * COMBAT_SECONDS,
        );
        return userjutsu;
      });

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
    user.armor = 0;
    user.fledBattle = false;
    user.leftBattle = false;
    // Roll initiative
    user.initiative = rollInitiative(user, users);
    return user;
  });
  return { userEffects, usersState, allSummons };
};
