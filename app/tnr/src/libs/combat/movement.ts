import { AttackMethod, AttackTarget } from "@prisma/client";
import { spiral, line, ring, fromCoordinates } from "honeycomb-grid";
import { COMBAT_SECONDS } from "./constants";
import { secondsPassed } from "../../utils/time";
import type { Grid } from "honeycomb-grid";
import type { TerrainHex } from "../hexgrid";
import type { DrawnCombatUser, CombatAction, GroundEffect } from "./types";

export const isValidMove = (info: {
  action: CombatAction;
  target: TerrainHex;
  user: DrawnCombatUser;
  users: DrawnCombatUser[];
  barriers: GroundEffect[];
}) => {
  const { action, user, users, target, barriers } = info;
  const { villageId, userId } = user;
  const barrier = barriers.find(
    (b) => b.longitude === target.col && b.latitude === target.row
  );
  if (!barrier) {
    const opponent = users.find(
      (u) => u.longitude === target.col && u.latitude === target.row && u.cur_health > 0
    );
    if (action.target === AttackTarget.CHARACTER) {
      if (opponent) return true;
    } else if (action.target === AttackTarget.OPPONENT) {
      if (opponent && opponent?.villageId !== villageId) return true;
    } else if (action.target === AttackTarget.OTHER_USER) {
      if (opponent && opponent?.userId !== userId) return true;
    } else if (action.target === AttackTarget.ALLY) {
      if (opponent && opponent?.villageId === villageId) return true;
    } else if (action.target === AttackTarget.SELF) {
      if (opponent && opponent?.userId === userId) return true;
    } else if (action.target === AttackTarget.EMPTY_GROUND) {
      if (!opponent) return true;
    } else if (action.target === AttackTarget.GROUND) {
      if (!(action.id === "move" && opponent)) {
        return true;
      }
    }
  } else {
    if (action.effects.find((e) => e.type === "damage")) {
      return true;
    }
  }

  return false;
};

export const actionSecondsAfterAction = (
  user: { updatedAt: string | Date },
  action: CombatAction
) => {
  const passed = Math.min(secondsPassed(new Date(user.updatedAt)), COMBAT_SECONDS);
  const timeCost = (action.actionCostPerc / 100) * COMBAT_SECONDS;
  return passed - timeCost;
};

export const getAffectedTiles = (info: {
  a: TerrainHex;
  b: TerrainHex;
  action: CombatAction;
  grid: Grid<TerrainHex>;
  users: DrawnCombatUser[];
  ground: GroundEffect[];
  userId: string;
}) => {
  // Destruct & variables
  const { action, b, a, grid, users, userId } = info;
  const radius = action.range;
  const green = new Set<TerrainHex>();
  const red = new Set<TerrainHex>();
  const user = users.find((u) => u.userId === userId);
  let tiles: Grid<TerrainHex> | undefined = undefined;

  // Get all ground effects which are barriers
  const barriers = info.ground.filter((g) => g.type === "barrier");

  // Guard if no user
  if (!user) return { green, red };

  // Handle different methods separately
  if (action.method === AttackMethod.SINGLE) {
    tiles = grid.traverse(fromCoordinates<TerrainHex>([b.q, b.r]));
  } else if (action.method === AttackMethod.AOE_CIRCLE_SPAWN) {
    tiles = grid.traverse(spiral<TerrainHex>({ start: [b.q, b.r], radius: 1 }));
  } else if (action.method === AttackMethod.AOE_LINE_SHOOT) {
    tiles = grid.traverse(line<TerrainHex>({ start: [b.q, b.r], stop: [a.q, a.r] }));
  } else if (action.method === AttackMethod.AOE_CIRCLE_SHOOT) {
    tiles = grid.traverse(ring<TerrainHex>({ center: [a.q, a.r], radius }));
  } else if (action.method === AttackMethod.AOE_SPIRAL_SHOOT) {
    tiles = grid.traverse(spiral<TerrainHex>({ start: [a.q, a.r], radius }));
    if (tiles) tiles = tiles.filter((t) => t !== a);
  } else if (action.method === AttackMethod.ALL) {
    grid.forEach((target) => {
      if (isValidMove({ action, target, user, users, barriers })) {
        green.add(target);
      }
    });
  }

  // Return green for valid moves and red for unvalid moves
  tiles?.forEach((target) => {
    if (isValidMove({ action, target, user, users, barriers })) {
      green.add(target);
    } else {
      red.add(target);
    }
  });
  return { green, red };
};
