import { MoveTag, DamageTag, FleeTag, HealTag } from "@/libs/combat/types";
import { nanoid } from "nanoid";
import { getAffectedTiles } from "@/libs/combat/movement";
import { COMBAT_SECONDS } from "@/libs/combat/constants";
import { realizeTag, checkFriendlyFire } from "@/libs/combat/process";
import { applyEffects } from "@/libs/combat/process";
import { calcPoolCost } from "@/libs/combat/util";
import { hasNoAvailableActions } from "@/libs/combat/util";
import { calcIsStunned } from "@/libs/combat/util";
import { isEffectActive, getBarriersBetween } from "@/libs/combat/util";
import { updateStatUsage } from "@/libs/combat/tags";
import { getPossibleActionTiles } from "@/libs/hexgrid";
import { PathCalculator } from "@/libs/hexgrid";
import { calcCombatHealPercentage } from "@/libs/hospital/hospital";
import type { AttackTargets } from "@/drizzle/constants";
import type { BattleUserState, ReturnedUserState } from "@/libs/combat/types";
import type { CompleteBattle, ReturnedBattle } from "@/libs/combat/types";
import type { Grid } from "honeycomb-grid";
import type { TerrainHex } from "@/libs/hexgrid";
import type { CombatAction } from "@/libs/combat/types";
import type { GroundEffect, UserEffect } from "@/libs/combat/types";

/**
 * Given a user, return a list of actions that the user can perform
 */
