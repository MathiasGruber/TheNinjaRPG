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
    { homeType: "MANSION", room: 4, floor: [[490, 500], [530, 540], [530, 580], [490, 505], [500, 505], [525, 505], [527, 530], [526, 560], [525, 585], [525, 610]], architecture: [[490, 550], [490, 570], [503, 530], [508, 520], [480, 585], [490, 510], [500, 510], [510, 505], [516, 530], [520, 515], [521, 560], [520, 600], [518, 620]] },
    { homeType: "MANSION", room: 5, floor: [[920, 430], [950, 450], [1000, 440], [1005, 410], [1007, 430], [1008, 440], [1010, 450], [1010, 460], [948, 475], [958, 475], [962, 477], [980, 470], [980, 475], [1000, 470], [1000, 475], [1008, 475], [1045, 550], [1047, 580], [1048, 600], [1050, 620], [986, 625], [987, 640], [989, 650], [1000, 640], [1030, 645], [1000, 652], [1055, 640], [1056, 650]], architecture: [[920, 470], [930, 475], [912, 490], [940, 450], [1030, 440], [1025, 420], [1030, 460], [1010, 410], [1016, 430], [1015, 450], [1014, 460], [950, 480], [960, 480], [980, 485], [1000, 480], [1014, 475], [1020, 470], [1030, 475], [1055, 550], [1058, 580], [1060, 590], [1070, 604], [1070, 615], [1070, 625], [1080, 620], [1058, 625], [980, 625], [983, 640], [985, 650], [1058, 640], [1059, 650], [1070, 635], [1070, 650], [1080, 640], [1082, 650], [1000, 656]] },
    { homeType: "MANSION", room: 6, floor: [[1054, 467], [1059, 472], [1065, 478]], architecture: [[1047, 467], [1046, 477], [1059, 485], [1030, 472]] },
    { homeType: "MANSION", room: 7, floor: [[1085, 612], [1100, 605], [1110, 532], [1250, 620], [1082, 530], [1091, 540], [1100, 550], [1098, 570], [1096, 590], [1100, 594], [1083, 593], [1090, 600]], architecture: [[1085, 563], [1070, 604], [1090, 640], [1248, 515], [1076, 530], [1085, 540], [1094, 552], [1092, 575], [1083, 589], [1088, 595], [1090, 596], [1078, 615]] },
    { homeType: "PALACE", room: 0, floor: [[735, 398], [800, 398], [710, 390], [824, 390]], architecture: [[710, 398], [824, 398]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 0, floor: [[735, 398], [800, 398], [710, 390], [824, 390]], architecture: [[710, 398], [824, 398]] },
    { homeType: "PALACE", room: 4, floor: [[580, 550], [582, 550], [578, 553], [580, 556]], architecture: [[575, 560], [590, 500], [585, 554], [578, 560]] },
    { homeType: "PALACE", room: 8, floor: [[950, 482], [955, 510], [959, 536], [951, 548], [960, 556]], architecture: [[940, 482], [945, 510], [945, 536], [950, 554], [960, 562]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 4, floor: [[580, 550], [582, 550], [578, 553], [580, 556]], architecture: [[575, 560], [590, 500], [585, 554], [578, 560]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 8, floor: [[950, 482], [955, 510], [959, 536], [951, 548], [960, 556]], architecture: [[940, 482], [945, 510], [945, 536], [950, 554], [960, 562]] },
    { homeType: "PALACE", room: 5, floor: [[580, 420], [613, 450], [615, 474], [612, 490]], architecture: [[580, 450], [595, 440], [597, 450], [597, 474], [608, 440], [610, 468], [605, 490]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 5, floor: [[580, 420], [613, 450], [615, 474], [612, 490]], architecture: [[580, 450], [595, 440], [597, 450], [597, 474], [608, 440], [610, 468], [605, 490]] },
    { homeType: "PALACE", room: 6, floor: [[925, 420], [925, 440], [923, 450], [922, 474], [927, 490]], architecture: [[932, 440], [933, 450], [932, 474], [930, 440], [927, 470], [932, 490]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 9, floor: [[925, 420], [925, 440], [923, 450], [922, 474], [927, 490]], architecture: [[932, 440], [933, 450], [932, 474], [930, 440], [927, 470], [932, 490]] },
    { homeType: "PALACE", room: 3, floor: [[380, 442], [366, 442], [364, 448]], architecture: [[380, 420], [361, 442], [363, 445]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 3, floor: [[380, 442], [366, 442], [364, 448]], architecture: [[380, 420], [361, 442], [363, 445]] },
    { homeType: "PALACE", room: 7, floor: [[1156, 442], [1171, 443], [1170, 448]], architecture: [[1156, 420], [1173, 443], [1175, 446]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 7, floor: [[1156, 442], [1171, 443], [1170, 448]], architecture: [[1156, 420], [1173, 443], [1175, 446]] },
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

  it("preserves Mansion's entrance arch and post caps in front of furniture", () => {
    const plan = HOME_ART_PLANS.MANSION;
    const foreground = plan.foreground.map(({ polygon }) => polygon);
    for (const point of [[760, 605], [665, 585], [835, 585]] as const) {
      expect(containsSourceLandmark(plan.floorSurfaces[0]!, point)).toBe(false);
      expect(containsSourceLandmark(foreground, point)).toBe(true);
    }
    for (const point of [[760, 575], [875, 610]] as const) {
      expect(containsSourceLandmark(plan.floorSurfaces[0]!, point)).toBe(true);
      expect(containsSourceLandmark(foreground, point)).toBe(false);
    }
  });

  it.each(["PALACE", "MARSHMALLOWOPOLIS"] as const)("finishes %s floors to their baseboards and front rails", (homeType) => {
    const plan = HOME_ART_PLANS[homeType];
    const foreground = plan.foreground.map(({ polygon }) => polygon);
    for (const { room, points } of [
      { room: 0, points: [[768, 278]] },
      { room: 1, points: [[731, 520], [805, 520]] },
      { room: 2, points: [[500, 422], [380, 420]] },
      { room: 3, points: [[230, 390]] },
      { room: 4, points: [[500, 473], [500, 563]] },
      { room: 5, points: [[620, 414], [650, 510]] },
      { room: 6, points: [[1030, 422], [1156, 420]] },
      { room: 7, points: [[1330, 430]] },
      { room: 8, points: [[1020, 473], [1020, 563]] },
      { room: homeType === "PALACE" ? 6 : 9, points: [[900, 414], [880, 510]] },
    ] as const) {
      for (const point of points) {
        expect(containsSourceLandmark(plan.floorSurfaces[room]!, point)).toBe(true);
        expect(containsSourceLandmark(foreground, point)).toBe(false);
      }
    }
    for (const { room, point } of [
      { room: 1, point: [768, 520] },
      { room: 2, point: [410, 427] },
      { room: 5, point: [625, 508] },
    ] as const) {
      expect(containsSourceLandmark(plan.floorSurfaces[room]!, point)).toBe(false);
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
    { homeType: "PALACE", room: 3, walls: [[255, 350], [233, 515]], fixtures: [[295, 350], [218, 465], [223, 375], [223, 505]] },
    { homeType: "STUDIO_APARTMENT", room: 0, walls: [[248, 450]], fixtures: [[260, 393]] },
    { homeType: "STUDIO_APARTMENT", room: 1, walls: [[1218, 460]], fixtures: [[1207, 410]] },
    { homeType: "ONE_BED_APARTMENT", room: 0, walls: [[230, 380], [213, 550]], fixtures: [[237, 345], [226, 421], [218, 530]] },
    { homeType: "ONE_BED_APARTMENT", room: 1, walls: [[1208, 225]], fixtures: [[1218, 253]] },
    { homeType: "ONE_BED_APARTMENT", room: 2, walls: [[1261, 555]], fixtures: [[1253, 555]] },
    { homeType: "TWO_BED_HOUSE", room: 0, walls: [[230, 540]], fixtures: [[238, 519]] },
    { homeType: "TWO_BED_HOUSE", room: 1, walls: [[250, 325]], fixtures: [[261, 315]] },
    { homeType: "TWO_BED_HOUSE", room: 2, walls: [[1195, 325]], fixtures: [[1194, 311]] },
    { homeType: "TWO_BED_HOUSE", room: 3, walls: [[1213, 540]], fixtures: [[1209, 502]] },
    { homeType: "TOWN_HOUSE", room: 0, walls: [[576, 663], [860, 663]], fixtures: [[576, 643], [860, 643]] },
    { homeType: "TOWN_HOUSE", room: 1, walls: [[223, 387], [300, 202]], fixtures: [[225, 378], [314, 202]] },
    { homeType: "TOWN_HOUSE", room: 2, walls: [[212, 626], [400, 670]], fixtures: [[222, 611], [400, 643]] },
    { homeType: "TOWN_HOUSE", room: 3, walls: [[1228, 378], [1150, 204]], fixtures: [[1221, 373], [1134, 204]] },
    { homeType: "TOWN_HOUSE", room: 4, walls: [[1228, 625], [1100, 670]], fixtures: [[1230, 616], [1100, 643]] },
    { homeType: "MANSION", room: 1, walls: [[236, 480]], fixtures: [[240, 463]] },
    { homeType: "MANSION", room: 2, walls: [[220, 648]], fixtures: [[224, 642]] },
    { homeType: "MANSION", room: 5, walls: [[985, 680], [1000, 680], [1067, 680], [985, 700], [1000, 700], [1050, 702], [1067, 708]], fixtures: [[975, 685], [976, 705], [1000, 672], [1000, 718], [1077, 700]] },
    { homeType: "MANSION", room: 6, walls: [[1263, 470]], fixtures: [[1252, 465], [1260, 490]] },
    { homeType: "MANSION", room: 7, walls: [[1270, 627], [1120, 660], [1250, 660], [1120, 670], [1250, 670], [1120, 687], [1250, 687], [1112, 680], [1235, 680], [1270, 680]], fixtures: [[1278, 623], [1100, 687], [1107, 672], [1150, 660], [1170, 665], [1205, 687], [1220, 680], [1250, 651], [1250, 698], [1283, 688]] },
    { homeType: "PALACE", room: 0, walls: [[622, 541], [666, 394], [667, 405], [680, 400], [680, 415], [690, 419], [695, 423], [850, 405], [863, 398], [842, 418], [852, 414], [868, 401], [670, 546], [675, 558], [645, 544], [650, 562], [680, 566], [870, 530], [880, 532], [915, 530], [855, 540], [855, 566], [883, 546], [887, 558], [920, 546], [917, 557], [650, 530], [670, 532], [680, 530], [617, 540], [618, 556], [620, 563]], fixtures: [[630, 550], [662, 400], [680, 394], [680, 418], [690, 423], [697, 404], [850, 395], [874, 400], [834, 405], [850, 422], [640, 550], [644, 560], [650, 574], [675, 574], [690, 558], [684, 538], [875, 521], [900, 552], [897, 540], [892, 555], [888, 567], [901, 534], [906, 540], [909, 549], [912, 558], [935, 540], [930, 554], [865, 575], [957, 536], [660, 521], [634, 534], [633, 536], [638, 538], [610, 550], [620, 575], [686, 530]] },
    { homeType: "PALACE", room: 1, walls: [[717, 560], [819, 560]], fixtures: [[728, 560], [806, 560], [722, 560], [813, 560], [730, 568], [805, 568]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 1, walls: [[717, 560], [819, 560]], fixtures: [[728, 560], [806, 560], [722, 560], [813, 560], [730, 568], [805, 568]] },
    { homeType: "PALACE", room: 2, walls: [[450, 290]], fixtures: [[390, 315], [419, 315]] },
    { homeType: "PALACE", room: 6, walls: [[1080, 290]], fixtures: [[1118, 315], [1145, 315]] },
    { homeType: "PALACE", room: 7, walls: [[1199, 350], [1214, 515], [1270, 350], [1270, 355], [1270, 363]], fixtures: [[1194, 358], [1310, 380], [1205, 514], [1270, 344], [1280, 350], [1285, 350], [1280, 362], [1285, 365]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 0, walls: [[622, 541], [666, 394], [667, 405], [680, 400], [680, 415], [690, 419], [695, 423], [850, 405], [863, 398], [842, 418], [852, 414], [868, 401], [670, 546], [675, 558], [645, 544], [650, 562], [680, 566], [870, 530], [880, 532], [915, 530], [855, 540], [855, 566], [883, 546], [887, 558], [920, 546], [917, 557], [650, 530], [670, 532], [680, 530], [617, 540], [618, 556], [620, 563]], fixtures: [[630, 550], [662, 400], [680, 394], [680, 418], [690, 423], [697, 404], [850, 395], [874, 400], [834, 405], [850, 422], [640, 550], [644, 560], [650, 574], [675, 574], [690, 558], [684, 538], [875, 521], [900, 552], [897, 540], [892, 555], [888, 567], [901, 534], [906, 540], [909, 549], [912, 558], [935, 540], [930, 554], [865, 575], [957, 536], [660, 521], [634, 534], [633, 536], [638, 538], [610, 550], [620, 575], [686, 530]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 2, walls: [[450, 290]], fixtures: [[390, 315], [419, 315]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 3, walls: [[233, 515]], fixtures: [[223, 375], [223, 505]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 6, walls: [[1080, 290]], fixtures: [[1118, 315], [1145, 315]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 7, walls: [[1199, 350], [1214, 515], [1270, 350], [1270, 355], [1270, 363]], fixtures: [[1194, 358], [1310, 380], [1205, 514], [1270, 344], [1280, 350], [1285, 350], [1280, 362], [1285, 365]] },
    { homeType: "MARSHMALLOWOPOLIS", room: 8, walls: [[1000, 455], [980, 595], [1090, 595]], fixtures: [[1030, 595], [935, 555]] },
  ] as const)("covers $homeType room $room wall faces while preserving windows and lamps", ({ homeType, room, walls, fixtures }) => {
    const plan = HOME_ART_PLANS[homeType];
    const [width, height] = plan.aspectRatio === 3 / 2 ? [1536, 1024] : [1448, 1086];
    for (const [landmarks, expected] of [[walls, true], [fixtures, false]] as const) {
      const panels = expected ? plan.paint[room]! : plan.paint.flat();
      for (const [x, y] of landmarks) {
        expect(panels.some((polygon) => containsArtPoint(polygon, x * 100 / width, y * 100 / height))).toBe(expected);
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

/**
 * Check percentage contours with paint's even-odd fill; the authored floors and foreground
 * have the same interior under nonzero fill. The placement predicate assumes convex polygons.
 */
const containsArtPoint = (polygon: readonly (readonly [number, number])[], x: number, y: number) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [ax, ay] = polygon[index]!;
    const [bx, by] = polygon[previous]!;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
};
