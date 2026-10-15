import { describe, expect, it } from "bun:test";
import { HOME_FURNITURE_MAX_PLACEMENTS, HomeTypes } from "@/drizzle/constants";
import { homeLayoutPlacementError, recoverHomeLayout, type HomeFurniture } from "@/libs/home";
import { boundHomeCamera, getHomeRooms, homeRoomLayoutError, zoomHomeCamera } from "@/libs/homeProperty";
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
});
