import polygonClipping, { type MultiPolygon, type Pair } from "polygon-clipping";

import type { HomePoint } from "@/libs/homeRoomGeometry";
import type { FurnitureImageBounds } from "@/validators/itemFurniture";

const { difference, intersection, union } = polygonClipping;

/** Numerical tolerance shared by floor containment and furniture overlap checks. */
export const HOME_GEOMETRY_EPSILON = 0.000001;

/**
 * Compute legal anchors after joining floor seams and eroding by the footprint.
 * Clipping errors propagate to preserve saved layouts during recovery.
 *
 * @param regions Floor contours in room-local projected coordinates.
 * @param footprint Ground-contact bounds relative to an anchor at (0, 0).
 * @param bounds Allowed anchor rectangle, including the caller's visible-art limits.
 * @returns Components with outer rings and holes; empty when no anchor fits.
 */
export const getHomeFloorAnchors = (
  regions: HomePoint[][],
  footprint: FurnitureImageBounds,
  bounds: FurnitureImageBounds,
): HomeFloorRegions => {
  const floor = union(
    regions.map((region) => [region.map(({ x, y }): Pair => [x, y])]),
  );
  // Clipping discards line/point results. Keep them as thin areas, limiting
  // boundary drift to half the polygon tolerance to leave room for rounding.
  // Every edge's L1 length is at most twice this coordinate scale.
  const coordinateScale = Math.max(
    1,
    ...floor.flat(2).map(([x, y]) => Math.abs(x) + Math.abs(y)),
  );
  const inset = Math.min(
    HOME_GEOMETRY_EPSILON / (4 * coordinateScale),
    footprint.width / 4,
    footprint.height / 4,
  );
  // Reuse the corner so coincident sweep and floor edges round identically.
  const left = footprint.x + inset;
  const top = footprint.y + inset;
  const corners: Pair[] = [
    [left, top],
    [footprint.x + footprint.width - inset, top],
    [footprint.x + footprint.width - inset, footprint.y + footprint.height - inset],
    [left, footprint.y + footprint.height - inset],
  ];
  // Each boundary swept by the reflected footprint is forbidden anchor space. Unlike
  // half-plane clipping, subtracting these sweeps preserves concave and disconnected floors.
  const sweeps = floor.flatMap((polygon) =>
    polygon.flatMap((ring) =>
      ring
        .slice(1)
        .map((end, index) => [
          convexHull(
            [ring[index] ?? end, end].flatMap(([x, y]) =>
              corners.map(([dx, dy]): Pair => [x - dx, y - dy]),
            ),
          ),
        ]),
    ),
  );
  const allowed = intersection(
    floor.map((polygon) =>
      polygon.map((ring) => ring.map(([x, y]): Pair => [x - left, y - top])),
    ),
    [
      [
        [bounds.x, bounds.y],
        [bounds.x + bounds.width, bounds.y],
        [bounds.x + bounds.width, bounds.y + bounds.height],
        [bounds.x, bounds.y + bounds.height],
      ],
    ],
  );
  const result: MultiPolygon = sweeps.length ? difference(allowed, ...sweeps) : allowed;
  return result.map((polygon) =>
    polygon.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))),
  );
};

/**
 * Subtract forbidden anchor rectangles from the already eroded floor regions.
 * Callers expand occupied footprints for the moving piece and account for touching tolerance.
 * Clipping errors propagate, as in getHomeFloorAnchors.
 */
export const subtractHomeFloorBounds = (
  regions: HomeFloorRegions,
  bounds: FurnitureImageBounds[],
): HomeFloorRegions => {
  const floor = regions.map((polygon) =>
    polygon.map((ring) => ring.map(({ x, y }): Pair => [x, y])),
  );
  const obstacles = bounds.map(({ x, y, width, height }): Pair[][] => [
    [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
  ]);
  return difference(floor, obstacles).map((polygon) =>
    polygon.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))),
  );
};

/** Accept boundary contact across all components while excluding hole interiors. */
export const isPointInHomeFloor = (point: HomePoint, regions: HomeFloorRegions) =>
  regions.some(
    ([outer, ...holes]) =>
      outer &&
      isPointInHomePolygon(point, outer) &&
      !holes.some((hole) => isPointInHomePolygon(point, hole, false)),
  );

/** Ray-cast a possibly concave ring; includeBoundary controls tolerant edge contact. */
export const isPointInHomePolygon = (
  point: HomePoint,
  polygon: readonly HomePoint[],
  includeBoundary = true,
) => {
  if (polygon.length < 3) return false;
  let inside = false;
  for (const [index, start] of polygon.entries()) {
    const end = polygon[(index + 1) % polygon.length] ?? start;
    const cross =
      (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
    if (
      Math.abs(cross) <= HOME_GEOMETRY_EPSILON &&
      point.x >= Math.min(start.x, end.x) - HOME_GEOMETRY_EPSILON &&
      point.x <= Math.max(start.x, end.x) + HOME_GEOMETRY_EPSILON &&
      point.y >= Math.min(start.y, end.y) - HOME_GEOMETRY_EPSILON &&
      point.y <= Math.max(start.y, end.y) + HOME_GEOMETRY_EPSILON
    )
      return includeBoundary;
    if (
      start.y > point.y !== end.y > point.y &&
      point.x < start.x + ((point.y - start.y) * (end.x - start.x)) / (end.y - start.y)
    )
      inside = !inside;
  }
  return inside;
};

/** Monotone-chain hull for temporary sweep vertices; sorts its input in place. */
const convexHull = (points: Pair[]): Pair[] => {
  const sorted = points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Pair, b: Pair, c: Pair) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (values: Pair[]) => {
    const hull: Pair[] = [];
    for (const point of values) {
      while (
        hull.length > 1 &&
        cross(hull[hull.length - 2] ?? point, hull[hull.length - 1] ?? point, point) <=
          0
      )
        hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
};

/** Room-local polygon components as [outer, ...holes], without repeated closing vertices. */
export type HomeFloorRegions = HomePoint[][][];
