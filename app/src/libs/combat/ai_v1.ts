import { availableUserActions } from "@/libs/combat/actions";
import { performBattleAction } from "@/libs/combat/actions";
import { actionPointsAfterAction } from "@/libs/combat/actions";
import { stillInBattle } from "@/libs/combat/actions";
import { findUser, findBarrier, calcPoolCost } from "@/libs/combat/util";
import { getPossibleActionTiles, PathCalculator, findHex } from "@/libs/hexgrid";
import type { ActionEffect, BattleUserState } from "@/libs/combat/types";
import type { CombatAction } from "@/libs/combat/types";
import type { CompleteBattle } from "@/libs/combat/types";
import type { TerrainHex } from "../hexgrid";
import type { Grid } from "honeycomb-grid";

/**
 * A basic minimax AI for the game
 * It works by searching through all possible actions and their outcomes
 */

// Debug flag when testing AI
const debug = false;

export const performAIaction = (
  battle: CompleteBattle,
  grid: Grid<TerrainHex>,
  aiUserId: string,
) => {
  // New stats to return
  let searchSize = 0;
  const nextActionEffects: ActionEffect[] = [];
  const aiDescriptions: string[] = [];
  let nextBattle = {
    ...battle,
    usersState: structuredClone(battle.usersState),
    usersEffects: structuredClone(battle.usersEffects),
    groundEffects: structuredClone(battle.groundEffects),
  };

  // Find AI users who are in control of themselves (i.e. not controlled by a player)
  const aiUsers = nextBattle.usersState.filter((user) => user.isAi);

  // Path finder on grid
  const aStar = new PathCalculator(grid);

  // Find the AI user
  const user = aiUsers.find((user) => user.userId === aiUserId);
  if (user) {
    // Possible actions
    const actions = availableUserActions(nextBattle, user.userId, false, true)
      .filter((action) => {
        const costs = calcPoolCost(action, nextBattle.usersEffects, user);
        if (user.curHealth < costs.hpCost) return false;
        if (user.curChakra < costs.cpCost) return false;
        if (user.curStamina < costs.spCost) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.name === "Move") return -1;
        if (b.name === "Move") return 1;
        const aDam = a.effects.find((e) => e.type === "damage");
        const bDam = b.effects.find((e) => e.type === "damage");
        if (aDam && !bDam) return -1;
        if (!aDam && bDam) return 1;
        if (aDam && bDam) {
          if (aDam.power > bDam.power) return -1;
          if (aDam.power < bDam.power) return 1;
        }
        if (a.name === "End Turn") return 1;
        if (b.name === "End Turn") return -1;
        return 1;
      });

    // console.log(
    //   "Action costs: ",
    //   actions.map((a) => {
    //     return { name: a.name, cost: a.actionCostPerc };
    //   }),
    // );
    // Get a list of all possible actions from this origin and 2 steps forward
    const searchTree = getActionTree(actions, nextBattle, user.userId, grid, aStar);
    // In the search tree, find the first action which leads to the best possible fitness in the final action
    const bestAction = getBestAction(searchTree);
    // Search space size
    searchSize = getSearchSpaceSize(searchTree);

    // Debug statement
    if (debug) {
      console.log(`>> Best action: ${bestAction?.action?.name}`);
      console.log(`>> Search space size: ${searchSize}`);
    }

    // console.log("bestAction", user.actionPoints, bestAction.action?.name);
    // From the search tree find the best action
    // const bestAction = searchTree.reduce(
    // If there is a best action, perform it
    if (
      bestAction.action &&
      bestAction.longitude !== undefined &&
      bestAction.latitude !== undefined
    ) {
      const originalAction = actions.find((a) => a.id === bestAction.action?.id);
      const { canAct } = actionPointsAfterAction(user, nextBattle, originalAction);
      if (originalAction && canAct) {
        // If user decides to end turn and only has two actions (move and end turn, end)
        if (bestAction?.action?.id === "wait" && actions.length === 2) {
          originalAction.battleDescription = `${user.username} is exhausted and has to give up`;
          user.curHealth = 0;
        }
        if (user.curHealth > 0) {
          const result = performBattleAction({
            battle: nextBattle,
            action: originalAction,
            grid,
            contextUserId: user.userId,
            actorId: user.userId,
            longitude: bestAction.longitude,
            latitude: bestAction.latitude,
          });
          if (result) {
            nextBattle = result.newBattle;
            nextActionEffects.push(...result.actionEffects);
          }
        }
        // Update
        aiDescriptions.push(originalAction.battleDescription);
      }
    }
  }

  // Return the new state
  return { nextBattle, nextActionEffects, aiDescriptions, searchSize };
};

