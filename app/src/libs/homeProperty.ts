import {
  HOME_FURNITURE_MAX_PLACEMENTS,
  HOME_ROOM_IDS,
  type HomeType,
  HomeTypes,
} from "@/drizzle/constants";
import { HOME_BUILDING_GEOMETRY } from "@/libs/homeRoomGeometry";
import { clamp } from "@/utils/math";
import type { HomePlacement, HomeRoomStyle } from "@/validators/home";

/** Stable identities tie saved placements and finishes to rooms across home tier changes. */
export type HomeRoomId = (typeof HOME_ROOM_IDS)[number];
/** Saved room coordinates share a 100-unit canvas; neighboring floors meet at shared walls. */
export type HomeRoom = {
  id: HomeRoomId;
  name: string;
  x: number;
  y: number;
  width: number;
  isYard: boolean;
};
/** Translation is measured in viewport percentages and applied after scaling the property. */
export type HomeCamera = { x: number; y: number; scale: number };

/** Fit the connected building and its yard into one overview without changing saved placement coordinates. */
export const getHomeOverviewCamera = (homeType: HomeType): HomeCamera => ({
  x: 0,
  y: 0,
  scale: Math.min(
    1,
    100 /
      Math.max(
        ...getHomeRooms(homeType).flatMap(({ x, y, width }) => [x + width, y + 100]),
      ),
  ),
});

/** Keep a room visible while preserving property fits, passages and shared zoom limits. */
export const boundHomeCamera = (camera: HomeCamera, homeType: HomeType): HomeCamera => {
  const rooms = getHomeRooms(homeType);
  const extent = Math.max(...rooms.flatMap(({ x, y, width }) => [x + width, y + 100]));
  const scale = clamp(camera.scale, Math.min(0.3, 100 / extent), 1.8);
  const bounded = {
    scale,
    x: clamp(
      camera.x,
      Math.min(0, 100 - Math.max(...rooms.map((room) => room.x + room.width)) * scale),
      0,
    ),
    y: clamp(
      camera.y,
      Math.min(0, 100 - Math.max(...rooms.map((room) => room.y + 100)) * scale),
      0,
    ),
  };
  // Keep a useful part of a room visible, including while crossing shared walls.
  const overlap = Math.min(100, 100 * scale) / 2 - 2 * scale;
  return rooms
    .map((room) => ({
      scale,
      x: clamp(
        bounded.x,
        overlap - (room.x + room.width) * scale,
        100 - overlap - room.x * scale,
      ),
      y: clamp(
        bounded.y,
        overlap - (room.y + 100) * scale,
        100 - overlap - room.y * scale,
      ),
    }))
    .reduce((nearest, candidate) =>
      Math.hypot(candidate.x - bounded.x, candidate.y - bounded.y) <
      Math.hypot(nearest.x - bounded.x, nearest.y - bounded.y)
        ? candidate
        : nearest,
    );
};

/** Keep the world point under the wheel pointer or pinch midpoint anchored while zooming. */
export const zoomHomeCamera = (
  camera: HomeCamera,
  scale: number,
  before: { x: number; y: number },
  after = before,
): HomeCamera => ({
  scale,
  x: after.x - ((before.x - camera.x) * scale) / camera.scale,
  y: after.y - ((before.y - camera.y) * scale) / camera.scale,
});

/** Stable room IDs preserve the main room on upgrades and make removed rooms unplaced. */
export const getHomeRooms = (homeType: HomeType): HomeRoom[] => {
  const tier = HomeTypes.indexOf(homeType);
  const count = tier === 0 ? 1 : tier + 1;
  const rooms: HomeRoom[] = Array.from({ length: count }, (_, index) => ({
    id: HOME_ROOM_IDS[index] ?? "main",
    name: index === 0 ? "Main room" : `Room ${index + 1}`,
    x: (index % 3) * HOME_BUILDING_GEOMETRY.stepX,
    y: Math.floor(index / 3) * HOME_BUILDING_GEOMETRY.stepY,
    width: 100,
    isYard: false,
  }));
  if (tier > 0)
    rooms.push({
      id: "yard",
      name: "Yard",
      x: 0,
      y: Math.ceil(count / 3) * HOME_BUILDING_GEOMETRY.stepY + 12,
      width: Math.max(...rooms.map(({ x }) => x + 100)),
      isYard: true,
    });
  return rooms;
};

