import { availableUserActions } from "../../libs/combat/actions";
import { performAction } from "../../libs/combat/actions";
import { actionSecondsAfterAction } from "../../libs/combat/movement";
import { getPossibleActionTiles, PathCalculator, findHex } from "../../libs/hexgrid";
import type { BattleUserState, ActionEffect } from "../../libs/combat/types";
import type { GroundEffect, UserEffect, CombatAction } from "../../libs/combat/types";
import type { TerrainHex } from "../hexgrid";
import type { Grid } from "honeycomb-grid";

export const performAIaction = (
  rawUsersState: BattleUserState[],
  rawUsersEffects: UserEffect[],
  rawGroundEffects: GroundEffect[],
  grid: Grid<TerrainHex>
) => {
  // New stats to return
  let nextUsersState = structuredClone(rawUsersState);
  let nextUsersEffects = structuredClone(rawUsersEffects);
  let nextGroundEffects = structuredClone(rawGroundEffects);
  let nextActionEffects: ActionEffect[] = [];
  let description = "";

  // Find AI users who are in control of themselves (i.e. not controlled by a player)
  const aiUsers = rawUsersState.filter(
    (user) => user.isAi && user.controllerId === user.userId
  );

  // Path finder on grid
  const aStar = new PathCalculator(grid);

  // If AI users, check all possible actions to calculate a fitness function
  aiUsers.forEach((user) => {
    // Possible actions (clone as to not mutate original)
    const actions = availableUserActions(nextUsersState, user.userId, false);
    // Get a list of all possible actions from this origin and 2 steps forward
    const searchTree = getActionTree(
      actions,
      nextUsersState,
      nextUsersEffects,
      nextGroundEffects,
      user,
      grid,
      aStar
    );
    // In the search tree, find the first action which leads to the best possible fitness in the final action
    const bestAction = getBestAction(searchTree);
    // From the search tree find the best action
    // const bestAction = searchTree.reduce(
    // If there is a best action, perform it
    if (
      bestAction.action &&
      bestAction.longitude !== undefined &&
      bestAction.latitude !== undefined
    ) {
      const originalAction = actions.find((a) => a.id === bestAction.action?.id);
      if (originalAction) {
        const result = performAction({
          usersState: nextUsersState,
          usersEffects: nextUsersEffects,
          groundEffects: nextGroundEffects,
          grid,
          action: bestAction.action,
          contextUserId: user.userId,
          actionUserId: user.userId,
          longitude: bestAction.longitude,
          latitude: bestAction.latitude,
        });
        nextUsersEffects = result.newUsersEffects;
        nextGroundEffects = result.newGroundEffects;
        nextUsersState = result.newUsersState;
        nextActionEffects = result.actionEffects;
        description += bestAction.action.battleDescription;
      }
    }
  });
  // Return the new state
  return {
    nextUsersState,
    nextUsersEffects,
    nextGroundEffects,
    nextActionEffects,
    description,
  };
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
  if (searchTree.nextActions) {
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
  usersState: BattleUserState[],
  usersEffects: UserEffect[],
  groundEffects: GroundEffect[],
  user: BattleUserState,
  grid: Grid<TerrainHex>,
  astar: PathCalculator,
  initialFitness = 0,
  curDepth = 0,
  searchDepth = 1
  // actionMemory
) => {
  // Get user location on grid
  const origin = user && grid.getHex({ col: user.longitude, row: user.latitude });
  // Initialize list of possible actions from this origin
  const searcedActions: SearchAction[] = [];
  // Clone actions to not mutate original
  const availableActions = structuredClone(actions);
  // Go through all possible actions for this AI
  availableActions.forEach((action) => {
    const canAct = actionSecondsAfterAction(user, action) >= 0;
    if (canAct) {
      // Go through all the possible tiles where action can be performed
      const possibleTiles = getPossibleActionTiles(action, origin, grid);
      possibleTiles?.forEach((tile) => {
        try {
          const { newUsersState, newUsersEffects, newGroundEffects } = performAction({
            usersState: structuredClone(usersState),
            usersEffects: structuredClone(usersEffects),
            groundEffects: structuredClone(groundEffects),
            grid,
            action: structuredClone(action),
            contextUserId: user.userId,
            actionUserId: user.userId,
            longitude: tile.col,
            latitude: tile.row,
          });
          // Update all future actions to have zero cost
          availableActions.forEach((a) => (a.actionCostPerc = 0));
          // Calculate the fitness
          const fitness =
            evaluateFitness(
              usersState,
              newUsersState,
              user.userId,
              grid,
              astar,
              action
            ) + initialFitness;
          // if (action.name === "Scratch" && curDepth === 2 && origin) {
          //   console.log(
          //     `action: ${action.name}, depth:${curDepth},  fitness: ${fitness}, location: ${origin.col}, ${origin.row}`
          //   );
          // }
          // New user
          const newUser = newUsersState.find((u) => u.userId === user.userId);
          // If we are not at the end of the depth, calculate the next actions
          const nextActions =
            curDepth < searchDepth && newUser
              ? getActionTree(
                  availableActions,
                  newUsersState,
                  newUsersEffects,
                  newGroundEffects,
                  newUser,
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
        } catch (e) {}
      });
    }
  });
  // Return all searched actions
  return searcedActions;
};

export const evaluateFitness = (
  curUsersState: BattleUserState[],
  newUsersState: BattleUserState[],
  userId: string,
  grid: Grid<TerrainHex>,
  astar: PathCalculator,
  action: CombatAction
) => {
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
  if (action.name === "Wait") {
    fitness -= 1;
  }

  // Go through each user in the battle
  newUsersState
    .filter((u) => u.villageId !== newUser.villageId)
    .forEach((newEnemy) => {
      // Find the enemy in the previous state
      const curEnemy = curUsersState.find((u) => u.userId === newEnemy.userId);

      // The distance to each enemy is subtracted from the fitness
      // This will make the AI gravitate towards its enemies
      const origin = findHex(grid, curUser);
      const target = findHex(grid, newEnemy);
      if (origin && target) {
        const path = astar.getShortestPath(origin, target);
        if (path) {
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
