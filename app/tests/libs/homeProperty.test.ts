import { describe, expect, it } from "bun:test";
import { HOME_FURNITURE_MAX_PLACEMENTS, HomeTypes } from "@/drizzle/constants";
import { clampHomeFurniturePlacement, getHomeFurnitureGeometry, homeLayoutPlacementError, recoverHomeLayout, type HomeFurniture } from "@/libs/home";
import { boundHomeCamera, getHomeOverviewCamera, getHomeRoomCamera, getHomeRooms, homeRoomLayoutError, zoomHomeCamera } from "@/libs/homeProperty";
import { HOME_ART_PLANS } from "@/libs/homeRoomGeometry";
import { homeFurnitureSaveInputSchema } from "@/validators/home";

const piece: HomeFurniture = { id: "chair", itemId: "chair", name: "Chair", image: "/chair.webp", width: 10, groundAnchor: 95, action: null, isFloor: false, quantity: 1, views: {} };
const placement = { id: piece.id, x: 50, y: 50, rotation: 0 as const };

describe("painted home properties", () => {
  it("retains each tier's room capacity and separates decoration from cultivation", () => {
    for (const [tier, homeType] of HomeTypes.entries()) {
      const rooms = getHomeRooms(homeType);
      expect(rooms.filter(({isYard}) => !isYard)).toHaveLength([1, 2, 3, 4, 5, 8, 9, 10][tier]!);
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

  it.each([
    { homeType: "NONE", room: 0, wall: [461, 300], floor: [484, 300] },
    { homeType: "NONE", room: 0, wall: [982, 360], floor: [970, 360] },
    { homeType: "STUDIO_APARTMENT", room: 0, wall: [285, 480], floor: [300, 480] },
    { homeType: "STUDIO_APARTMENT", room: 1, wall: [1197, 480], floor: [1180, 480] },
    { homeType: "ONE_BED_APARTMENT", room: 0, wall: [278, 220], floor: [285, 220] },
    { homeType: "ONE_BED_APARTMENT", room: 1, wall: [1186, 180], floor: [1175, 180] },
    { homeType: "TWO_BED_HOUSE", room: 0, wall: [254, 480], floor: [280, 480] },
    { homeType: "TWO_BED_HOUSE", room: 1, wall: [500, 377], floor: [500, 362] },
    { homeType: "TWO_BED_HOUSE", room: 2, wall: [997, 350], floor: [950, 355] },
    { homeType: "TWO_BED_HOUSE", room: 0, wall: [700, 625], floor: [700, 610] },
    { homeType: "TOWN_HOUSE", room: 2, wall: [225, 525], floor: [255, 525] },
    { homeType: "TOWN_HOUSE", room: 1, wall: [514, 310], floor: [507, 310] },
    { homeType: "TOWN_HOUSE", room: 4, wall: [1230, 550], floor: [1200, 550] },
    { homeType: "MANSION", room: 1, wall: [15, 40], floor: [20, 40], normalized: true },
    { homeType: "MANSION", room: 3, wall: [40, 42], floor: [45, 40], normalized: true },
    { homeType: "MANSION", room: 7, wall: [71, 55], floor: [77, 55], normalized: true },
    { homeType: "PALACE", room: 2, wall: [36, 35], floor: [30, 35], normalized: true },
    { homeType: "PALACE", room: 8, wall: [74, 48], floor: [65, 48], normalized: true },
    { homeType: "MARSHMALLOWOPOLIS", room: 0, wall: [42, 33], floor: [50, 33], normalized: true },
    { homeType: "MARSHMALLOWOPOLIS", room: 9, wall: [61, 45], floor: [58, 45], normalized: true },
  ] as const)("keeps $homeType room $room finishes off measured walls and fixtures", (sample) => {
    const { homeType, room, wall, floor } = sample;
    const normalized = "normalized" in sample;
    for (const [point, expected] of [[wall, false], [floor, true]] as const) {
      const x = normalized ? point[0] : point[0] * 100 / 1448;
      const y = normalized ? point[1] : point[1] * 100 / 1086;
      expect(HOME_ART_PLANS[homeType].floorSurfaces[room]!.some((polygon) => containsArtPoint(polygon, x, y))).toBe(expected);
    }
  });

  it("finishes Mansion Room 2 to its wall joins without foreground restoring the floor", () => {
    const plan = HOME_ART_PLANS.MANSION;
    // Source-art landmarks beside the back, side and front wall joins, including both sides of the door.
    for (const point of [[275, 363], [255, 480], [446, 380], [432, 430], [440, 480], [400, 495]] as const) {
      expect(containsSourceLandmark(plan.floorSurfaces[1]!, point)).toBe(true);
      expect(containsSourceLandmark(plan.foreground.map(({ polygon }) => polygon), point)).toBe(false);
    }
    // Preserve the open door leaf, timber frame, baseboard and front wall.
    for (const point of [[445, 433], [456, 405], [455, 480], [250, 420], [350, 351], [350, 506]] as const) {
      expect(containsSourceLandmark(plan.floorSurfaces[1]!, point)).toBe(false);
    }
    expect(containsSourceLandmark(plan.foreground.map(({ polygon }) => polygon), [350, 506])).toBe(true);
  });

  it.each([
    { homeType: "MANSION", room: 2, floor: [[255, 565], [350, 562], [486, 620], [490, 650]], architecture: [[350, 543], [256, 541], [480, 575], [510, 614], [350, 664]] },
    { homeType: "MANSION", room: 7, floor: [[1085, 612], [1100, 605], [1110, 532], [1250, 620]], architecture: [[1085, 563], [1070, 604], [1090, 640], [1248, 515]] },
    { homeType: "PALACE", room: 0, floor: [[735, 398], [800, 398], [710, 390], [824, 390]], architecture: [[710, 398], [824, 398]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 0, floor: [[735, 398], [800, 398], [710, 390], [824, 390]], architecture: [[710, 398], [824, 398]] },
  ] as const)("traces $homeType room $room finishes around source-art doors, lamps and post caps", ({ homeType, room, floor, architecture }) => {
    const plan = HOME_ART_PLANS[homeType];
    for (const point of floor) {
      expect(containsSourceLandmark(plan.floorSurfaces[room]!, point)).toBe(true);
      expect(containsSourceLandmark(plan.foreground.map(({ polygon }) => polygon), point)).toBe(false);
    }
    for (const point of architecture) {
      expect(containsSourceLandmark(plan.floorSurfaces[room]!, point)).toBe(false);
    }
  });

  it.each([
    { homeType: "MANSION", room: 5, points: [[920, 520], [920, 580]] },
    { homeType: "MANSION", room: 6, points: [[1045, 380], [1200, 478]] },
    { homeType: "PALACE", room: 5, points: [[580, 330], [620, 360]] },
    { homeType: "PALACE", room: 6, points: [[950, 330], [900, 480]] },
    { homeType: "PALACE", room: 3, points: [[380, 470], [380, 520]] },
    { homeType: "PALACE", room: 7, points: [[1156, 470], [1156, 520]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 9, points: [[950, 330], [900, 480]] },
  ] as const)("finishes the $homeType room $room corridors and wall joins", ({ homeType, room, points }) => {
    const plan = HOME_ART_PLANS[homeType];
    for (const point of points) {
      expect(containsSourceLandmark(plan.floorSurfaces[room]!, point)).toBe(true);
      expect(containsSourceLandmark(plan.foreground.map(({ polygon }) => polygon), point)).toBe(false);
    }
  });

  it("keeps neighboring Mansion floors separate beside the open door", () => {
    const point = [481, 595] as const;
    const covered = HOME_ART_PLANS.MANSION.floorSurfaces.flatMap((surfaces, room) => containsSourceLandmark(surfaces, point) ? [room] : []);
    expect(covered).toEqual([2]);
  });

  it.each([
    { homeType: "MANSION", point: { x: 44.75, y: 32.25 } },
    { homeType: "MANSION", point: { x: 75, y: 66 } },
    { homeType: "PALACE", point: { x: 44.5, y: 25.25 } },
    { homeType: "PALACE", point: { x: 14.75, y: 35.25 } },
    { homeType: "MARSHMALLOWOPOLIS", point: { x: 26, y: 28.75 } },
  ] as const)("keeps $homeType window and timber landmarks out of wall paint", ({ homeType, point }) => {
    const masks = HOME_ART_PLANS[homeType].paint.flat();
    expect(masks.some((polygon) => containsArtPoint(polygon, point.x, point.y))).toBe(false);
  });

  it.each([
    { homeType: "NONE", room: 0, walls: [[500, 110], [445, 260], [500, 535]], fixtures: [[580, 123], [480, 140], [995, 355]] },
    { homeType: "STUDIO_APARTMENT", room: 0, walls: [[350, 150], [275, 250], [400, 580]], fixtures: [[575, 155], [310, 160], [823, 155]] },
    { homeType: "ONE_BED_APARTMENT", room: 2, walls: [[1000, 405], [1248, 416], [1000, 620]], fixtures: [[1215, 418], [1250, 475]] },
    { homeType: "TWO_BED_HOUSE", room: 0, walls: [[680, 390], [235, 530], [400, 625]], fixtures: [[273, 402], [595, 640]] },
    { homeType: "TOWN_HOUSE", room: 2, walls: [[350, 448], [230, 535], [400, 660]], fixtures: [[244, 455], [190, 630]] },
    { homeType: "TOWN_HOUSE", room: 3, walls: [[980, 200], [1210, 280]], fixtures: [[1195, 203]] },
    { homeType: "MANSION", room: 1, walls: [[430, 330], [246, 380], [240, 475]], fixtures: [[340, 330], [265, 340]] },
    { homeType: "MANSION", room: 2, walls: [[350, 535], [235, 575], [270, 695]], fixtures: [[255, 540], [350, 695]] },
    { homeType: "PALACE", room: 3, walls: [[255, 350], [224, 380], [223, 505]], fixtures: [[295, 350], [218, 465]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 8, walls: [[1000, 455], [980, 595], [1090, 595]], fixtures: [[1030, 595], [935, 555]] },
  ] as const)("covers $homeType room $room wall faces while preserving windows and lamps", ({ homeType, room, walls, fixtures }) => {
    const [width, height] = HOME_ART_PLANS[homeType].aspectRatio === 3 / 2 ? [1536, 1024] : [1448, 1086];
    for (const [landmarks, expected] of [[walls, true], [fixtures, false]] as const) {
      for (const [x, y] of landmarks) {
        expect(HOME_ART_PLANS[homeType].paint[room]!.some((polygon) => containsArtPoint(polygon, x * 100 / width, y * 100 / height))).toBe(expected);
      }
    }
  });

  it.each([
    { homeType: "MANSION", point: [37, 64], room: 4 },
    { homeType: "PALACE", point: [39, 38.5], room: 5 },
    { homeType: "MARSHMALLOWOPOLIS", point: [60, 38.5], room: 9 },
  ] as const)("assigns shared $homeType wall faces to only room $room", ({ homeType, point, room }) => {
    const paintedRooms = HOME_ART_PLANS[homeType].paint.flatMap((panels, index) => panels.some((polygon) => containsArtPoint(polygon, point[0], point[1])) ? [index] : []);
    expect(paintedRooms).toEqual([room]);
  });

  it.each([...HomeTypes])("allows indoor action furniture on the %s lawn while keeping the cultivation plot separate", (homeType) => {
    for (const action of ["sleep", "storage", "kitchen"] as const) {
      const furniture = { ...piece, action };
      const lawn = clampHomeFurniturePlacement({ ...placement, room: "yard" }, furniture, homeType);
      expect(lawn).not.toBeNull();
      expect(homeLayoutPlacementError([lawn!], [furniture], homeType)).toBeNull();
      expect(homeLayoutPlacementError([lawn!], [{ ...furniture, action: "farm" }], homeType)).toContain("outside");
    }
  });

  it("preserves furniture proportions across differently sized authored rooms", () => {
    for (const homeType of HomeTypes) {
      for (const room of getHomeRooms(homeType)) {
        const image = getHomeFurnitureGeometry(piece,{...placement,room:room.id},homeType).image;
        expect(image.width * room.width / 100).toBeCloseTo(piece.width);
        expect(image.height * room.height / 100).toBeCloseTo(piece.width * (HOME_ART_PLANS[homeType].aspectRatio ?? 4 / 3) / (4 / 3));
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

/** Check a 1536x1024 artwork pixel against percentage contours, including concave masks. */
const containsSourceLandmark = (polygons: readonly (readonly (readonly [number, number])[])[], [x, y]: readonly [number, number]) => {
  return polygons.some((polygon) => containsArtPoint(polygon, x * 100 / 1536, y * 100 / 1024));
};

/** Ray casting supports concave artwork masks and paint's connected lamp cutouts. */
const containsArtPoint = (polygon: readonly (readonly [number, number])[], x: number, y: number) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [ax, ay] = polygon[index]!;
    const [bx, by] = polygon[previous]!;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
};
