import { availableUserActions } from "@/libs/combat/actions";
import { performBattleAction } from "@/libs/combat/actions";
import { actionPointsAfterAction } from "@/libs/combat/actions";
import { stillInBattle } from "@/libs/combat/actions";
import { findUser, findBarrier, calcPoolCost } from "@/libs/combat/util";
import { PathCalculator, findHex } from "@/libs/hexgrid";
import type { ActionEffect, BattleUserState } from "@/libs/combat/types";
import type { CombatAction } from "@/libs/combat/types";
import type { CompleteBattle, ZodAllTags } from "@/libs/combat/types";
import type { TerrainHex } from "../hexgrid";
import type { ZodAllAiCondition, ZodAllAiAction } from "@/validators/ai";
import type { Grid } from "honeycomb-grid";

type ActionWithTarget = {
  action: CombatAction;
  long: number;
  lat: number;
};

// Debug flag when testing AI
const debug = false;

export const performAIaction = (
  battle: CompleteBattle,
  grid: Grid<TerrainHex>,
  aiUserId: string,
) => {
  if (debug) console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> AI ACTION");
  // New stats to return
  const nextActionEffects: ActionEffect[] = [];
  const aiDescriptions: string[] = [];
  let nextBattle = battle;

  // Find AI users who are in control of themselves (i.e. not controlled by a player)
  const aiUsers = nextBattle.usersState.filter((user) => user.isAi);

  // Path finder on grid in path lines
  const astar = new PathCalculator(grid);

  // Path finder accounting for obstacles
  const aStarWithObstacles = new PathCalculator(
    grid.map((tile) => {
      if (
        findUser(nextBattle.usersState, tile.col, tile.row) ||
        findBarrier(nextBattle.groundEffects, tile.col, tile.row)
      ) {
        tile.cost = 100;
      }
      return tile;
    }),
  );

  // Find the AI user
  const user = aiUsers.find((user) => user.userId === aiUserId);
  if (user) {
    // Possible actions
    const actions = availableUserActions(nextBattle, user.userId, true, true)
      .filter((action) => {
        const costs = calcPoolCost(action, nextBattle.usersEffects, user);
        if (user.curHealth < costs.hpCost) return false;
        if (user.curChakra < costs.cpCost) return false;
        if (user.curStamina < costs.spCost) return false;
        return true;
      })
      .filter((action) => {
        const check = actionPointsAfterAction(user, nextBattle, action);
        return check.canAct;
      });
    if (debug)
      console.log(
        "Actions: ",
        actions.map((a) => a.name),
      );

    // User hex
    const origin = findHex(grid, user);
    // Get user enemies
    const enemies = getEnemies(battle.usersState, user.userId).map((u) => {
      const hex = findHex(grid, u);
      const path = hex && origin ? astar.getShortestPath(origin, hex) : undefined;
      return {
        ...u,
        hex: hex,
        distance: path?.length ? path.length : 0,
      };
    });
    // Derived for convenience
    const userWithDistance = { ...user, path: undefined, distance: 0 };
    const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
    const closestEnemy = enemies.reduce((prev, current) =>
      prev.distance < current.distance ? prev : current,
    );
    // Convenience for getting target
    const getTarget = (entry: ZodAllAiCondition | ZodAllAiAction) => {
      if (!("target" in entry)) return undefined;
      switch (entry?.target) {
        case "RANDOM_OPPONENT":
          return randomEnemy;
        case "CLOSEST_OPPONENT":
          return closestEnemy;
        case "SELF":
          return userWithDistance;
      }
    };

    // Go through rules
    let nextAction: ActionWithTarget | undefined = undefined;
    for (const rule of user.aiProfile.rules) {
      if (debug) console.log("Rule: ", rule);
      /** ************************ */
      /** CHECK CONDITIONS         */
      /** ************************ */
      const checked = rule.conditions.every((condition) => {
        const target = getTarget(condition);
        switch (condition.type) {
          case "health_below":
            return (user.curHealth / user.maxHealth) * 100 < condition.value;
          case "distance_higher_than":
            return target ? target.distance >= condition.value : false;
          case "distance_lower_than":
            return target ? target.distance <= condition.value : false;
        }
      });
      /** ************************ */
      /** PROCESS ACTION           */
      /** ************************ */
      if (checked) {
        // Convenience method for checking if rule action has a given effect
        const getHighestPowerAction = (actions: CombatAction[]) => {
          const hasEffect = (e: ZodAllTags) => {
            return "effect" in rule.action && e.type === rule.action.effect;
          };
          return actions
            .filter((a) => a.effects.find((e) => hasEffect(e)))
            .sort((a, b) => {
              const prev = a.effects.find((e) => hasEffect(e));
              const current = b.effects.find((e) => hasEffect(e));
              return prev && current ? current.power - prev.power : 0;
            })[0];
        };
        // Get target and target hex
        const target = getTarget(rule.action);
        const targetHex = target?.hex;
        // Go through different actions
        if (rule.action.type === "move_towards_opponent") {
          const move = actions.find((a) => a.id === "move");
          if (target && targetHex && origin && move) {
            const path = aStarWithObstacles.getShortestPath(origin, targetHex);
            const hex = path?.[1];
            if (path && hex && path.length > 2) {
              nextAction = { action: move, long: hex.col, lat: hex.row };
            }
          }
        } else if (rule.action.type === "use_specific_jutsu") {
          const action = actions.find(
            (a) => "jutsuId" in rule.action && a.id === rule.action.jutsuId,
          );
          if (action && target) {
            nextAction = { action, long: target.longitude, lat: target.latitude };
          }
        } else if (rule.action.type === "use_specific_item") {
          const action = actions.find(
            (a) => "itemId" in rule.action && a.id === rule.action.itemId,
          );
          if (action && target) {
            nextAction = { action, long: target.longitude, lat: target.latitude };
          }
        } else if (rule.action.type === "use_random_jutsu") {
          const jutsus = actions.filter((a) => a.type === "jutsu");
          const action = jutsus[Math.floor(Math.random() * jutsus.length)];
          if (action && target) {
            nextAction = { action, long: target.longitude, lat: target.latitude };
          }
        } else if (rule.action.type === "use_random_item") {
          const items = actions.filter((a) => a.type === "item");
          const action = items[Math.floor(Math.random() * items.length)];
          if (action && target) {
            nextAction = { action, long: target.longitude, lat: target.latitude };
          }
        } else if (rule.action.type === "use_highest_power_action") {
          const action = getHighestPowerAction(actions);
          if (target && action) {
            nextAction = { action, long: target.longitude, lat: target.latitude };
          }
        } else if (rule.action.type === "use_highest_power_jutsu") {
          const action = getHighestPowerAction(
            actions.filter((a) => a.type === "jutsu"),
          );
          if (target && action) {
            nextAction = { action, long: target.longitude, lat: target.latitude };
          }
        } else if (rule.action.type === "use_highest_power_item") {
          const action = getHighestPowerAction(
            actions.filter((a) => a.type === "item"),
          );
          if (target && action) {
            nextAction = { action, long: target.longitude, lat: target.latitude };
          }
        } else if (rule.action.type === "end_turn") {
          const wait = actions.find((a) => a.id === "wait");
          if (wait) {
            nextAction = { action: wait, long: user.longitude, lat: user.latitude };
          }
        }
      }
      /** ************************ */
      /** CHECK IF ACTION IS VALID */
      /** ************************ */
      if (nextAction) {
        if (debug) console.log("Action: ", nextAction.action.name);
        const check = actionPointsAfterAction(user, nextBattle, nextAction?.action);
        const result = performBattleAction({
          battle: structuredClone(nextBattle),
          action: nextAction.action,
          grid,
          contextUserId: user.userId,
          actorId: user.userId,
          longitude: nextAction.long,
          latitude: nextAction.lat,
        });
        const valid = check.canAct && !!result;
        if (valid) {
          nextBattle = result.newBattle;
          nextActionEffects.push(...result.actionEffects);
          aiDescriptions.push(nextAction.action.battleDescription);
          break;
        }
        nextAction = undefined;
      }
    }
    /** ******************************* */
    /** If not final action, end the AI */
    /** ******************************* */
    if (!nextAction) {
      aiDescriptions.push(`${user.username} is exhausted and has to give up`);
      user.curHealth = 0;
    }
  }

  // Return the new state
  return { nextBattle, nextActionEffects, aiDescriptions };
};

/**
 * Retrieves a list of enemy users based on the current battle state.
 *
 * @param usersState - An array of `BattleUserState` representing the state of all users in the battle.
 * @param userId - The ID of the user for whom to find enemies.
 * @returns An array of `BattleUserState` representing the enemy users.
 */
const getEnemies = (usersState: BattleUserState[], userId: string) => {
  const villageIds = [
    ...new Set(usersState.filter(stillInBattle).map((u) => u.villageId)),
  ];
  const user = usersState.find((u) => u.userId === userId);
  return usersState
    .filter((u) =>
      villageIds.length > 1
        ? u.villageId !== user?.villageId
        : u.controllerId !== user?.controllerId,
    )
    .filter((u) => stillInBattle(u));
};
