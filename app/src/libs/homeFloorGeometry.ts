import polygonClipping, { type MultiPolygon, type Pair } from "polygon-clipping";

import type { HomePoint } from "@/libs/homeRoomGeometry";
import type { FurnitureImageBounds } from "@/validators/itemFurniture";

const { difference, intersection, union } = polygonClipping;

export type HomeFloorRegions = HomePoint[][][];

/** Erode the union, so a footprint can span finish seams but cannot cross a door or wall notch. */
export const getHomeFloorAnchors = (
  regions: HomePoint[][],
  footprint: FurnitureImageBounds,
  bounds: FurnitureImageBounds,
): HomeFloorRegions => {
  const floor = union(
    regions.map((region) => [region.map(({ x, y }): Pair => [x, y])]),
  );
  const corners: Pair[] = [
    [footprint.x, footprint.y],
    [footprint.x + footprint.width, footprint.y],
    [footprint.x + footprint.width, footprint.y + footprint.height],
    [footprint.x, footprint.y + footprint.height],
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
      polygon.map((ring) =>
        ring.map(([x, y]): Pair => [x - footprint.x, y - footprint.y]),
      ),
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

/** Remove occupied anchor rectangles while retaining the floor's exact boundary and components. */
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

export const isPointInHomeFloor = (point: HomePoint, regions: HomeFloorRegions) =>
  regions.some(
    ([outer, ...holes]) =>
      outer &&
      isPointInHomePolygon(point, outer) &&
      !holes.some((hole) => isPointInHomePolygon(point, hole, false)),
  );

/** Boundary-inclusive ray casting also supports the concave artwork's door cutouts. */
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
      Math.abs(cross) <= 1e-6 &&
      point.x >= Math.min(start.x, end.x) - 1e-6 &&
      point.x <= Math.max(start.x, end.x) + 1e-6 &&
      point.y >= Math.min(start.y, end.y) - 1e-6 &&
      point.y <= Math.max(start.y, end.y) + 1e-6
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
