import { AttackTarget, AttackMethod } from "@prisma/client";
import { MoveTag, DamageTag, FleeTag } from "./types";
import { isEffectStillActive } from "./util";
import { getAffectedTiles, actionSecondsAfterAction } from "./movement";
import { realizeTag } from "./process";
import { secondsFromNow } from "../../utils/time";
import type { Grid } from "honeycomb-grid";
import type { TerrainHex } from "../hexgrid";
import type { BattleUserState, ReturnedUserState } from "./types";
import type { CombatAction, ZodAllTags } from "./types";
import type { GroundEffect, UserEffect } from "./types";
import { RobPreventTag, RobTag } from "./types";
import { calcPoolCost } from "./util";

/**
 * Given a user, return a list of actions that the user can perform
 */
export const availableUserActions = (
  usersState: ReturnedUserState[] | undefined,
  userId: string | undefined
): CombatAction[] => {
  const user = usersState?.find((u) => u.userId === userId);
  return [
    {
      id: "wait",
      name: "Wait",
      image: "/combat/basicActions/stamina.png",
      battleDescription: "%user stands and does nothing.",
      type: "basic" as const,
      target: AttackTarget.SELF,
      method: AttackMethod.SINGLE,
      healthCostPerc: 0,
      chakraCostPerc: 0,
      staminaCostPerc: 0,
      actionCostPerc: 0,
      range: 0,
      effects: [],
      hidden: true,
    },
    {
      id: "sp",
      name: "Basic Attack",
      image: "/combat/basicActions/stamina.png",
      battleDescription: "%user perform a basic physical strike against %target",
      type: "basic" as const,
      target: AttackTarget.OTHER_USER,
      method: AttackMethod.SINGLE,
      healthCostPerc: 0,
      chakraCostPerc: 0,
      staminaCostPerc: 10,
      actionCostPerc: 50,
      range: 1,
      level: user?.level,
      effects: [
        DamageTag.parse({
          power: 1,
          powerPerLevel: 0.1,
          statTypes: ["Taijutsu", "Bukijutsu"],
          generalTypes: ["Strength", "Speed"],
          rounds: 0,
          appearAnimation: "hit",
        }),
        // RobTag.parse({
        //   power: 1,
        //   powerPerLevel: 0.1,
        //   statTypes: ["Taijutsu", "Bukijutsu"],
        //   generalTypes: ["Strength", "Speed"],
        //   rounds: 0,
        //   appearAnimation: "hit",
        // }),
      ],
    },
    {
      id: "cp",
      name: "Basic Heal",
      image: "/combat/basicActions/heal.png",
      battleDescription: "%user perform basic healing of %target",
      type: "basic" as const,
      target: AttackTarget.OTHER_USER,
      method: AttackMethod.SINGLE,
      healthCostPerc: 0,
      chakraCostPerc: 1,
      staminaCostPerc: 0,
      actionCostPerc: 50,
      range: 1,
      level: user?.level,
      effects: [
        RobPreventTag.parse({
          power: 100,
          calculation: "static",
          rounds: 10,
        }),
        // HealTag.parse({
        //   power: 5,
        //   powerPerLevel: 1,
        //   calculation: "static",
        //   statTypes: ["Ninjutsu", "Genjutsu"],
        //   generalTypes: ["Willpower", "Intelligence"],
        //   rounds: 0,
        //   appearAnimation: "heal",
        // }),
      ],
    },
    {
      id: "move",
      name: "Move",
      image: "/combat/basicActions/move.png",
      battleDescription: "%user moves to %location",
      type: "basic" as const,
      target: AttackTarget.GROUND,
      method: AttackMethod.SINGLE,
      range: 1,
      healthCostPerc: 0,
      chakraCostPerc: 0,
      staminaCostPerc: 0,
      actionCostPerc: 50,
      effects: [MoveTag.parse({ power: 100 })],
    },
    {
      id: "flee",
      name: "Flee",
      image: "/combat/basicActions/flee.png",
      battleDescription: "%user attempts to flee the battle",
      type: "basic" as const,
      target: AttackTarget.SELF,
      method: AttackMethod.SINGLE,
      range: 0,
      healthCostPerc: 0.1,
      chakraCostPerc: 0,
      staminaCostPerc: 0,
      actionCostPerc: 100,
      effects: [FleeTag.parse({ power: 100, rounds: 0 })],
    },
    ...(user?.jutsus
      ? user.jutsus.map((userjutsu) => {
          return {
            id: userjutsu.jutsu.id,
            name: userjutsu.jutsu.name,
            image: userjutsu.jutsu.image,
            battleDescription: userjutsu.jutsu.battleDescription,
            type: "jutsu" as const,
            target: userjutsu.jutsu.target,
            method: userjutsu.jutsu.method,
            range: userjutsu.jutsu.range,
            healthCostPerc: userjutsu.jutsu.healthCostPerc,
            chakraCostPerc: userjutsu.jutsu.chakraCostPerc,
            staminaCostPerc: userjutsu.jutsu.staminaCostPerc,
            actionCostPerc: userjutsu.jutsu.actionCostPerc,
            effects: userjutsu.jutsu.effects as unknown as ZodAllTags[],
            level: userjutsu.level,
            data: userjutsu.jutsu,
          };
        })
      : []),
    ...(user?.items
      ? user.items.map((useritem) => {
          return {
            id: useritem.item.id,
            name: useritem.item.name,
            image: useritem.item.image,
            battleDescription: useritem.item.battleDescription,
            type: "item" as const,
            target: useritem.item.target,
            method: useritem.item.method,
            range: useritem.item.range,
            level: user?.level,
            healthCostPerc: useritem.item.healthCostPerc,
            chakraCostPerc: useritem.item.chakraCostPerc,
            staminaCostPerc: useritem.item.staminaCostPerc,
            actionCostPerc: useritem.item.actionCostPerc,
            effects: useritem.item.effects as unknown as ZodAllTags[],
            quantity: useritem.quantity,
            data: useritem.item,
          };
        })
      : []),
  ];
};

