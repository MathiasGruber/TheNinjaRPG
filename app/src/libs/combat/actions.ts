import { MoveTag, DamageTag, FleeTag, HealTag } from "./types";
import { getAffectedTiles } from "./movement";
import { COMBAT_SECONDS } from "./constants";
import { realizeTag, checkFriendlyFire } from "./process";
import { applyEffects } from "./process";
import { calcPoolCost } from "./util";
import { hasNoAvailableActions } from "./util";
import { isEffectActive } from "./util";
import { updateStatUsage } from "./tags";
import { getPossibleActionTiles } from "../hexgrid";
import type { AttackTargets } from "../../../drizzle/constants";
import type { BattleUserState, ReturnedUserState } from "./types";
import type { CompleteBattle, ReturnedBattle } from "./types";
import type { Grid } from "honeycomb-grid";
import type { TerrainHex } from "../hexgrid";
import type { CombatAction, ZodAllTags } from "./types";
import type { GroundEffect, UserEffect } from "./types";

/**
 * Given a user, return a list of actions that the user can perform
 */
export const availableUserActions = (
  battle: ReturnedBattle | undefined | null,
  userId: string | undefined,
  basicMoves = true
): CombatAction[] => {
  const usersState = battle?.usersState;
  const user = usersState?.find((u) => u.userId === userId);
  const actionPoints =
    battle && user && (isInNewRound(user, battle) ? 100 : user.actionPoints);
  return [
    ...(basicMoves
      ? [
          {
            id: "sp",
            name: "Basic Attack",
            image: "/combat/basicActions/stamina.webp",
            battleDescription: "%user perform a basic physical strike against %target",
            type: "basic" as const,
            target: "OTHER_USER" as const,
            method: "SINGLE" as const,
            healthCostPerc: 0,
            chakraCostPerc: 0,
            staminaCostPerc: 10,
            actionCostPerc: 60,
            range: 1,
            updatedAt: Date.now(),
            cooldown: 0,
            level: user?.level,
            effects: [
              DamageTag.parse({
                power: 1,
                powerPerLevel: 0.1,
                statTypes: [],
                generalTypes: ["Strength"],
                rounds: 0,
                appearAnimation: "hit",
              }),
            ],
          },
          {
            id: "cp",
            name: "Basic Heal",
            image: "/combat/basicActions/heal.webp",
            battleDescription: "%user perform basic healing of %target",
            type: "basic" as const,
            target: "CHARACTER" as const,
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
                powerPerLevel: 0.1,
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
      id: "move",
      name: "Move",
      image: "/combat/basicActions/move.webp",
      battleDescription: "%user moves on the battlefield",
      type: "basic" as const,
      target: "EMPTY_GROUND" as const,
      method: "SINGLE" as const,
      range: 1,
      updatedAt: Date.now(),
      cooldown: 0,
      healthCostPerc: 0,
      chakraCostPerc: 0,
      staminaCostPerc: 0,
      actionCostPerc: 30,
      effects: [MoveTag.parse({ power: 100 })],
    },
    ...(basicMoves
      ? [
          {
            id: "flee",
            name: "Flee",
            image: "/combat/basicActions/flee.webp",
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
            effects: [FleeTag.parse({ power: 20, rounds: 0 })],
          },
        ]
      : []),
    ...(actionPoints && actionPoints > 0
      ? [
          {
            id: "wait",
            name: "End Turn",
            image: "/combat/basicActions/wait.webp",
            battleDescription: "%user stands and does nothing",
            type: "basic" as const,
            target: "SELF" as const,
            method: "SINGLE" as const,
            healthCostPerc: 0,
            chakraCostPerc: 0,
            staminaCostPerc: 0,
            actionCostPerc: actionPoints,
            range: 0,
            updatedAt: Date.now(),
            cooldown: 0,
            effects: [],
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
  battle: CompleteBattle;
  grid: Grid<TerrainHex>;
  action: CombatAction;
  actorId: string;
  longitude: number;
  latitude: number;
}) => {
  // Destruct
  const { battle, grid, action, actorId, longitude, latitude } = info;
  const { usersState, usersEffects, groundEffects } = battle;

  // Convenience
  usersState.map((u) => (u.hex = grid.getHex({ col: u.longitude, row: u.latitude })));
  const alive = usersState.filter((u) => u.curHealth > 0);
  const user = alive.find((u) => u.userId === actorId);
  const targetTile = grid.getHex({ col: longitude, row: latitude });

  // Can only perform action if battle started
  if (battle.createdAt.getTime() > Date.now()) {
    throw new Error("Battle has not started yet");
  }

  // Check for stun effects
  const stunned = usersEffects.find((e) => e.type === "stun" && e.targetId === actorId);
  if (stunned && isEffectActive(stunned)) {
    throw new Error("User is stunned");
  }

  // Check if the user can perform the action
  if (user?.hex && targetTile) {
    // Check pools cost
    const { hpCost, cpCost, spCost } = calcPoolCost(action, usersEffects, user);
    if (user.curHealth < hpCost) throw new Error("Not enough health");
    if (user.curChakra < cpCost) throw new Error("Not enough chakra");
    if (user.curStamina < spCost) throw new Error("Not enough stamina");
    // How much time passed since last action
    const newPoints = actionPointsAfterAction(user, battle, action);
    if (newPoints < 0) return false;
    // Get the possible action squares
    const highlights = getPossibleActionTiles(action, user.hex, grid);
    // Given this action, get the affected tiles
    const { green: affectedTiles } = getAffectedTiles({
      a: user.hex,
      b: targetTile,
      action,
      grid: grid,
      restrictGrid: highlights,
      users: alive,
      ground: groundEffects,
      userId: actorId,
    });
    // Bookkeeping
    let targetUsernames: string[] = [];
    let targetGenders: string[] = [];

    // For each affected tile, apply the effects
    affectedTiles.forEach((tile) => {
      // ADD USER EFFECTS
      if (action.target === "GROUND" || action.target === "EMPTY_GROUND") {
        // ADD GROUND EFFECTS
        const target = getTargetUser(alive, "CHARACTER", tile, user.userId);
        action.effects.forEach((tag) => {
          if (!tag.target || tag.target === "INHERIT") {
            const effect = realizeTag(
              tag as GroundEffect,
              user,
              action.level,
              battle.round
            );
            if (effect) {
              effect.longitude = tile.col;
              effect.latitude = tile.row;
              groundEffects.push({ ...effect });
              if (
                target &&
                effect.type !== "move" &&
                checkFriendlyFire(effect, target, alive)
              ) {
                targetUsernames.push(target.username);
                targetGenders.push(target.gender);
              }
            }
          }
        });
      } else {
        // Apply effects
        const target = getTargetUser(alive, action.target, tile, user.userId);
        action.effects.forEach((tag) => {
          const effect = realizeTag(
            tag as UserEffect,
            user,
            action.level,
            battle.round
          );
          if (effect) {
            effect.longitude = tile.col;
            effect.latitude = tile.row;
            if (target && (!tag.target || tag.target === "INHERIT")) {
              // Apply UserEffect to target
              if (checkFriendlyFire(effect, target, alive)) {
                targetUsernames.push(target.username);
                targetGenders.push(target.gender);
                effect.targetId = target.userId;
                usersEffects.push(effect);
              }
            } else if (tag.target === "SELF") {
              // Overwrite: apply UserEffect to self
              if (checkFriendlyFire(effect, user, alive)) {
                effect.targetId = user.userId;
                usersEffects.push(effect);
              }
            } else if (!target && tag.type === "damage") {
              // Extra: If no target, check if there is a barrier & apply damage only
              const barrier = groundEffects.find(
                (e) =>
                  e.longitude === tile.col &&
                  e.latitude === tile.row &&
                  e.type === "barrier"
              );
              if (barrier) {
                targetUsernames.push("barrier");
                targetGenders.push("it");
                effect.targetType = "barrier";
                effect.targetId = barrier.id;
                usersEffects.push(effect);
              }
            }
          }
        });
      }
    });
    // Get uniques only
    targetUsernames = [...new Set(targetUsernames)];
    targetGenders = [...new Set(targetGenders)];
    // Update local battle history in terms of usage of action, effects, etc.
    action.effects.forEach((effect) => {
      updateStatUsage(user, effect as UserEffect);
    });
    user.usedActions.push({ id: action.id, type: action.type });
    // Update pools & action timer based on action
    if (affectedTiles.size > 0) {
      user.curChakra -= cpCost;
      user.curChakra = Math.max(0, user.curChakra);
      user.curStamina -= spCost;
      user.curStamina = Math.max(0, user.curStamina);
      user.curHealth -= hpCost;
      user.curHealth = Math.max(0, user.curHealth);
      user.updatedAt = new Date();
      user.actionPoints = newPoints;
      // Update user descriptions
      if (action.battleDescription === "") {
        action.battleDescription = `%user uses ${action.name}`;
      }
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

export const getTargetUser = (
  users: BattleUserState[],
  target: typeof AttackTargets[number],
  tile: TerrainHex,
  userId: string
) => {
  let result: BattleUserState | undefined = undefined;
  const user = users.find((u) => u.userId === userId);
  if (user) {
    if (target === "SELF") {
      result = users.find((u) => u.userId === user.userId && u.hex === tile);
    } else if (target === "OPPONENT") {
      result = users.find((u) => u.villageId !== user.villageId && u.hex === tile);
    } else if (target === "ALLY") {
      result = users.find((u) => u.villageId === user.villageId && u.hex === tile);
    } else if (target === "OTHER_USER") {
      result = users.find((u) => u.userId !== user.userId && u.hex === tile);
    } else if (target === "CHARACTER") {
      result = users.find((u) => u.hex === tile);
    }
  }
  return result;
};

export const performBattleAction = (props: {
  battle: CompleteBattle;
  action: CombatAction;
  grid: Grid<TerrainHex>;
  contextUserId: string;
  actorId: string;
  longitude: number;
  latitude: number;
}) => {
  // Destructure
  const { battle, grid, action, contextUserId, actorId, longitude, latitude } = props;
  // Ensure that the userId we're trying to move is valid
  const user = battle.usersState.find((u) => u.userId === actorId);
  if (!user) throw new Error("This is not your user");

  // Check if actor is stunned
  const isStunned = calcIsStunned(battle, actorId);
  if (isStunned) {
    user.actionPoints = 0;
    action.battleDescription = `${user.username} is stunned and cannot move.`;
  } else {
    // Perform action, get latest status effects
    // Note: this mutates usersEffects, groundEffects in place
    const check = insertAction({ battle, grid, action, actorId, longitude, latitude });
    if (!check) throw new Error(`Action no longer possible for ${user.username}`);

    // Update the action updatedAt state, so as keep state for technique cooldowns
    if (action.cooldown && action.cooldown > 0) {
      const jutsu = user.jutsus.find((j) => j.jutsu.id === action.id);
      if (jutsu) jutsu.updatedAt = battle.roundStartAt;
      const item = user.items.find((i) => i.item.id === action.id);
      if (item) item.updatedAt = battle.roundStartAt;
    }
  }

  // Apply relevant effects, and get back new state + active effects
  const { newBattle, actionEffects } = applyEffects(battle, actorId);

  return { newBattle, actionEffects };
};

export const isInNewRound = (
  user: { updatedAt: string | Date; actionPoints: number },
  battle: ReturnedBattle,
  timeDiff = 0
) => {
  // Did we pass to next round?
  const syncedTime = Date.now() - timeDiff;
  const mseconds = syncedTime - new Date(battle.roundStartAt).getTime();
  const secondsLeft = Math.floor(COMBAT_SECONDS - mseconds / 1000);
  // Return true if user is in new round
  return secondsLeft < 0;
};

/**
 * Calculate how many action points the user has left after performing an action
 */
export const actionPointsAfterAction = (
  user: { updatedAt: string | Date; actionPoints: number },
  battle: ReturnedBattle,
  action: CombatAction,
  timeDiff = 0
) => {
  if (isInNewRound(user, battle, timeDiff)) {
    return 100 - action.actionCostPerc;
  } else {
    return user.actionPoints - action.actionCostPerc;
  }
};

/**
 * Figure out if user is still live and well in battle (not fled, not dead, etc.)
 // TODO: Use this across the site
 */
export const stillInBattle = (user: ReturnedUserState) => {
  return user.curHealth > 0 && !user.fledBattle;
};

/**
 * Calculate (based on current time), which user is currently the one to perform a move
 */
export const calcActiveUser = (
  battle: ReturnedBattle,
  userId?: string | null,
  timeDiff: number = 0
) => {
  const syncedTime = Date.now() - timeDiff;
  const mseconds = syncedTime - new Date(battle.roundStartAt).getTime();
  const secondsLeft = COMBAT_SECONDS - mseconds / 1000;
  const userIds = battle.usersState.filter(stillInBattle).map((u) => u.userId);
  let activeUserId = battle.activeUserId ? battle.activeUserId : userId;
  let progressRound = false;
  // Check 1: We have an active user, but the round is up
  const check1 = battle.activeUserId && secondsLeft <= 0;
  // Check 2: We have an active user, but he/she does not have any more action points
  const check2 = activeUserId && hasNoAvailableActions(battle, activeUserId);
  // Check 3: Current active userID is not in active user array
  const check3 = activeUserId && !userIds.includes(activeUserId);
  // Progress to next user in case of any checks went through
  if (check1 || check2 || check3) {
    const curIdx = userIds.indexOf(activeUserId ?? "");
    const newIdx = (curIdx + 1) % userIds.length;
    activeUserId = userIds[newIdx] || userId;
    progressRound = true;
  }
  // Find the user in question, and return him
  const actor = battle.usersState.find((u) => u.userId === activeUserId);
  if (!actor) throw new Error("No active user");
  return { actor, progressRound, mseconds, secondsLeft };
};
