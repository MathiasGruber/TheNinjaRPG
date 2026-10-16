import { describe, expect, it } from "bun:test";
import { HOME_FURNITURE_MAX_PLACEMENTS, type HomeType, HomeTypes } from "@/drizzle/constants";
import { homeLayoutPlacementError, recoverHomeLayout, type HomeFurniture } from "@/libs/home";
import { boundHomeCamera, getHomeRooms, type HomeCamera, homeRoomLayoutError, zoomHomeCamera } from "@/libs/homeProperty";
import { homeFurnitureSaveInputSchema } from "@/validators/home";

const piece: HomeFurniture = { id: "chair", itemId: "chair", name: "Chair", image: "/chair.webp", width: 10, groundAnchor: 95, action: null, isFloor: false, quantity: 1, views: {} };
const placement = { id: piece.id, x: 50, y: 50, rotation: 0 as const };

describe("home properties", () => {
  it("keeps smaller homes fixed and adds an indoor room at every tier from Town House", () => {
    let previousCount = 1;
    for (const tier of HomeTypes) {
      const rooms = getHomeRooms(tier);
      if (HomeTypes.indexOf(tier) < HomeTypes.indexOf("TOWN_HOUSE")) expect(rooms).toHaveLength(1);
      else {
        expect(rooms.filter(({ isYard }) => !isYard)).toHaveLength(previousCount + 1);
        expect(rooms.filter(({ isYard }) => isYard)).toHaveLength(1);
        previousCount++;
      }
      expect(new Set(rooms.map(({ id }) => id)).size).toBe(rooms.length);
    }
  });

  it("checks collisions within a room and retains decoration in separate rooms", () => {
    const other = { ...piece, id: "other" };
    const rooms = [placement, { ...placement, id: other.id, room: "room-1" as const }];
    expect(homeLayoutPlacementError(rooms, [piece, other], "TOWN_HOUSE")).toBeNull();
    expect(homeLayoutPlacementError(rooms.map((p) => ({ ...p, room: "main" })), [piece, other], "TOWN_HOUSE")).toContain("overlaps");
    expect(recoverHomeLayout(rooms, [piece, other], "TWO_BED_HOUSE")).toEqual([placement]);
  });

  it("allows the full furniture limit in each room and rejects unknown rooms", () => {
    const main = Array.from({ length: HOME_FURNITURE_MAX_PLACEMENTS }, (_, i) => ({ ...placement, id: `main-${i}` }));
    const other = main.map((p) => ({ ...p, id: `other-${p.id}`, room: "room-1" as const }));
    expect(homeFurnitureSaveInputSchema.safeParse({ homeType: "TOWN_HOUSE", revision: 0, placements: [...main, ...other] }).success).toBe(true);
    expect(homeRoomLayoutError([...main, ...other], "TOWN_HOUSE")).toBeNull();
    expect(homeRoomLayoutError([...main, placement], "TOWN_HOUSE")).toContain("up to");
    expect(homeRoomLayoutError(other, "NONE")).toContain("no longer");
  });

  it("allows yard decoration separately from farm beds", () => {
    const yard = { ...placement, room: "yard" as const };
    expect(homeLayoutPlacementError([yard], [piece], "TOWN_HOUSE")).toBeNull();
    expect(homeLayoutPlacementError([yard], [{ ...piece, action: "farm" }], "TOWN_HOUSE")).toContain("outside");
  });

  it("anchors wheel and pinch zoom to their focal point and follows midpoint translation", () => {
    const camera = { x: -40, y: -50, scale: 0.8 };
    const focal = { x: 40, y: 60 };
    const wheel = zoomHomeCamera(camera, 1.2, focal);
    expect((focal.x - wheel.x) / wheel.scale).toBeCloseTo((focal.x - camera.x) / camera.scale);
    expect((focal.y - wheel.y) / wheel.scale).toBeCloseTo((focal.y - camera.y) / camera.scale);
    const moved = { x: 46, y: 57 };
    const pinch = zoomHomeCamera(camera, 1.2, focal, moved);
    expect((moved.x - pinch.x) / pinch.scale).toBeCloseTo((focal.x - camera.x) / camera.scale);
    expect((moved.y - pinch.y) / pinch.scale).toBeCloseTo((focal.y - camera.y) / camera.scale);
    expect(boundHomeCamera({ x: 9999, y: -9999, scale: 0.5 }, "TOWN_HOUSE")).toEqual({ x: 0, y: -2, scale: 0.5 });
  });

  it("keeps a substantial part of a room visible at every property boundary and zoom", () => {
    for (const homeType of HomeTypes) {
      for (const scale of [0.3, 0.5, 1, 1.8]) {
        for (const x of [-9999, 0, 9999]) {
          for (const y of [-9999, 0, 9999]) {
            const camera = boundHomeCamera({ x, y, scale }, homeType);
            // A fifth of the smaller room/viewport area keeps more than an edge sliver visible.
            expect(visibleRoomArea(camera, homeType)).toBeGreaterThanOrEqual(
              Math.min(100, 100 * scale) ** 2 / 5,
            );
          }
        }
      }
    }
    let camera = { x: -208, y: 0, scale: 1 };
    for (let step = 0; step < 6; step++) {
      camera = boundHomeCamera({ ...camera, y: camera.y - 10 }, "SMALL_MANSION");
    }
    expect(camera.x).toBe(-208);
    expect(visibleRoomArea(camera, "SMALL_MANSION")).toBeGreaterThan(2000);
  });

  it("preserves room shortcuts and zoomed-out property fits with an unoccupied viewport center", () => {
    for (const homeType of HomeTypes) {
      for (const room of getHomeRooms(homeType)) {
        const camera = { x: -room.x || 0, y: -room.y || 0, scale: 1 };
        expect(boundHomeCamera(camera, homeType)).toEqual(camera);
      }
    }
    const camera = { x: 0, y: 0, scale: 0.3 };
    const rooms = getHomeRooms("SMALL_MANSION");
    expect(rooms.some((room) =>
      room.x <= 50 / camera.scale && room.x + 100 >= 50 / camera.scale &&
      room.y <= 50 / camera.scale && room.y + 100 >= 50 / camera.scale,
    )).toBe(false);
    expect(boundHomeCamera(camera, "SMALL_MANSION")).toEqual(camera);
  });

  it("pans continuously across horizontal and vertical room passages", () => {
    for (const homeType of HomeTypes) {
      const rooms = getHomeRooms(homeType);
      for (const room of rooms) {
        const neighbors = rooms.filter((other) =>
          (other.x === room.x + 104 && other.y === room.y) ||
          (other.y === room.y + 104 && other.x === room.x),
        );
        for (const neighbor of neighbors) {
          for (const scale of [1, 1.8]) {
            for (let step = 0; step <= 104; step++) {
              const camera = {
                x: 50 - (room.x + 50 + (neighbor.x - room.x) * step / 104) * scale,
                y: 50 - (room.y + 50 + (neighbor.y - room.y) * step / 104) * scale,
                scale,
              };
              const bounded = boundHomeCamera(camera, homeType);
              expect(bounded.x).toBeCloseTo(camera.x);
              expect(bounded.y).toBeCloseTo(camera.y);
            }
          }
        }
      }
    }
  });

  it("preserves wheel and moving pinch focal points inside the property boundaries", () => {
    const camera = { x: -104, y: 0, scale: 1 };
    const focal = { x: 50, y: 50 };
    for (const after of [focal, { x: 46, y: 57 }]) {
      const zoomed = boundHomeCamera(zoomHomeCamera(camera, 1.2, focal, after), "SMALL_MANSION");
      expect((after.x - zoomed.x) / zoomed.scale).toBeCloseTo((focal.x - camera.x) / camera.scale);
      expect((after.y - zoomed.y) / zoomed.scale).toBeCloseTo((focal.y - camera.y) / camera.scale);
    }
  });
});

const visibleRoomArea = (camera: HomeCamera, homeType: HomeType) => Math.max(
  ...getHomeRooms(homeType).map((room) => {
    const width = Math.max(0, Math.min(100, camera.x + (room.x + 100) * camera.scale) - Math.max(0, camera.x + room.x * camera.scale));
    const height = Math.max(0, Math.min(100, camera.y + (room.y + 100) * camera.scale) - Math.max(0, camera.y + room.y * camera.scale));
    return width * height;
  }),
);
