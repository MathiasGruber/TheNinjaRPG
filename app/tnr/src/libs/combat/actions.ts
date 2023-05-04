import { AttackTarget, AttackMethod } from "@prisma/client";
import type { Grid } from "honeycomb-grid";
import type { TerrainHex } from "../travel/types";
import { COMBAT_SECONDS } from "./constants";
import type { ReturnedUserState, CombatAction, ZodAllTags } from "./types";
import type { GroundEffect, UserEffect } from "./types";
import { MoveTag, DamageTag, FleeTag } from "./types";
import { getAffectedTiles, actionSecondsAfterAction } from "./movement";
import { realizeUserTag, realizeGroundTag } from "./tags";
import { secondsFromNow, secondsPassed } from "../../utils/time";

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
      id: "sp",
      name: "Stamina Attack",
      image: "/combat/basicActions/stamina.png",
      type: "basic" as const,
      target: AttackTarget.OPPONENT,
      method: AttackMethod.SINGLE,
      healthCostPerc: 0,
      chakraCostPerc: 0,
      staminaCostPerc: 0.01,
      actionCostPerc: 0.9,
      range: 1,
      effects: [
        DamageTag.parse({
          power: 1,
          statTypes: ["Taijutsu", "Bukijutsu"],
          generalTypes: ["Strength", "Speed"],
        }),
      ],
    },
    {
      id: "cp",
      name: "Chakra Attack",
      image: "/combat/basicActions/chakra.png",
      type: "basic" as const,
      target: AttackTarget.OPPONENT,
      method: AttackMethod.SINGLE,
      range: 1,
      healthCostPerc: 0,
      chakraCostPerc: 0.01,
      staminaCostPerc: 0,
      actionCostPerc: 0.5,
      effects: [
        DamageTag.parse({
          power: 1,
          statTypes: ["Ninjutsu", "Genjutsu"],
          generalTypes: ["Willpower", "Intelligence"],
        }),
      ],
    },
    {
      id: "move",
      name: "Move",
      image: "/combat/basicActions/move.png",
      type: "basic" as const,
      target: AttackTarget.GROUND,
      method: AttackMethod.SINGLE,
      range: 1,
      healthCostPerc: 0,
      chakraCostPerc: 0,
      staminaCostPerc: 0,
      actionCostPerc: 0.5,
      effects: [MoveTag.parse({ chance: 100 })],
    },
    {
      id: "flee",
      name: "Flee",
      image: "/combat/basicActions/flee.png",
      type: "basic" as const,
      target: AttackTarget.SELF,
      method: AttackMethod.SINGLE,
      range: 0,
      healthCostPerc: 0.1,
      chakraCostPerc: 0,
      staminaCostPerc: 0,
      actionCostPerc: 0.5,
      effects: [FleeTag.parse({ chance: 20 })],
    },
    ...(user?.jutsus
      ? user.jutsus.map((userjutsu) => {
          return {
            id: userjutsu.jutsu.id,
            name: userjutsu.jutsu.name,
            image: userjutsu.jutsu.image,
            type: "jutsu" as const,
            target: userjutsu.jutsu.target,
            method: userjutsu.jutsu.method,
            range: userjutsu.jutsu.range,
            healthCostPerc: userjutsu.jutsu.healthCostPerc,
            chakraCostPerc: userjutsu.jutsu.chakraCostPerc,
            staminaCostPerc: userjutsu.jutsu.staminaCostPerc,
            actionCostPerc: userjutsu.jutsu.actionCostPerc,
            effects: userjutsu.jutsu.effects as ZodAllTags[],
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
            type: "item" as const,
            target: useritem.item.target,
            method: useritem.item.method,
            range: useritem.item.range,
            healthCostPerc: useritem.item.healthCostPerc,
            chakraCostPerc: useritem.item.chakraCostPerc,
            staminaCostPerc: useritem.item.staminaCostPerc,
            actionCostPerc: useritem.item.actionCostPerc,
            effects: useritem.item.effects as ZodAllTags[],
            quantity: useritem.quantity,
            data: useritem.item,
          };
        })
      : []),
  ];
};

export const performAction = (info: {
  usersState: ReturnedUserState[];
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

  // Convenience
  usersState.map((u) => (u.hex = grid.getHex({ col: u.longitude, row: u.latitude })));
  const user = usersState.find((u) => u.userId === userId);
  const targetTile = grid.getHex({ col: longitude, row: latitude });

  // TODO: Check if user is stunned + other prevent action conditions
  // Check if the user can perform the action
  if (user?.hex && targetTile) {
    // How much time passed since last action
    const newSeconds = actionSecondsAfterAction(user, action);
    if (newSeconds < 0) {
      return false;
    }
    // Given this action, get the affected tiles
    const { green: affectedTiles } = getAffectedTiles({
      a: user.hex,
      b: targetTile,
      action,
      grid: grid,
      users: usersState,
      userId,
    });
    // For each affected tile, apply the effects
    affectedTiles.forEach((tile) => {
      if (action.target === AttackTarget.GROUND) {
        // ADD GROUND EFFECTS
        action.effects.forEach((tag) => {
          const effect = realizeGroundTag(tag as GroundEffect, user);
          effect.creatorId = user.userId;
          effect.longitude = longitude;
          effect.latitude = latitude;
          effect.lastUpdate = Date.now();
          if (effect) groundEffects.push(effect);
        });
      } else {
        // ADD USER EFFECTS
        let target: ReturnedUserState | undefined = undefined;
        if (action.target === AttackTarget.SELF) {
          target = usersState.find((u) => u.userId === userId && u.hex === tile);
        } else if (action.target === AttackTarget.OPPONENT) {
          target = usersState.find((u) => u.userId !== userId && u.hex === tile);
        } else if (action.target === AttackTarget.CHARACTER) {
          target = usersState.find((u) => u.hex === tile);
        }
        action.effects.forEach((tag) => {
          if (target) {
            const effect = realizeUserTag(tag as UserEffect, user);
            effect.creatorId = user.userId;
            effect.targetId = target.userId;
            effect.lastUpdate = Date.now();
            if (effect) usersEffects.push(effect);
          }
        });
      }
    });
    // Update pools & action timer based on action
    if (affectedTiles.size > 0) {
      if (user.cur_chakra && user.max_chakra) {
        user.cur_chakra -= action.chakraCostPerc * user.max_chakra;
      }
      if (user.cur_stamina && user.max_stamina) {
        user.cur_stamina -= action.staminaCostPerc * user.max_stamina;
      }
      if (user.cur_health && user.max_health) {
        user.cur_health -= action.healthCostPerc * user.max_health;
      }
      user.updatedAt = secondsFromNow(-newSeconds);
      return true;
    }
  }
  return false;
};