export const performAction = (info: {
  usersState: BattleUserState[];
  usersEffects: UserEffect[];
  groundEffects: GroundEffect[];
  grid: Grid<TerrainHex>;
  action: CombatAction;
  userId: string;
  longitude: number;
  latitude: number;
}) => {
  // Destruct
  const { grid, action, userId, longitude, latitude } = info;
  const { usersState, usersEffects, groundEffects } = info;

  // New state variables
  const postActionUsersEffects = [...usersEffects];
  const postActionGroundEffects = [...groundEffects];

  // Convenience
  usersState.map((u) => (u.hex = grid.getHex({ col: u.longitude, row: u.latitude })));
  const alive = usersState.filter((u) => u.cur_health > 0);
  const user = alive.find((u) => u.userId === userId);
  const targetTile = grid.getHex({ col: longitude, row: latitude });

  // Check for stun effects
  const stunned = usersEffects.find((e) => e.type === "stun" && e.targetId === userId);
  if (stunned && isEffectStillActive(stunned)) {
    throw new Error("User is stunned");
  }

  // Check if the user can perform the action
  if (user?.hex && targetTile) {
    // Check pools cost
    const { hpCost, cpCost, spCost } = calcPoolCost(action, usersEffects, user);
    if (user.cur_health < hpCost) throw new Error("Not enough health");
    if (user.cur_chakra < cpCost) throw new Error("Not enough chakra");
    if (user.cur_stamina < spCost) throw new Error("Not enough stamina");

    // Village ID
    const villageId = user.villageId;
    // How much time passed since last action
    const newSeconds = actionSecondsAfterAction(user, action);
    if (newSeconds < 0) {
      return { check: false, postActionUsersEffects, postActionGroundEffects };
    }
    // Given this action, get the affected tiles
    const { green: affectedTiles } = getAffectedTiles({
      a: user.hex,
      b: targetTile,
      action,
      grid: grid,
      users: alive,
      ground: groundEffects,
      userId,
    });
    // Bookkeeping
    const targetUsernames: string[] = [];
    const targetGenders: string[] = [];
    // For each affected tile, apply the effects
    affectedTiles.forEach((tile) => {
      if (
        action.target === AttackTarget.GROUND ||
        action.target === AttackTarget.EMPTY_GROUND
      ) {
        // ADD GROUND EFFECTS
        action.effects.forEach((tag) => {
          const effect = realizeTag(tag as GroundEffect, user, action.level, true);
          if (effect) {
            effect.longitude = tile.col;
            effect.latitude = tile.row;
            postActionGroundEffects.push({ ...effect });
          }
        });
      } else {
        // ADD USER EFFECTS
        type TargetType = { userId: string; username: string; gender: string };
        let target: TargetType | undefined = undefined;
        if (action.target === AttackTarget.SELF) {
          target = alive.find((u) => u.userId === user.userId && u.hex === tile);
        } else if (action.target === AttackTarget.OPPONENT) {
          target = alive.find((u) => u.villageId !== villageId && u.hex === tile);
        } else if (action.target === AttackTarget.ALLY) {
          target = alive.find((u) => u.villageId === villageId && u.hex === tile);
        } else if (action.target === AttackTarget.OTHER_USER) {
          target = alive.find((u) => u.userId !== userId && u.hex === tile);
        } else if (action.target === AttackTarget.CHARACTER) {
          target = alive.find((u) => u.hex === tile);
        }
        // Apply effects
        if (target) {
          targetUsernames.push(target.username);
          targetGenders.push(target.gender);
          action.effects.forEach((tag) => {
            if (target) {
              const effect = realizeTag(tag as UserEffect, user, action.level);
              if (effect) {
                effect.targetId = target.userId;
                postActionUsersEffects.push(effect);
              }
            }
          });
        }
        // Special case; attacking barrier, add damage tag as ground effect,
        // which will resolve against the barrier when applied
        if (!target) {
          const barrier = postActionGroundEffects.find(
            (e) =>
              e.longitude === tile.col &&
              e.latitude === tile.row &&
              e.type === "barrier"
          );
          if (barrier) {
            action.effects.forEach((tag) => {
              if (tag.type === "damage") {
                const effect = realizeTag(tag as UserEffect, user, action.level);
                if (effect) {
                  targetUsernames.push("barrier");
                  targetGenders.push("it");
                  effect.targetType = "barrier";
                  effect.targetId = barrier.id;
                  postActionUsersEffects.push(effect);
                }
              }
            });
            target = { userId: barrier.id, username: "barrier", gender: "it" };
          }
        }
      }
    });
    // Update pools & action timer based on action
    if (affectedTiles.size > 0) {
      user.cur_chakra -= cpCost;
      user.cur_chakra = Math.max(0, user.cur_chakra);
      user.cur_stamina -= spCost;
      user.cur_stamina = Math.max(0, user.cur_stamina);
      user.cur_health -= hpCost;
      user.cur_health = Math.max(0, user.cur_health);
      user.updatedAt = secondsFromNow(-newSeconds);
      // Update user descriptions
      action.battleDescription = action.battleDescription.replaceAll(
        "%user_subject",
        user.gender === "Male" ? "he" : "she"
      );
      action.battleDescription = action.battleDescription.replaceAll(
        "%user_object",
        user.gender === "Male" ? "him" : "her"
      );
      action.battleDescription = action.battleDescription.replaceAll(
        "%user_posessive",
        user.gender === "Male" ? "his" : "hers"
      );
      action.battleDescription = action.battleDescription.replaceAll(
        "%user_reflexive",
        user.gender === "Male" ? "himself" : "herself"
      );
      action.battleDescription = action.battleDescription.replaceAll(
        "%user",
        user.username
      );
      // Update generic descriptions
      action.battleDescription = action.battleDescription.replaceAll(
        "%location",
        `[${targetTile.row}, ${targetTile.col}]`
      );
      // Update target descriptions
      if (targetGenders.length > 0) {
        action.battleDescription = action.battleDescription.replaceAll(
          "%target_subject",
          targetGenders.length === 1 && targetGenders[0]
            ? targetGenders[0] == "Male"
              ? "himself"
              : "herself"
            : "they"
        );
        action.battleDescription = action.battleDescription.replaceAll(
          "%target_object",
          targetGenders.length === 1 && targetGenders[0]
            ? targetGenders[0] == "Male"
              ? "him"
              : "her"
            : "them"
        );
        action.battleDescription = action.battleDescription.replaceAll(
          "%target_posessive",
          targetGenders.length === 1 && targetGenders[0]
            ? targetGenders[0] == "Male"
              ? "his"
              : "hers"
            : "theirs"
        );
        action.battleDescription = action.battleDescription.replaceAll(
          "%target_reflexive",
          targetGenders.length === 1 && targetGenders[0]
            ? targetGenders[0] == "Male"
              ? "himself"
              : "herself"
            : "themselves"
        );
      }
      if (targetUsernames.length > 0) {
        action.battleDescription = action.battleDescription.replaceAll(
          "%target",
          targetUsernames.join(", ")
        );
      }
      // Successful action
      return { check: true, postActionUsersEffects, postActionGroundEffects };
    }
  }
  return { check: false, postActionUsersEffects, postActionGroundEffects };
};
