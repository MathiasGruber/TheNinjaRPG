import { Prisma, AttackMethod } from "@prisma/client";
import { spiral } from "honeycomb-grid";
import { publicState, allState } from "./types";
import { getPower } from "./tags";
import { secondsPassed, secondsFromDate } from "../../utils/time";
import { COMBAT_SECONDS, COMBAT_HEIGHT, COMBAT_WIDTH } from "./constants";
import { availableUserActions, insertAction } from "./actions";
import { applyEffects } from "./process";
import { realizeTag } from "../../libs/combat/process";
import { BarrierTag, StatNames } from "../../libs/combat/types";
import { UserStatus, BattleType, ItemType } from "@prisma/client";
import { combatAssets } from "../../libs/travel/biome";
import { getServerPusher } from "../../libs/pusher";
import type { Grid } from "honeycomb-grid";
import type { CombatResult } from "./types";
import type { ReturnedUserState, Consequence } from "./types";
import type { CombatAction, BattleUserState } from "./types";
import type { Battle } from "@prisma/client";
import type { TerrainHex } from "../../libs/hexgrid";
import type { Item, UserItem } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { GroundEffect, UserEffect } from "../../libs/combat/types";

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
      u.cur_health > 0 &&
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
    // if (!isActive) console.log("Effect expired: ", effect.type);
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
  let hpCost = (action.healthCostPerc * target.max_health) / 100;
  let cpCost = (action.chakraCostPerc * target.max_chakra) / 100;
  let spCost = (action.staminaCostPerc * target.max_stamina) / 100;
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
export const calcBattleResult = (users: BattleUserState[], userId: string) => {
  const user = users.find((u) => u.userId === userId);
  const originals = users.filter((u) => u.is_original);
  if (user && user.cur_stamina && user.cur_chakra && !user.leftBattle) {
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
    const survivingTargets = targets.filter((t) => t.cur_health > 0 && !t.fledBattle);
    if (user.cur_health <= 0 || user.fledBattle || survivingTargets.length === 0) {
      // Update the user left
      user.leftBattle = true;

      // Calculate ELO change
      const uExp = friends.reduce((a, b) => a + b.experience, 0) / friends.length;
      const oExp = targets.reduce((a, b) => a + b.experience, 0) / targets.length;
      const didWin = user.cur_health > 0;
      console.log("~~~~~~~~~~~~~~~~~~~~~~~~");
      console.log(uExp, oExp, didWin);
      const eloDiff = Math.max(calcEloChange(uExp, oExp, 32, didWin), 0);
      console.log("~~~~~~~~~~~~~~~~~~~~~~~~");

      // Find users who did not leave battle yet
      const friendsLeft = friends.filter((u) => !u.leftBattle);
      const targetsLeft = targets.filter((u) => !u.leftBattle);

      // Result object
      // TODO: distribute elo_points among stats used during battle
      const result: CombatResult = {
        experience: eloDiff,
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
        money: user.money,
        friendsLeft: friendsLeft.length,
        targetsLeft: targetsLeft.length,
      };

      // If any stats were used, distribute exp change on stats.
      // If not, then distribute equally among all stats & generals
      let total = user.usedStats.length + user.usedGenerals.length;
      if (total === 0) {
        user.usedStats = [
          "ninjutsu_offence",
          "ninjutsu_defence",
          "genjutsu_offence",
          "genjutsu_defence",
          "taijutsu_offence",
          "taijutsu_defence",
          "bukijutsu_offence",
          "bukijutsu_defence",
        ];
        user.usedGenerals = ["Strength", "Intelligence", "Willpower", "Speed"];
        total = 12;
      }
      const statGain = Math.floor((eloDiff / total) * 100) / 100;
      user.usedStats.forEach((stat) => {
        result[stat] += statGain;
      });
      user.usedGenerals.forEach((stat) => {
        result[stat.toLowerCase() as keyof CombatResult] += statGain;
      });

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
  const ratingChange = kFactor * ((won ? 1 : 0) - expectedScore);
  return Math.floor(ratingChange * 100) / 100;
};

/** Given an action from a given origin, return the tiles where this action could reach */
export const getPossibleActionTiles = (
  action: CombatAction | undefined,
  origin: TerrainHex | undefined,
  grid: Grid<TerrainHex>
) => {
  let highlights: Grid<TerrainHex> | undefined = undefined;
  if (action && origin) {
    const radius = action.range;
    if (
      action.method === AttackMethod.SINGLE ||
      action.method === AttackMethod.AOE_LINE_SHOOT ||
      action.method === AttackMethod.AOE_CIRCLE_SHOOT ||
      action.method === AttackMethod.AOE_SPIRAL_SHOOT
    ) {
      const f = spiral<TerrainHex>({ start: [origin.q, origin.r], radius: radius });
      highlights = grid.traverse(f);
    } else if (action.method === AttackMethod.ALL) {
      highlights = grid.forEach((hex) => hex);
    } else if (action.method === AttackMethod.AOE_CIRCLE_SPAWN) {
      const f = spiral<TerrainHex>({ start: [origin.q, origin.r], radius: radius + 1 });
      highlights = grid.traverse(f);
    }
  }
  return highlights;
};

export const performAction = (props: {
  usersState: BattleUserState[];
  usersEffects: UserEffect[];
  groundEffects: GroundEffect[];
  grid: Grid<TerrainHex>;
  action: CombatAction;
  contextUserId: string;
  actionUserId: string;
  longitude: number;
  latitude: number;
}) => {
  // Destructure
  const { usersState, usersEffects, groundEffects } = props;
  const { grid, action, contextUserId, actionUserId, longitude, latitude } = props;
  // Ensure that the userId we're trying to move is valid
  const user = usersState.find(
    (u) => u.controllerId === contextUserId && u.userId === actionUserId
  );
  if (!user) throw new Error("This is not your user");

  // Perform action, get latest status effects
  // Note: this mutates usersEffects, groundEffects in place
  const check = insertAction({
    usersState,
    usersEffects,
    groundEffects,
    grid,
    action,
    userId: actionUserId,
    longitude: longitude,
    latitude: latitude,
  });
  if (!check) {
    throw new Error("Requested action not possible anymore");
  }

  // Apply relevant effects, and get back new state + active effects
  const { newUsersState, newUsersEffects, newGroundEffects, actionEffects } =
    applyEffects(usersState, usersEffects, groundEffects);

  return {
    newUsersState,
    newUsersEffects,
    newGroundEffects,
    actionEffects,
  };
};

export const initiateBattle = async (
  info: {
    longitude?: number;
    latitude?: number;
    sector: number;
    userId: string;
    targetId: string;
    prisma: PrismaClient;
  },
  battleType: BattleType,
  background = "forest.webp"
) => {
  const { longitude, latitude, sector, userId, targetId, prisma } = info;
  const battle = await prisma.$transaction(async (tx) => {
    // Get user & target data, to be inserted into battle
    const users = await tx.userData.findMany({
      include: {
        items: {
          include: {
            item: true,
          },
          where: {
            quantity: {
              gt: 0,
            },
            equipped: {
              not: null,
            },
          },
        },
        jutsus: {
          include: {
            jutsu: true,
          },
          where: {
            equipped: true,
          },
        },
        bloodline: true,
        village: true,
      },
      where: {
        OR: [{ userId: userId }, { userId: targetId }],
      },
    });
    users.sort((a, b) => (a.userId === userId ? -1 : 1));

    // Use long/lat fields for position in combat map
    if (users?.[0]) {
      users[0]["longitude"] = 4;
      users[0]["latitude"] = 2;
    } else {
      throw new Error(`Failed to set position of left-hand user`);
    }
    if (users?.[1]) {
      users[1]["longitude"] = 8;
      users[1]["latitude"] = 2;
    } else {
      throw new Error(`Failed to set position of right-hand user`);
    }

    // Create the users array to be inserted into the battle
    const userEffects: UserEffect[] = [];
    const usersState = users.map((raw) => {
      // Add basics
      const user = raw as BattleUserState;
      user.controllerId = user.userId;
      user.is_original = true;

      // Add regen to pools. Pools are not updated "live" in the database, but rather are calculated on the frontend
      // Therefore we need to calculate the current pools here, before inserting the user into battle
      const regen =
        (user.bloodline?.regenIncrease
          ? user.regeneration + user.bloodline.regenIncrease
          : user.regeneration) * secondsPassed(user.regenAt);
      user.cur_health = Math.min(user.cur_health + regen, user.max_health);
      user.cur_chakra = Math.min(user.cur_chakra + regen, user.max_chakra);
      user.cur_stamina = Math.min(user.cur_stamina + regen, user.max_stamina);

      // Add highest stats to user
      user.highest_offence = Math.max(
        user.ninjutsu_offence,
        user.genjutsu_offence,
        user.taijutsu_offence,
        user.bukijutsu_offence
      );
      user.highest_defence = Math.max(
        user.ninjutsu_offence,
        user.genjutsu_offence,
        user.taijutsu_offence,
        user.bukijutsu_offence
      );

      // Set the history lists to record actions during battle
      user.usedGenerals = [];
      user.usedStats = [];
      user.usedActionIDs = [];

      // Add bloodline efects
      if (user.bloodline?.effects) {
        const effects = user.bloodline.effects as unknown as UserEffect[];
        effects.forEach((effect) => {
          const realized = realizeTag(effect, user, user.level);
          realized.isNew = false;
          realized.targetId = user.userId;
          realized.fromBloodline = true;
          userEffects.push(realized);
        });
      }
      // Add item effects
      const items: (UserItem & { item: Item })[] = [];
      user.items.forEach((useritem) => {
        const itemType = useritem.item.itemType;
        if (itemType === ItemType.ARMOR || itemType === ItemType.ACCESSORY) {
          if (useritem.item.effects) {
            const effects = useritem.item.effects as unknown as UserEffect[];
            effects.forEach((effect) => {
              const realized = realizeTag(effect, user, user.level);
              realized.isNew = false;
              realized.targetId = user.userId;
              userEffects.push(realized);
            });
          }
        } else {
          items.push(useritem);
        }
      });
      user.items = items;
      // Base values
      user.armor = 0;
      user.fledBattle = false;
      user.leftBattle = false;
      return user;
    });

    // Starting ground effects
    const groundEffects: GroundEffect[] = [];
    for (let col = 0; col < COMBAT_WIDTH; col++) {
      for (let row = 0; row < COMBAT_HEIGHT; row++) {
        // Ignore the spots where we placed users
        const foundUser = usersState.find(
          (u) => u.longitude === col && u.latitude === row
        );
        const rand = Math.random();
        combatAssets.every((asset) => {
          if (rand < asset.chance && !foundUser) {
            const tag: GroundEffect = {
              ...BarrierTag.parse({
                power: 2,
                originalPower: 2,
                calculation: "static",
              }),
              id: `initial-${col}-${row}`,
              creatorId: "ground",
              createdAt: Date.now(),
              level: 0,
              longitude: col,
              latitude: row,
              isNew: false,
              staticAssetPath: asset.filepath + asset.filename,
            };
            groundEffects.push(tag);
            return false;
          }
          return true;
        });
      }
    }

    // Create combat entry
    const battle = await tx.battle.create({
      data: {
        battleType,
        background,
        usersState: usersState as unknown as Prisma.JsonArray,
        usersEffects: userEffects as unknown as Prisma.JsonArray,
        groundEffects: groundEffects as unknown as Prisma.JsonArray,
      },
    });

    // Update users, but only succeed transaction if none of them already had a battle assigned
    const result: number = await tx.$executeRaw`
      UPDATE UserData
      SET
        status = CASE WHEN isAI = false THEN 
          ${UserStatus.BATTLE} ELSE ${UserStatus.AWAKE} END,
        battleId = CASE WHEN isAI = false THEN 
          ${battle.id} ELSE NULL END,
        updatedAt = Now()
      WHERE
        (userId = ${userId} OR userId = ${targetId}) AND  
        status = 'AWAKE' 
        ${
          battleType === BattleType.COMBAT
            ? Prisma.sql`AND sector = ${sector} AND longitude = ${longitude} AND latitude = ${latitude}`
            : Prisma.empty
        }  
        `;
    if (result !== 2) {
      throw new Error(`Attack failed, did the target move?`);
    }
    // Push websockets message to target
    const pusher = getServerPusher();
    void pusher.trigger(targetId, "event", { type: "battle" });

    // Return the battle
    return battle;
  });
  return battle;
};
