import { availableUserActions } from "../../libs/combat/actions";
import { performBattleAction } from "../../libs/combat/actions";
import { actionPointsAfterAction } from "../../libs/combat/actions";
import { stillInBattle } from "../../libs/combat/actions";
import { getPossibleActionTiles, PathCalculator, findHex } from "../../libs/hexgrid";
import type { ActionEffect } from "../../libs/combat/types";
import type { CombatAction } from "../../libs/combat/types";
import type { CompleteBattle } from "../../libs/combat/types";
import type { TerrainHex } from "../hexgrid";
import type { Grid } from "honeycomb-grid";

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

const getHighestFitness = (searchTree: SearchAction, depth: number) => {
  let fitness = searchTree.fitness;
  // if (searchTree.action?.name === "Scratch" || searchTree.action?.name === "Wait") {
  //   console.log(
  //     `Calculating depth-${depth} highest fitness for: `,
  //     searchTree.action?.name,
  //     searchTree.fitness,
  //     searchTree.longitude,
  //     searchTree.latitude
  //   );
  // }
  if (searchTree.nextActions && searchTree.nextActions?.length > 0) {
    fitness += Math.max(
      ...searchTree.nextActions.map((action) => getHighestFitness(action, depth + 1))
    );
  }
  return fitness;
};

const getBestAction = (searchTree: SearchAction[]) => {
  // console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  // console.log("Search tree:", searchTree.length);
  const bestAction = searchTree.reduce(
    (bestAction, branch) => {
      branch.futureFitness = getHighestFitness(branch, 0);
      // console.log(
      //   "Test action: ",
      //   branch.action?.name,
      //   branch.fitness,
      //   branch.futureFitness
      // );
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
            evaluateFitness(battle, newBattle, user.userId, grid, astar, action) +
            initialFitness;
          // if (action.name === "Scratch" && curDepth === 2 && origin) {
          //   console.log(
          //     `action: ${action.name}, depth:${curDepth},  fitness: ${fitness}, location: ${origin.col}, ${origin.row}`
          //   );
          // }

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
  action: CombatAction
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
      if (origin && target) {
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
