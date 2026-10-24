import {
  Direction,
  fromCoordinates,
  type Grid,
  line,
  ring,
  spiral,
} from "honeycomb-grid";
import type { CombatAction } from "@/libs/combat/types";
import type { TerrainHex } from "@/libs/hexgrid";

/**
 * Resolves a geometric footprint with caster `a` and clicked target `b` from the same grid.
 * ALL and COORDINATES define their own footprints and ignore method-size expansion.
 * RANDOM coordinate patterns return all candidates; getAffectedTiles samples accepted casts.
 * @returns Map-owned hex instances, clipped to the map, before combat eligibility checks.
 */
export const getTargetTiles = ({
  a,
  b,
  action,
  grid,
}: {
  a: TerrainHex;
  b: TerrainHex;
  action: Pick<CombatAction, "method" | "range" | "coordinateTargeting" | "methodSize">;
  grid: Grid<TerrainHex>;
}): TerrainHex[] => {
  const radius = action.range;
  let tiles: Grid<TerrainHex> | undefined;
  // Wall methods run along rows (vertical wall) or along columns (horizontal wall).
  let horizontalWall = false;
  if (action.method === "SINGLE") {
    tiles = grid.traverse(fromCoordinates<TerrainHex>([b.q, b.r]));
  } else if (action.method === "AOE_CIRCLE_SPAWN") {
    tiles = grid.traverse(spiral<TerrainHex>({ start: [b.q, b.r], radius: 1 }));
  } else if (action.method === "AOE_LINE_SHOOT") {
    tiles = grid.traverse(line<TerrainHex>({ start: [b.q, b.r], stop: [a.q, a.r] }));
  } else if (
    action.method === "AOE_WALL_SHOOT" ||
    action.method === "AOE_LARGE_WALL_SHOOT"
  ) {
    const length = action.method === "AOE_WALL_SHOOT" ? 2 : 3;
    // Casting sideways builds a vertical wall; casting up/down builds a horizontal one.
    horizontalWall = Math.abs(a.q - b.q) < Math.abs(a.r - b.r);
    const directions = horizontalWall
      ? [Direction.W, Direction.E]
      : [Direction.N, Direction.S];
    tiles = grid.traverse(
      directions.map((direction) =>
        line<TerrainHex>({ start: [b.q, b.r], length, direction }),
      ),
    );
  } else if (action.method === "AOE_CIRCLE_SHOOT") {
    tiles = grid.traverse(ring<TerrainHex>({ center: [a.q, a.r], radius }));
  } else if (action.method === "AOE_SPIRAL_SHOOT") {
    tiles = grid.traverse(spiral<TerrainHex>({ start: [a.q, a.r], radius }));
    if (tiles) tiles = tiles.filter((t) => t !== a);
  } else if (action.method === "ALL") {
    return grid.toArray();
  } else if (action.method === "COORDINATES") {
    const pattern = action.coordinateTargeting;
    if (!pattern) return [];
    const origin =
      pattern.origin === "CASTER" ? a : pattern.origin === "TARGET" ? b : undefined;
    const coordinates = new Set(
      pattern.coordinates.map(
        (coordinate) =>
          `${coordinate.longitude + (origin?.col ?? 0)},${coordinate.latitude + (origin?.row ?? 0)}`,
      ),
    );
    return grid.toArray().filter((target) => {
      const listed = coordinates.has(`${target.col},${target.row}`);
      return pattern.selection === "EXCLUDE"
        ? !listed
        : pattern.selection === "RANDOM" && coordinates.size === 0
          ? true
          : listed;
    });
  }
  const base = tiles?.toArray() ?? [];
  // Wall sizes are authored for the sideways (vertical) wall: y lengthens it and x
  // thickens it. Rotate them with the wall so an up/down cast stays one straight
  // line instead of growing into a block.
  const sizeX = action.methodSize?.x ?? 0;
  const sizeY = action.methodSize?.y ?? 0;
  const x = horizontalWall ? sizeY : sizeX;
  const y = horizontalWall ? sizeX : sizeY;
  if (x === 0 && y === 0) return base;
  // Expand in battlefield column/row coordinates, clipping to the actual map.
  // Spiral expansion must preserve the caster's exclusion from its base footprint.
  return grid
    .toArray()
    .filter(
      (tile) =>
        (action.method !== "AOE_SPIRAL_SHOOT" || tile !== a) &&
        base.some(
          (origin) =>
            Math.abs(tile.col - origin.col) <= x &&
            Math.abs(tile.row - origin.row) <= y,
        ),
    );
};