type SearchAction = {
  action: CombatAction | undefined;
  longitude?: number;
  latitude?: number;
  fitness: number;
  nextActions?: SearchAction[];
  futureFitness: number;
};

const getSearchSpaceSize = (searchTree: SearchAction[]) => {
  let size = 0;
  searchTree.forEach((branch) => {
    size += 1;
    if (branch.nextActions) {
      size += getSearchSpaceSize(branch.nextActions);
    }
  });
  return size;
};

const getHighestFitness = (searchTree: SearchAction, depth: number = 0) => {
  let moves = searchTree.action?.name;
  let fitness = searchTree.fitness;
  if (searchTree.nextActions && searchTree.nextActions?.length > 0) {
    const nexts = searchTree.nextActions.map((action) =>
      getHighestFitness(action, depth + 1),
    );
    const bestNext = nexts.reduce((a, b) => (a.fitness > b.fitness ? a : b));
    moves += ` > ${bestNext.moves}`;
    fitness = bestNext.fitness;
  }
  return { fitness, moves };
};

const getBestAction = (searchTree: SearchAction[]) => {
  // console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  // console.log("Search tree:", searchTree.length);
  const bestAction = searchTree.reduce(
    (bestAction, branch) => {
      const { fitness, moves } = getHighestFitness(branch);
      branch.futureFitness = fitness;
      if (debug) {
        const a = branch.action?.name;
        const b = branch.fitness.toFixed(1);
        const c = branch.futureFitness.toFixed(1);
        console.log(`${a}\t Fitness: ${b}\t Future fitness: ${c}\t Moves: ${moves}`);
      }
      // console.log("best future fitness: ", branch.futureFitness);
      if (branch.futureFitness > bestAction.futureFitness) {
        return branch;
      } else {
        return bestAction;
      }
    },
    { action: undefined, fitness: -Infinity, futureFitness: -Infinity },
  );
  // console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  // console.log(
  //   "Best action:",
  //   bestAction.action?.name,
  //   bestAction.longitude,
  //   bestAction.latitude,
  //   bestAction.futureFitness
  // );
  // console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  return bestAction;
};

/** For AI, we restrict the possible action tiles available
 * for users so as to optimize the search space
 */
const getAiTiles = (
  action: CombatAction,
  battle: CompleteBattle,
  userId: string,
  origin: TerrainHex | undefined,
  grid: Grid<TerrainHex>,
  astar: PathCalculator,
) => {
  // In case of move action, only show the single tile moving towards an enemy
  if (action.name === "Move") {
    const enemy = getEnemies(battle.usersState, userId)[0];
    if (enemy) {
      const target = findHex(grid, enemy);
      if (origin && target) {
        const path = astar.getShortestPath(origin, target);
        return path && path[1] ? [path[1]] : [];
      }
    }
  } else {
    const returned: TerrainHex[] = [];
    getPossibleActionTiles(action, origin, grid)?.forEach((tile) => {
      if (
        findUser(battle.usersState, tile.col, tile.row) ||
        findBarrier(battle.groundEffects, tile.col, tile.row)
      ) {
        returned.push(tile);
      }
    });
    return returned;
  }
  // Return all available tiles
  return getPossibleActionTiles(action, origin, grid);
};

