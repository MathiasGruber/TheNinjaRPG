import {
  HOME_FURNITURE_MAX_PLACEMENTS,
  HOME_ROOM_IDS,
  type HomeType,
  HomeTypes,
} from "@/drizzle/constants";
import { clamp } from "@/utils/math";
import type { HomePlacement, HomeRoomStyle } from "@/validators/home";

/** Stable identities tie saved placements and finishes to rooms across home tier changes. */
export type HomeRoomId = (typeof HOME_ROOM_IDS)[number];
/** Room origins use scene percentages; each tile spans 100 units with a four-unit passage. */
export type HomeRoom = {
  id: HomeRoomId;
  name: string;
  x: number;
  y: number;
  isYard: boolean;
};
/** Translation is measured in viewport percentages and applied after scaling the property. */
export type HomeCamera = { x: number; y: number; scale: number };

/** Keep the viewport over the property while preserving the shared zoom limits. */
export const boundHomeCamera = (camera: HomeCamera, homeType: HomeType): HomeCamera => {
  const rooms = getHomeRooms(homeType);
  const scale = clamp(camera.scale, 0.3, 1.8);
  return {
    scale,
    x: clamp(
      camera.x,
      Math.min(0, 100 - Math.max(...rooms.map((room) => room.x + 100)) * scale),
      0,
    ),
    y: clamp(
      camera.y,
      Math.min(0, 100 - Math.max(...rooms.map((room) => room.y + 100)) * scale),
      0,
    ),
  };
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
  const tier = HomeTypes.indexOf(homeType) - HomeTypes.indexOf("TOWN_HOUSE");
  const count = tier < 0 ? 1 : tier + 2;
  const rooms: HomeRoom[] = Array.from({ length: count }, (_, index) => ({
    id: HOME_ROOM_IDS[index] ?? "main",
    name: index === 0 ? "Main room" : `Room ${index + 1}`,
    x: (index % 3) * 104,
    y: Math.floor(index / 3) * 104,
    isYard: false,
  }));
  if (tier >= 0)
    rooms.push({
      id: "yard",
      name: "Yard",
      x: 0,
      y: Math.ceil(count / 3) * 104,
      isYard: true,
    });
  return rooms;
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