/** Each shared wall is authored once; gaps join adjacent floors through genuine doorways. */
export const getHomeWalls = (homeType: HomeType): HomeWall[] => {
  if (homeType === "NONE") return [];
  const rooms = getHomeRooms(homeType).filter(({ isYard }) => !isYard);
  const walls: HomeWall[] = [];
  const posts = new Map<string, HomeWall>();
  for (const room of rooms) {
    const right = rooms.find(({ x, y }) => x === room.x + 82 && y === room.y);
    const below = rooms.find(({ x, y }) => x === room.x && y === room.y + 67);
    const hasLeft = rooms.some(({ x, y }) => x === room.x - 82 && y === room.y);
    const hasAbove = rooms.some(({ x, y }) => x === room.x && y === room.y - 67);
    const add = (
      kind: HomeWall["kind"],
      x: number,
      y: number,
      width: number,
      height: number,
      owner = room.id,
      isMirrored = false,
    ) => {
      walls.push({
        id: `${room.id}-${kind}-${x}-${y}`,
        room: owner,
        kind,
        x: room.x + x,
        y: room.y + y,
        width,
        height,
        depth: room.y + y + height,
        isMirrored,
      });
    };
    const post = (x: number, y: number) => {
      const id = `${room.x + x}-${room.y + y}`;
      posts.set(id, {
        id,
        room: room.id,
        kind: "post",
        x: room.x + x - 2.5,
        y: room.y + y - 11,
        width: 5,
        height: 11,
        depth: room.y + y + 0.2,
        isMirrored: false,
      });
    };
    if (!hasAbove) {
      add("solid", 10, 9, 27, 11);
      add("window", 37, 9, 30, 11);
      add("solid", 67, 9, 27, 11);
    }
    add("lantern", 17, 12, 4, 9);
    add("lantern", 79, 12, 4, 9);
    if (!hasLeft) add("vertical", 8, 9, 4, 78);
    if (right) {
      add("vertical", 90, 9, 4, 30, right.id);
      add("vertical", 90, 58, 4, 29, right.id);
      post(92, 39);
      post(92, 69);
    } else add("vertical", 90, 9, 4, 78, room.id, true);
    const isEntrance = room.x === 0 && !below;
    if (below || isEntrance) {
      add("solid", 10, 75, 33, 12, below?.id);
      add("solid", 57, 75, 37, 12, below?.id);
      post(42, 87);
      post(58, 87);
    } else add("solid", 10, 75, 84, 12);
    post(10, 20);
    post(92, 20);
    post(10, 87);
    post(92, 87);
  }
  return [...walls, ...posts.values()];
};

/** Placements without an explicit room retain the original main-room coordinates. */
export const getHomePlacementRoom = (
  placement: Pick<HomePlacement, "room">,
): HomeRoomId => placement.room ?? "main";

/** Check tier-specific room membership and per-room capacity before geometry validation. */
export const homeRoomLayoutError = (
  placements: HomePlacement[],
  homeType: HomeType,
) => {
  const rooms = getHomeRooms(homeType);
  for (const placement of placements) {
    if (!rooms.some(({ id }) => id === getHomePlacementRoom(placement)))
      return "This room is no longer part of your home. Refresh and try again";
  }
  for (const room of rooms) {
    if (
      placements.filter((placement) => getHomePlacementRoom(placement) === room.id)
        .length > HOME_FURNITURE_MAX_PLACEMENTS
    )
      return `${room.name} can display up to ${HOME_FURNITURE_MAX_PLACEMENTS} pieces`;
  }
  return null;
};

/** Finishes may be sparse, but each available room can appear at most once. */
export const homeRoomStylesError = (styles: HomeRoomStyle[], homeType: HomeType) => {
  const rooms = getHomeRooms(homeType);
  return new Set(styles.map(({ room }) => room)).size !== styles.length ||
    styles.some(({ room }) => !rooms.some(({ id }) => id === room))
    ? "Choose finishes once for each available room"
    : null;
};

/** Wall faces and furniture share global ground depth; art orientation is never inferred by rotation. */
export type HomeWall = {
  id: string;
  room: HomeRoomId;
  kind: "solid" | "window" | "vertical" | "post" | "lantern";
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  isMirrored: boolean;
};
