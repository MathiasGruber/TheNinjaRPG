import { MoveTag, DamageTag, FleeTag, HealTag } from "./types";
import { isEffectStillActive } from "./util";
import { getAffectedTiles, actionSecondsAfterAction } from "./movement";
import { realizeTag } from "./process";
import { secondsFromNow } from "../../utils/time";
import { applyEffects } from "./process";
import { calcPoolCost } from "./util";
import { updateStatUsage } from "./tags";
import type { Grid } from "honeycomb-grid";
import type { TerrainHex } from "../hexgrid";
import type { BattleUserState, ReturnedUserState } from "./types";
import type { CombatAction, ZodAllTags } from "./types";
import type { GroundEffect, UserEffect } from "./types";

/**
 * Given a user, return a list of actions that the user can perform
 */
export const availableUserActions = (
  usersState: ReturnedUserState[] | undefined,
  userId: string | undefined,
  basicMoves = true
): CombatAction[] => {
  const user = usersState?.find((u) => u.userId === userId);
  return [
    ...(basicMoves
      ? [
          {
            id: "sp",
            name: "Basic Attack",
            image: "/combat/basicActions/stamina.png",
            battleDescription: "%user perform a basic physical strike against %target",
            type: "basic" as const,
            target: "OTHER_USER" as const,
            method: "SINGLE" as const,
            healthCostPerc: 0,
            chakraCostPerc: 0,
            staminaCostPerc: 10,
            actionCostPerc: 50,
            range: 1,
            updatedAt: Date.now(),
            cooldown: 0,
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
            ],
          },
          {
            id: "cp",
            name: "Basic Heal",
            image: "/combat/basicActions/heal.png",
            battleDescription: "%user perform basic healing of %target",
            type: "basic" as const,
            target: "OTHER_USER" as const,
            method: "SINGLE" as const,
            healthCostPerc: 0,
            chakraCostPerc: 1,
            staminaCostPerc: 0,
            actionCostPerc: 50,
            range: 1,
            updatedAt: Date.now(),
            cooldown: 0,
            level: user?.level,
            effects: [
              HealTag.parse({
                power: 5,
                powerPerLevel: 1,
                calculation: "static",
                statTypes: ["Ninjutsu", "Genjutsu"],
                generalTypes: ["Willpower", "Intelligence"],
                rounds: 0,
                appearAnimation: "heal",
              }),
            ],
          },
        ]
      : []),
    {
      id: "wait",
      name: "Wait",
      image: "/combat/basicActions/stamina.png",
      battleDescription: "%user stands and does nothing.",
      type: "basic" as const,
      target: "SELF" as const,
      method: "SINGLE" as const,
      healthCostPerc: 0,
      chakraCostPerc: 0,
      staminaCostPerc: 0,
      actionCostPerc: 0,
      range: 0,
      updatedAt: Date.now(),
      cooldown: 0,
      effects: [],
      hidden: true,
    },
    {
      id: "move",
      name: "Move",
      image: "/combat/basicActions/move.png",
      battleDescription: "%user moves to %location",
      type: "basic" as const,
      target: "GROUND" as const,
      method: "SINGLE" as const,
      range: 1,
      updatedAt: Date.now(),
      cooldown: 0,
      healthCostPerc: 0,
      chakraCostPerc: 0,
      staminaCostPerc: 0,
      actionCostPerc: 50,
      effects: [MoveTag.parse({ power: 100 })],
    },
    ...(basicMoves
      ? [
          {
            id: "flee",
            name: "Flee",
            image: "/combat/basicActions/flee.png",
            battleDescription: "%user attempts to flee the battle",
            type: "basic" as const,
            target: "SELF" as const,
            method: "SINGLE" as const,
            range: 0,
            updatedAt: Date.now(),
            cooldown: 0,
            healthCostPerc: 0.1,
            chakraCostPerc: 0,
            staminaCostPerc: 0,
            actionCostPerc: 100,
            effects: [FleeTag.parse({ power: 100, rounds: 0 })],
          },
        ]
      : []),
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
            updatedAt: new Date(userjutsu.updatedAt).getTime(),
            cooldown: userjutsu.jutsu.cooldown,
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
            battleDescription: useritem.item.battleDescription,
            type: "item" as const,
            target: useritem.item.target,
            method: useritem.item.method,
            range: useritem.item.range,
            updatedAt: new Date(useritem.updatedAt).getTime(),
            cooldown: 0,
            level: user?.level,
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

export const insertAction = (info: {
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

  // Convenience
  usersState.map((u) => (u.hex = grid.getHex({ col: u.longitude, row: u.latitude })));
  const alive = usersState.filter((u) => u.curHealth > 0);
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
    if (user.curHealth < hpCost) throw new Error("Not enough health");
    if (user.curChakra < cpCost) throw new Error("Not enough chakra");
    if (user.curStamina < spCost) throw new Error("Not enough stamina");

    // Village ID
    const villageId = user.villageId;
    // How much time passed since last action
    const newSeconds = actionSecondsAfterAction(user, action);
    if (newSeconds < 0) {
      return { check: false, usersEffects, groundEffects };
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
      if (action.target === "GROUND" || action.target === "EMPTY_GROUND") {
        // ADD GROUND EFFECTS
        action.effects.forEach((tag) => {
          const effect = realizeTag(tag as GroundEffect, user, action.level, true);
          if (effect) {
            effect.longitude = tile.col;
            effect.latitude = tile.row;
            groundEffects.push({ ...effect });
          }
        });
      } else {
        // ADD USER EFFECTS
        type TargetType = { userId: string; username: string; gender: string };
        let target: TargetType | undefined = undefined;
        if (action.target === "SELF") {
          target = alive.find((u) => u.userId === user.userId && u.hex === tile);
        } else if (action.target === "OPPONENT") {
          target = alive.find((u) => u.villageId !== villageId && u.hex === tile);
        } else if (action.target === "ALLY") {
          target = alive.find((u) => u.villageId === villageId && u.hex === tile);
        } else if (action.target === "OTHER_USER") {
          target = alive.find((u) => u.userId !== userId && u.hex === tile);
        } else if (action.target === "CHARACTER") {
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
                usersEffects.push(effect);
              }
            }
          });
        }
        // Special case; attacking barrier, add damage tag as ground effect,
        // which will resolve against the barrier when applied
        if (!target) {
          const barrier = groundEffects.find(
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
                  usersEffects.push(effect);
                }
              }
            });
            target = { userId: barrier.id, username: "barrier", gender: "it" };
          }
        }
      }
    });
    // Update local battle history in terms of usage of action, effects, etc.
    action.effects.forEach((effect) => {
      updateStatUsage(user, effect as UserEffect);
    });
    user.usedActionIDs.push(action.id);
    // Update pools & action timer based on action
    if (affectedTiles.size > 0) {
      user.curChakra -= cpCost;
      user.curChakra = Math.max(0, user.curChakra);
      user.curStamina -= spCost;
      user.curStamina = Math.max(0, user.curStamina);
      user.curHealth -= hpCost;
      user.curHealth = Math.max(0, user.curHealth);
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
      return true;
    }
  }
  return false;
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

  // Update the action updatedAt state, so as keep state for technique cooldowns
  if (action.cooldown && action.cooldown > 0) {
    const jutsu = user.jutsus.find((j) => j.jutsu.id === action.id);
    if (jutsu) jutsu.updatedAt = new Date();
    const item = user.items.find((i) => i.item.id === action.id);
    if (item) item.updatedAt = new Date();
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
