import { describe, expect, it } from "bun:test";
import { HOME_FURNITURE_MAX_PLACEMENTS, HomeTypes } from "@/drizzle/constants";
import { clampHomeFurniturePlacement, getHomeFurnitureGeometry, homeLayoutPlacementError, recoverHomeLayout, type HomeFurniture } from "@/libs/home";
import { boundHomeCamera, getHomeOverviewCamera, getHomeRoomCamera, getHomeRooms, homeRoomLayoutError, zoomHomeCamera } from "@/libs/homeProperty";
import { HOME_ART_PLANS } from "@/libs/homeRoomGeometry";
import { homeFurnitureSaveInputSchema } from "@/validators/home";

const piece: HomeFurniture = { id: "chair", itemId: "chair", name: "Chair", image: "/chair.webp", width: 10, groundAnchor: 95, action: null, isFloor: false, quantity: 1, views: {} };
const placement = { id: piece.id, x: 50, y: 50, rotation: 0 as const };

describe("painted home properties", () => {
  it("maps progressively more floors and a decorative and cultivation garden on every tier", () => {
    for (const [tier, homeType] of HomeTypes.entries()) {
      const rooms = getHomeRooms(homeType);
      expect(rooms.filter(({isYard}) => !isYard)).toHaveLength(tier === 0 ? 1 : tier + 1);
      const yard = rooms.find(({isYard})=>isYard)!;
      expect(yard.interior).toHaveLength(4);
      expect(yard.outdoor).toHaveLength(4);
      expect(new Set(rooms.map(({id})=>id)).size).toBe(rooms.length);
      for (const [index, room] of rooms.filter(({isYard})=>!isYard).entries()) {
        const bounds = HOME_ART_PLANS[homeType].floors[index]!;
        const world = room.interior.map(({x,y}) => ({x:room.x+x*room.width/100,y:room.y+y*room.height/100}));
        expect(world[0]!.x).toBeCloseTo(bounds[0]*HOME_ART_PLANS[homeType].size/100);
        expect(world[2]!.y).toBeCloseTo(bounds[3]*HOME_ART_PLANS[homeType].size/100);
      }
      const farm = {...piece, action: "farm" as const};
      const fitted = clampHomeFurniturePlacement({...placement, room:"yard"},farm,homeType);
      expect(fitted).not.toBeNull();
      expect(homeLayoutPlacementError([fitted!],[farm],homeType)).toBeNull();
      expect(homeLayoutPlacementError([{...placement}],[farm],homeType)).toContain("garden");
    }
  });

  it("preserves furniture proportions across differently sized authored rooms", () => {
    for (const homeType of HomeTypes) {
      for (const room of getHomeRooms(homeType)) {
        const image = getHomeFurnitureGeometry(piece,{...placement,room:room.id},homeType).image;
        expect(image.width * room.width / 100).toBeCloseTo(piece.width);
        expect(image.height * room.height / 100).toBeCloseTo(piece.width);
      }
    }
  });

  it("checks collisions within rooms and recovers removed floors into storage", () => {
    const other = { ...piece, id: "other" };
    const layout = [placement, { ...placement, id: other.id, room: "room-1" as const }];
    expect(homeLayoutPlacementError(layout, [piece, other], "TOWN_HOUSE")).toBeNull();
    expect(homeLayoutPlacementError(layout.map((p) => ({ ...p, room: "main" })), [piece, other], "TOWN_HOUSE")).toContain("overlaps");
    expect(recoverHomeLayout(layout, [piece, other], "NONE")).toEqual([placement]);
  });

  it("allows the furniture limit per room and rejects unknown rooms", () => {
    const main = Array.from({ length: HOME_FURNITURE_MAX_PLACEMENTS }, (_, i) => ({ ...placement, id: `main-${i}` }));
    const other = main.map((p) => ({ ...p, id: `other-${p.id}`, room: "room-1" as const }));
    expect(homeFurnitureSaveInputSchema.safeParse({ homeType: "TOWN_HOUSE", revision: 0, placements: [...main, ...other] }).success).toBe(true);
    expect(homeRoomLayoutError([...main, ...other], "TOWN_HOUSE")).toBeNull();
    expect(homeRoomLayoutError([...main, placement], "TOWN_HOUSE")).toContain("up to");
    expect(homeRoomLayoutError(other, "NONE")).toContain("no longer");
  });

  it("fits the complete painting and bounds pan/zoom to its edges", () => {
    for (const homeType of HomeTypes) {
      const size = HOME_ART_PLANS[homeType].size;
      const overview = getHomeOverviewCamera(homeType);
      expect(size*overview.scale).toBeCloseTo(100);
      expect(boundHomeCamera(overview,homeType)).toEqual(overview);
      for (const scale of [0, .3, 1, 10]) {
        const camera = boundHomeCamera({x:9999,y:-9999,scale},homeType);
        expect(camera.scale).toBeGreaterThanOrEqual(overview.scale);
        expect(camera.scale).toBeLessThanOrEqual(1.8);
        expect(camera.x).toBe(0);
        expect(camera.y).toBeCloseTo(100-size*camera.scale);
      }
      for (const room of getHomeRooms(homeType)) {
        const camera = getHomeRoomCamera(homeType,room.id);
        expect(boundHomeCamera(camera,homeType)).toEqual(camera);
        const centerX = camera.x+(room.x+room.width/2)*camera.scale;
        const centerY = camera.y+(room.y+room.height/2)*camera.scale;
        expect(centerX).toBeGreaterThan(0);
        expect(centerX).toBeLessThan(100);
        expect(centerY).toBeGreaterThan(0);
        expect(centerY).toBeLessThan(100);
      }
    }
  });

  it("anchors wheel and pinch zoom to their focal point and follows midpoint translation", () => {
    const camera = { x: -40, y: -50, scale: 0.8 };
    const before = { x: 40, y: 60 };
    for (const after of [before,{x:46,y:57}]) {
      const next = zoomHomeCamera(camera,1.2,before,after);
      expect((after.x-next.x)/next.scale).toBeCloseTo((before.x-camera.x)/camera.scale);
      expect((after.y-next.y)/next.scale).toBeCloseTo((before.y-camera.y)/camera.scale);
    }
  });
});
