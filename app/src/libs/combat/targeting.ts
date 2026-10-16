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

/** Shared geometry for combat resolution and staff previews, before occupant validation. */
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
  if (action.method === "SINGLE") {
    tiles = grid.traverse(fromCoordinates<TerrainHex>([b.q, b.r]));
  } else if (action.method === "AOE_CIRCLE_SPAWN") {
    tiles = grid.traverse(spiral<TerrainHex>({ start: [b.q, b.r], radius: 1 }));
  } else if (action.method === "AOE_LINE_SHOOT") {
    tiles = grid.traverse(line<TerrainHex>({ start: [b.q, b.r], stop: [a.q, a.r] }));
  } else if (action.method === "AOE_WALL_SHOOT") {
    const deltaX = Math.abs(a.q - b.q);
    const deltaY = Math.abs(a.r - b.r);
    if (deltaX >= deltaY) {
      tiles = grid.traverse([
        line<TerrainHex>({
          start: [b.q, b.r],
          length: 2,
          direction: Direction.N,
        }),
        line<TerrainHex>({
          start: [b.q, b.r],
          length: 2,
          direction: Direction.S,
        }),
      ]);
    } else {
      tiles = grid.traverse([
        line<TerrainHex>({
          start: [b.q, b.r],
          length: 2,
          direction: Direction.W,
        }),
        line<TerrainHex>({
          start: [b.q, b.r],
          length: 2,
          direction: Direction.E,
        }),
      ]);
    }
  } else if (action.method === "AOE_LARGE_WALL_SHOOT") {
    const deltaX = Math.abs(a.q - b.q);
    const deltaY = Math.abs(a.r - b.r);
    if (deltaX >= deltaY) {
      tiles = grid.traverse([
        line<TerrainHex>({
          start: [b.q, b.r],
          length: 3,
          direction: Direction.N,
        }),
        line<TerrainHex>({
          start: [b.q, b.r],
          length: 3,
          direction: Direction.S,
        }),
      ]);
    } else {
      tiles = grid.traverse([
        line<TerrainHex>({
          start: [b.q, b.r],
          length: 3,
          direction: Direction.W,
        }),
        line<TerrainHex>({
          start: [b.q, b.r],
          length: 3,
          direction: Direction.E,
        }),
      ]);
    }
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
  const x = action.methodSize?.x ?? 0;
  const y = action.methodSize?.y ?? 0;
  if (x === 0 && y === 0) return base;
  // Expand in battlefield column/row coordinates, clipping to the actual map.
  return grid
    .toArray()
    .filter((tile) =>
      base.some(
        (origin) =>
          Math.abs(tile.col - origin.col) <= x && Math.abs(tile.row - origin.row) <= y,
      ),
    );
};
