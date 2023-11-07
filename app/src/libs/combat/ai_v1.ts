import { availableUserActions } from "@/libs/combat/actions";
import { performBattleAction } from "@/libs/combat/actions";
import { actionPointsAfterAction } from "@/libs/combat/actions";
import { stillInBattle } from "@/libs/combat/actions";
import { getPossibleActionTiles, PathCalculator, findHex } from "@/libs/hexgrid";
import type { ActionEffect } from "@/libs/combat/types";
import type { CombatAction } from "@/libs/combat/types";
import type { CompleteBattle } from "@/libs/combat/types";
import type { TerrainHex } from "../hexgrid";
import type { Grid } from "honeycomb-grid";

// Debug flag when testing AI
const debug = false;

export const performAIaction = (
  battle: CompleteBattle,
  grid: Grid<TerrainHex>,
  aiUserId: string
) => {
  // New stats to return
  const nextActionEffects: ActionEffect[] = [];
  const aiDescriptions: string[] = [];
  let nextBattle = {
    ...battle,
    usersState: structuredClone(battle.usersState),
    usersEffects: structuredClone(battle.usersEffects),
    groundEffects: structuredClone(battle.groundEffects),
  };

  // Find AI users who are in control of themselves (i.e. not controlled by a player)
  const aiUsers = battle.usersState.filter((user) => user.isAi);

  // Path finder on grid
  const aStar = new PathCalculator(grid);

  // Find the AI user
  const user = aiUsers.find((user) => user.userId === aiUserId);
  if (user) {
    // Possible actions
    const actions = availableUserActions(nextBattle, user.userId, false);
    // console.log(
    //   "Action costs: ",
    //   actions.map((a) => {
    //     return { name: a.name, cost: a.actionCostPerc };
    //   })
    // );
    // Get a list of all possible actions from this origin and 2 steps forward
    const searchTree = getActionTree(actions, nextBattle, user.userId, grid, aStar);
    // In the search tree, find the first action which leads to the best possible fitness in the final action
    const bestAction = getBestAction(searchTree);

    // Debug statement
    if (debug) {
      const searchSize = getSearchSpaceSize(searchTree);
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
      if (originalAction && user.actionPoints >= originalAction.actionCostPerc) {
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
          aiDescriptions.push(originalAction.battleDescription);
        }
      }
    }
  }

  // Return the new state
  return { nextBattle, nextActionEffects, aiDescriptions };
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
      getHighestFitness(action, depth + 1)
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
    { action: undefined, fitness: -Infinity, futureFitness: -Infinity }
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

const getActionTree = (
  actions: CombatAction[],
  battle: CompleteBattle,
  userId: string,
  grid: Grid<TerrainHex>,
  astar: PathCalculator,
  initialFitness = 0,
  curDepth = 0,
  searchDepth = 1
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
    const canAct = actionPointsAfterAction(user, battle, action) >= 0;
    if (canAct) {
      // Go through all the possible tiles where action can be performed
      const possibleTiles = getPossibleActionTiles(action, origin, grid);
      possibleTiles?.forEach((tile) => {
        try {
          const newState = performBattleAction({
            battle: structuredClone(battle),
            action: structuredClone(action),
            grid,
            contextUserId: user.userId,
            actorId: user.userId,
            longitude: tile.col,
            latitude: tile.row,
          });
          if (!newState) {
            throw new Error("Action not possible");
          }
          const { newBattle } = newState;

          // Update all future actions to have zero cost -
          // This is a hack to lets the AI plan more carefully,
          // considering actions it may have next round as well
          // ERROR: This will cause a constant-attack from AI from frontend,
          //        since it will think it can still use actions
          // availableActions.forEach((a) => (a.actionCostPerc = 0));

          // Calculate the fitness
          const fitness =
            evaluateFitness(
              battle,
              newBattle,
              user.userId,
              grid,
              astar,
              action,
              curDepth
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
                  searchDepth
                )
              : undefined;
          // Add to the list of searched actions
          searcedActions.push({
            action,
            longitude: tile.col,
            latitude: tile.row,
            fitness,
            futureFitness: 0,
            nextActions,
          });
        } catch (e) {
          // No worries, ignore that this action was a dud
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
  depth: number
) => {
  const curUsersState = curBattle.usersState;
  const newUsersState = newBattle.usersState;
  const curUser = curUsersState.find((u) => u.userId === userId);
  const newUser = newUsersState.find((u) => u.userId === userId);
  let fitness = 0;

  // If no user found, just return 0
  if (!newUser || !curUser) return fitness;

  // Damage healed is added to the fitness
  if (newUser.curHealth > curUser.curHealth) {
    fitness += newUser.curHealth - curUser.curHealth;
  }

  // Waiting is penalized
  if (action.id === "wait") {
    fitness -= 10;
  }

  // Determining enemies
  const villageIds = [
    ...new Set(newUsersState.filter(stillInBattle).map((u) => u.villageId)),
  ];

  // Go through each user in the battle
  // console.log("============");
  // console.log(newUser.username, newUser.controllerId);
  newUsersState
    .filter((u) =>
      villageIds.length > 1
        ? u.villageId !== newUser.villageId
        : u.controllerId !== newUser.controllerId
    )
    .filter((u) => stillInBattle(u))
    .forEach((newEnemy) => {
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
