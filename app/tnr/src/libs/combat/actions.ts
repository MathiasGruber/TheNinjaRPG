import { AttackTarget, AttackMethod } from "@prisma/client";
import { serverError } from "../../server/api/trpc";
import type { Grid } from "honeycomb-grid";
import type { TerrainHex } from "../travel/types";
import type { Battle } from "@prisma/client";
import type { ReturnedUserState, CombatAction, ZodAllTags } from "./types";
import type { GroundEffect, UserEffect } from "./types";
import { MoveTag, DamageTag, FleeTag } from "./types";
import { getAffectedTiles } from "./movement";
import { realizeUserTag, realizeGroundTag } from "./tags";

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
            effects: useritem.item.effects as ZodAllTags[],
            quantity: useritem.quantity,
            data: useritem.item,
          };
        })
      : []),
  ];
};

export const performAction = (info: {
  battle: Battle;
  grid: Grid<TerrainHex>;
  action: CombatAction;
  userId: string;
  longitude: number;
  latitude: number;
}) => {
  // Destruct
  const { battle, grid, action, userId, longitude, latitude } = info;
  // Battle data
  const users = battle.usersState as unknown as ReturnedUserState[];
  const usersEffects = battle.usersEffects as unknown as UserEffect[];
  const groundEffects = battle.groundEffects as unknown as GroundEffect[];
  // Convenience
  users.map((u) => (u.hex = grid.getHex({ col: u.longitude, row: u.latitude })));
  const user = users.find((u) => u.userId === userId);
  const targetTile = grid.getHex({ col: longitude, row: latitude });
  // TODO: Check if user is stunned + other prevent action conditions
  // Check if the user can perform the action
  if (user?.hex && targetTile) {
    // Given this action, get the affected tiles
    const { green: affectedTiles } = getAffectedTiles({
      a: user.hex,
      b: targetTile,
      action,
      grid: grid,
      users,
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
          target = users.find((u) => u.userId === userId && u.hex === tile);
        } else if (action.target === AttackTarget.OPPONENT) {
          target = users.find((u) => u.userId !== userId && u.hex === tile);
        } else if (action.target === AttackTarget.CHARACTER) {
          target = users.find((u) => u.hex === tile);
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
  }
  // Return the updates effects arrays
  return { usersEffects, groundEffects };
};