const getActionTree = (
  actions: CombatAction[],
  battle: CompleteBattle,
  userId: string,
  grid: Grid<TerrainHex>,
  astar: PathCalculator,
  initialFitness = 0,
  curDepth = 0,
  searchDepth = 1,
  curSize = 0,
): SearchAction[] => {
  // Destructure
  const user = battle.usersState.find((u) => u.userId === userId);
  if (!user) {
    return [];
  }
  // Get user location on grid
  const origin = user && grid.getHex({ col: user.longitude, row: user.latitude });
  // Initialize list of possible actions from this origin
  const searcedActions: SearchAction[] = [];
  // Clone actions to not mutate original
  const availableActions = structuredClone(actions);
  // Go through all possible actions for this AI
  availableActions.forEach((action) => {
    const { canAct } = actionPointsAfterAction(user, battle, action);
    if (canAct) {
      // Go through all the possible tiles where action can be performed
      const possibleTiles = getAiTiles(action, battle, userId, origin, grid, astar);
      possibleTiles?.forEach((tile) => {
        try {
          if (curSize < 20) {
            const newState = performBattleAction({
              battle: structuredClone(battle),
              action: structuredClone(action),
              grid,
              contextUserId: user.userId,
              actorId: user.userId,
              longitude: tile.col,
              latitude: tile.row,
            });
            curSize += 1;

            // Error when no new state
            if (!newState) {
              throw new Error("Action not possible");
            }
            const { newBattle } = newState;

            // Calculate the fitness
            const fitness =
              evaluateFitness(
                battle,
                newBattle,
                user.userId,
                grid,
                astar,
                action,
                curDepth,
              ) + initialFitness;

            // If we are not at the end of the depth, calculate the next actions
            const nextActions =
              curDepth < searchDepth
                ? getActionTree(
                    availableActions,
                    newBattle,
                    userId,
                    grid,
                    astar,
                    fitness,
                    curDepth + 1,
                    searchDepth,
                  )
                : undefined;
            curSize += nextActions?.length ?? 0;

            // Add to the list of searched actions
            searcedActions.push({
              action,
              longitude: tile.col,
              latitude: tile.row,
              fitness,
              futureFitness: 0,
              nextActions,
            });
          }

          // Update all future actions to have zero cost -
          // This is a hack to lets the AI plan more carefully,
          // considering actions it may have next round as well
          // ERROR: This will cause a constant-attack from AI from frontend,
          //        since it will think it can still use actions
          // availableActions.forEach((a) => (a.actionCostPerc = 0));
        } catch (e) {
          // No worries, ignore that this action was a dud
          console.error(e);
        }
      });
    }
  });
  // Return all searched actions
  return searcedActions;
};

export const evaluateFitness = (
  curBattle: CompleteBattle,
  newBattle: CompleteBattle,
  userId: string,
  grid: Grid<TerrainHex>,
  astar: PathCalculator,
  action: CombatAction,
  depth: number,
) => {
  const curUsersState = curBattle.usersState;
  const newUsersState = newBattle.usersState;
  const curUser = curUsersState.find((u) => u.userId === userId);
  const newUser = newUsersState.find((u) => u.userId === userId);
  let fitness = 0;

  // If no user found, just return 0
  if (!newUser || !curUser) return fitness;

  // Damage healed is added to the fitness
  // If over 90% health, do not care
  // If over 80% health, only with 1/10th of the value
  // If over 60% health, only with 1/5th of the value
  // If over 40% health, only with 1/2 of the value
  // If over 20% health, only with 3/4 of the value
  if (newUser.curHealth > curUser.curHealth) {
    const perc = newUser.curHealth / newUser.maxHealth;
    if (perc < 0.9) {
      if (perc > 0.8) {
        fitness += (newUser.curHealth - curUser.curHealth) * 0.1;
      } else if (perc > 0.6) {
        fitness += (newUser.curHealth - curUser.curHealth) * 0.2;
      } else if (perc > 0.4) {
        fitness += (newUser.curHealth - curUser.curHealth) * 0.5;
      } else if (perc > 0.2) {
        fitness += (newUser.curHealth - curUser.curHealth) * 0.75;
      } else {
        fitness += newUser.curHealth - curUser.curHealth;
      }
    }
  }

  // Waiting is penalized
  if (action.id === "wait") {
    fitness -= 10;
  }
  // Go through each user in the battle
  // console.log("============");
  // console.log(newUser.username, newUser.controllerId);
  getEnemies(newUsersState, userId).forEach((newEnemy) => {
    // Find the enemy in the previous state
    const curEnemy = curUsersState.find((u) => u.userId === newEnemy.userId);

    // The distance to each enemy is subtracted from the fitness
    // This will make the AI gravitate towards its enemies
    const origin = findHex(grid, newUser);
    const target = findHex(grid, newEnemy);
    if (origin && target && depth === 0) {
      const path = astar.getShortestPath(origin, target);
      if (path) {
        // console.log(
        //   newEnemy.username,
        //   path.length,
        //   newEnemy.controllerId,
        //   newUser.controllerId
        // );
        fitness -= path.length / 10;
      }
    }

    // Damage taken by enemy added to fitness
    if (curEnemy && curEnemy.curHealth > newEnemy.curHealth) {
      fitness += curEnemy.curHealth - newEnemy.curHealth;
    }
  });
  return fitness;
};

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