export const availableUserActions = (
  battle: ReturnedBattle | undefined | null,
  userId: string | undefined,
  basicMoves = true,
  hideCooldowned = false,
): CombatAction[] => {
  const usersState = battle?.usersState;
  const user = usersState?.find((u) => u.userId === userId);
  const actionPoints =
    battle && user && (isInNewRound(user, battle) ? 100 : user.actionPoints);
  // Basic attack & heal
  const basicAttack: CombatAction = {
    id: "sp",
    name: "Basic Attack",
    image: "/combat/basicActions/stamina.webp",
    battleDescription: "%user perform a basic physical strike against %target",
    type: "basic" as const,
    target: "OTHER_USER" as const,
    method: "SINGLE" as const,
    healthCost: 0,
    chakraCost: 0,
    staminaCost: 10,
    actionCostPerc: 60,
    range: 1,
    updatedAt: Date.now(),
    cooldown: 0,
    level: user?.level,
    effects: [
      DamageTag.parse({
        power: 15,
        powerPerLevel: 0.1,
        statTypes: [],
        generalTypes: ["Highest"],
        rounds: 0,
        appearAnimation: "hit",
      }),
    ],
  };
  const basicHeal: CombatAction = {
    id: "cp",
    name: "Basic Heal",
    image: "/combat/basicActions/heal.webp",
    battleDescription: "%user perform basic healing of %target",
    type: "basic" as const,
    target: "CHARACTER" as const,
    method: "SINGLE" as const,
    healthCost: 0,
    chakraCost: 10,
    staminaCost: 0,
    actionCostPerc: 60,
    range: 1,
    updatedAt: Date.now(),
    cooldown: 0,
    level: user?.level,
    effects: [
      HealTag.parse({
        power: calcCombatHealPercentage(user),
        powerPerLevel: 0.0,
        calculation: "percentage",
        rounds: 0,
        appearAnimation: "heal",
      }),
    ],
  };
  const basicMove: CombatAction = {
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
    healthCost: 0,
    chakraCost: 0,
    staminaCost: 0,
    actionCostPerc: 30,
    effects: [MoveTag.parse({ power: 100 })],
  };
  const basicFlee: CombatAction = {
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
    healthCost: 0.1,
    chakraCost: 0,
    staminaCost: 0,
    actionCostPerc: 100,
    effects: [FleeTag.parse({ power: 20, rounds: 0 })],
  };
  // Concatenate all actions
  let availableActions = [
    ...(basicMoves ? [basicAttack, basicHeal] : []),
    basicMove,
    ...(basicMoves ? [basicFlee] : []),
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
            healthCost: 0,
            chakraCost: 0,
            staminaCost: 0,
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
            healthCost: Math.max(
              0,
              userjutsu.jutsu.healthCost -
                userjutsu.jutsu.healthCostReducePerLvl * userjutsu.level,
            ),
            chakraCost: Math.max(
              0,
              userjutsu.jutsu.chakraCost -
                userjutsu.jutsu.chakraCostReducePerLvl * userjutsu.level,
            ),
            staminaCost: Math.max(
              0,
              userjutsu.jutsu.staminaCost -
                userjutsu.jutsu.staminaCostReducePerLvl * userjutsu.level,
            ),
            actionCostPerc: userjutsu.jutsu.actionCostPerc,
            effects: userjutsu.jutsu.effects,
            level: userjutsu.level,
            data: userjutsu.jutsu,
          };
        })
      : []),
    ...(user?.items
      ? user.items
          .filter((useritem) => useritem.quantity > 0)
          .map((useritem) => {
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
              cooldown: useritem.item.cooldown,
              level: user?.level,
              healthCost: Math.max(
                0,
                useritem.item.healthCost -
                  useritem.item.healthCostReducePerLvl * user.level,
              ),
              chakraCost: Math.max(
                0,
                useritem.item.chakraCost -
                  useritem.item.chakraCostReducePerLvl * user.level,
              ),
              staminaCost: Math.max(
                0,
                useritem.item.staminaCost -
                  useritem.item.staminaCostReducePerLvl * user.level,
              ),
              actionCostPerc: useritem.item.actionCostPerc,
              effects: useritem.item.effects,
              quantity: useritem.quantity,
              data: useritem.item,
            };
          })
      : []),
  ];
  // If we only have move & end turn action, also add basic attack
  if (availableActions.length === 2) {
    availableActions.push(basicAttack);
  }
  // If we hide cooldowns, hide then
  if (hideCooldowned) {
    availableActions = availableActions.filter((a) => {
      if (a.cooldown && a.cooldown > 0) {
        const timePassed = (Date.now() - a.updatedAt) / 1000;
        return timePassed >= a.cooldown * COMBAT_SECONDS;
      }
      return true;
    });
  }

  // Return actions
  return availableActions;
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

  // Check if user was found
  if (!user) {
    throw new Error("User performing action not found");
  }

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
  const userHex = user.hex;
  if (userHex && targetTile) {
    // Check pools cost
    const { hpCost, cpCost, spCost } = calcPoolCost(action, usersEffects, user);
    if (user.curHealth < hpCost) throw new Error("Not enough health");
    if (user.curChakra < cpCost) throw new Error("Not enough chakra");
    if (user.curStamina < spCost) throw new Error("Not enough stamina");
    // How much time passed since last action
    const newPoints = actionPointsAfterAction(user, battle, action);
    if (newPoints < 0) return false;
    // Get the possible action squares
    const highlights = getPossibleActionTiles(action, userHex, grid);
    // Given this action, get the affected tiles
    const { green: affectedTiles } = getAffectedTiles({
      a: userHex,
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
    const barrierAttacks: string[] = [];
    // Path finder on grid
    const aStar = new PathCalculator(grid);
    // For each affected tile, apply the effects
    affectedTiles.forEach((tile) => {
      // Calculate how many barriers are between origin & target
      const { barriers, totalAbsorb } = getBarriersBetween(
        aStar,
        groundEffects,
        userHex,
        tile,
      );

      // ADD EFFECTS
      if (action.target === "GROUND" || action.target === "EMPTY_GROUND") {
        // ADD GROUND EFFECTS
        const target = getTargetUser(alive, "CHARACTER", tile, user.userId);
        action.effects.forEach((tag) => {
          if (tag.target === "SELF") {
            const effect = realizeTag({
              user,
              target: user,
              tag: tag as UserEffect,
              level: action.level,
              round: battle.round,
              barrierAbsorb: totalAbsorb,
            });
            if (effect && checkFriendlyFire(effect, user, alive)) {
              effect.targetId = user.userId;
              usersEffects.push(effect);
            }
          } else if (!tag.target || tag.target === "INHERIT") {
            const effect = realizeTag({
              user,
              tag: tag as GroundEffect,
              level: action.level,
              round: battle.round,
              barrierAbsorb: totalAbsorb,
            });
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
        });
      } else {
        // ADD USER EFFECTS
        const target = getTargetUser(alive, action.target, tile, user.userId);
        action.effects.forEach((tag) => {
          const effect = realizeTag({
            user,
            target,
            tag: tag as UserEffect,
            level: action.level,
            round: battle.round,
            barrierAbsorb: totalAbsorb,
          });
          if (effect) {
            effect.longitude = tile.col;
            effect.latitude = tile.row;
            effect.fromType = action.type;
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
            }
            // Extra: If no target, check if there is a barrier & apply damage only
            if (tag.type === "damage") {
              barriers.forEach((barrier) => {
                const idx = `${barrier.id}-${effect.id}`;
                if (!barrierAttacks.includes(idx)) {
                  barrierAttacks.push(idx);
                  targetUsernames.push("barrier");
                  targetGenders.push("it");
                  const barrierEffect = structuredClone(effect);
                  barrierEffect.targetType = "barrier";
                  barrierEffect.targetId = barrier.id;
                  barrierEffect.id = nanoid();
                  if ("absorbPercentage" in barrier) {
                    barrierEffect.barrierAbsorb = barrier.absorbPercentage;
                  }
                  usersEffects.push(barrierEffect);
                }
              });
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
    // Check if action affected anything
    if (affectedTiles.size > 0) {
      // If this was an item, check if we should destroy on use
      if (action.type === "item") {
        const useritem = user.items.find((i) => i.item.id === action.id);
        if (useritem && useritem.item.destroyOnUse) {
          useritem.quantity -= 1;
        }
      }
      // Update pools & action timer based on action
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
        user.gender === "Male" ? "he" : "she",
      );
      action.battleDescription = action.battleDescription.replaceAll(
        "%user_object",
        user.gender === "Male" ? "him" : "her",
      );
      action.battleDescription = action.battleDescription.replaceAll(
        "%user_posessive",
        user.gender === "Male" ? "his" : "hers",
      );
      action.battleDescription = action.battleDescription.replaceAll(
        "%user_reflexive",
        user.gender === "Male" ? "himself" : "herself",
      );
      action.battleDescription = action.battleDescription.replaceAll(
        "%user",
        user.username,
      );
      // Update generic descriptions
      action.battleDescription = action.battleDescription.replaceAll(
        "%location",
        `[${targetTile.row}, ${targetTile.col}]`,
      );
      // Update target descriptions
      if (targetGenders.length > 0) {
        action.battleDescription = action.battleDescription.replaceAll(
          "%target_subject",
          targetGenders.length === 1 && targetGenders[0]
            ? targetGenders[0] == "Male"
              ? "himself"
              : "herself"
            : "they",
        );
        action.battleDescription = action.battleDescription.replaceAll(
          "%target_object",
          targetGenders.length === 1 && targetGenders[0]
            ? targetGenders[0] == "Male"
              ? "him"
              : "her"
            : "them",
        );
        action.battleDescription = action.battleDescription.replaceAll(
          "%target_posessive",
          targetGenders.length === 1 && targetGenders[0]
            ? targetGenders[0] == "Male"
              ? "his"
              : "hers"
            : "theirs",
        );
        action.battleDescription = action.battleDescription.replaceAll(
          "%target_reflexive",
          targetGenders.length === 1 && targetGenders[0]
            ? targetGenders[0] == "Male"
              ? "himself"
              : "herself"
            : "themselves",
        );
      }
      if (targetUsernames.length > 0) {
        action.battleDescription = action.battleDescription.replaceAll(
          "%target",
          targetUsernames.join(", "),
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
  target: (typeof AttackTargets)[number],
  tile: TerrainHex,
  userId: string,
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
  const { battle, grid, action, actorId, longitude, latitude } = props;
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
  timeDiff = 0,
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
  timeDiff = 0,
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
  timeDiff: number = 0,
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
  if (userIds.length > 0 && (check1 || check2 || check3)) {
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
