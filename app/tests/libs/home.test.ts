import { describe, expect, it } from "bun:test";
import { HOME_FURNITURE_MAX_PLACEMENTS, HOME_FURNITURE_STARTERS } from "@/drizzle/constants";
import { DEFAULT_HOME_FURNITURE_GEOMETRY, clampHomeFurniturePlacement, fitHomeFurniturePlacement, getDefaultHomeLayout, getHomeLayout, getHomeFurnitureGeometry, getHomeFurnitureRotations, getHomeFurnitureView, homeLayoutOrientationError, homeLayoutOwnershipError, homeLayoutPlacementError, projectHomePlacement, recoverHomeLayout, unprojectHomePlacement, type HomeFurniture } from "@/libs/home";
import { homeFurnitureSaveInputSchema } from "@/validators/home";
import { HOME_ROOM_GEOMETRY } from "@/libs/homeRoomGeometry";

const fixture = (id: string, patch: Partial<HomeFurniture> = {}): HomeFurniture => ({
  id, itemId: `content-${id}`, name: id, description: "Furniture", image: "/furniture.webp",
  width: 24, groundAnchor: 100, action: null, isFloor: false, quantity: 1, views: {}, ...patch,
});
const actions = ["sleep", "storage", "kitchen", "farm"] as const;
const furniture = HOME_FURNITURE_STARTERS.map((starter, index) => fixture(`owned-${index}`, {
  itemId: starter.itemId, action: actions[index],
}));
const placement = (id: string) => ({ id, x: 50, y: 50, rotation: 0 as const });

describe("owned furniture layouts", () => {
  it("uses each published direction's art and optional geometry without transforming the base image", () => {
    const piece = fixture("cabinet", { views: {
      "90": { image: "/cabinet-90.webp", width: 18 },
      "270": { image: "/cabinet-270.webp", groundAnchor: 85 },
    } });
    expect(getHomeFurnitureRotations(piece)).toEqual([0, 1, 3]);
    expect(getHomeFurnitureView(piece, 0)).toEqual({ image: piece.image, width: 24, groundAnchor: 100, geometry: DEFAULT_HOME_FURNITURE_GEOMETRY });
    expect(getHomeFurnitureView(piece, 1)).toEqual({ image: "/cabinet-90.webp", width: 18, groundAnchor: 100, geometry: DEFAULT_HOME_FURNITURE_GEOMETRY });
    expect(getHomeFurnitureView(piece, 2)).toEqual({ image: piece.image, width: 24, groundAnchor: 100, geometry: DEFAULT_HOME_FURNITURE_GEOMETRY });
    expect(getHomeFurnitureView(piece, 3)).toEqual({ image: "/cabinet-270.webp", width: 24, groundAnchor: 85, geometry: DEFAULT_HOME_FURNITURE_GEOMETRY });
    expect(homeLayoutOrientationError([{ ...placement(piece.id), rotation: 1 }], [piece])).toBeNull();
    expect(homeLayoutOrientationError([{ ...placement(piece.id), rotation: 2 }], [piece])).toContain("no longer available");
  });

  it("resets owned fixtures using UserItem identities and starter positions", () => {
    expect(getDefaultHomeLayout(furniture)).toEqual(HOME_FURNITURE_STARTERS.map((starter, index) => ({
      id: `owned-${index}`, x: starter.x, y: starter.y, rotation: 0,
    })));
    expect(getDefaultHomeLayout([])).toEqual([]);
    expect(homeLayoutOwnershipError(getDefaultHomeLayout(furniture), furniture)).toBeNull();
  });

  it("uses content-authored action fixtures when starter content is unavailable", () => {
    const custom = actions.map((action) => fixture(`custom-${action}`, { action }));
    expect(getDefaultHomeLayout(custom).map(({ id }) => id)).toEqual(custom.map(({ id }) => id));
    expect(getDefaultHomeLayout([fixture("custom-rug", { isFloor: true })])).toEqual([]);
  });

  it("prefers the starter content and leaves extra copies available in storage", () => {
    const duplicate = fixture("extra-bed", { itemId: "home-bed", action: "sleep" });
    const roleFallback = fixture("custom-bed", { action: "sleep" });
    expect(getDefaultHomeLayout([roleFallback, ...furniture, duplicate]).map(({ id }) => id)).toEqual(furniture.map(({ id }) => id));
  });

  it("uses a starter's current action without placing the same owned row twice", () => {
    const changedBed = fixture("changed-bed", { itemId: "home-bed", action: "storage" });
    const layout = getDefaultHomeLayout([changedBed, ...furniture.slice(2)]);
    const storagePosition = HOME_FURNITURE_STARTERS[1]!;
    expect(layout).toEqual([
      { id: changedBed.id, x: storagePosition.x, y: storagePosition.y, rotation: 0 },
      ...getDefaultHomeLayout(furniture.slice(2)),
    ]);
    expect(homeFurnitureSaveInputSchema.safeParse({ homeType: "NONE", revision: 0, placements: layout }).success).toBe(true);
  });

  it("loads only complete positions into independent drafts and normalizes rotation", () => {
    const rows = [
      { id: "placed", homeX: 20, homeY: 40, homeRotation: 1 },
      { id: "opposite", homeX: 40, homeY: 50, homeRotation: 2 },
      { id: "left", homeX: 60, homeY: 50, homeRotation: 3 },
      { id: "unplaced", homeX: null, homeY: null, homeRotation: 0 },
      { id: "partial", homeX: 20, homeY: null, homeRotation: 0 },
      { id: "normal-rotation", homeX: 70, homeY: 60, homeRotation: 4 },
    ];
    const draft = getHomeLayout(rows);
    expect(draft).toEqual([
      { id: "placed", x: 20, y: 40, rotation: 1 },
      { id: "opposite", x: 40, y: 50, rotation: 2 },
      { id: "left", x: 60, y: 50, rotation: 3 },
      { id: "normal-rotation", x: 70, y: 60, rotation: 0 },
    ]);
    draft[0]!.x = 50;
    expect(rows[0]!.homeX).toBe(20);
    expect(getHomeLayout(rows)[0]!.x).toBe(20);
  });

  it("accepts independent owned copies and rejects foreign row IDs", () => {
    const copies = [fixture("copy-a", { itemId: "cabinet" }), fixture("copy-b", { itemId: "cabinet" })];
    expect(homeLayoutOwnershipError(copies.map(({ id }) => placement(id)), copies)).toBeNull();
    expect(homeLayoutOwnershipError([placement("cabinet")], copies)).toContain("no longer available");
    expect(homeLayoutOwnershipError([], [])).toBeNull();
  });

  it("permits an empty layout and bounds room size without mandatory core placements", () => {
    const input = { homeType: "NONE", revision: 0, placements: [] };
    expect(homeFurnitureSaveInputSchema.safeParse(input).success).toBe(true);
    const placements = Array.from({ length: HOME_FURNITURE_MAX_PLACEMENTS }, (_, index) => placement(`owned-${index}`));
    expect(homeFurnitureSaveInputSchema.safeParse({ ...input, placements }).success).toBe(true);
    expect(homeFurnitureSaveInputSchema.safeParse({ ...input, placements: [...placements, placement("overflow")] }).success).toBe(false);
    expect(homeFurnitureSaveInputSchema.safeParse({ ...input, placements: [placement("same"), placement("same")] }).success).toBe(false);
    expect(homeFurnitureSaveInputSchema.safeParse({ ...input, owned: ["foreign"] }).success).toBe(false);
  });

  it.each([
    { id: "row", x: -1, y: 50, rotation: 0 },
    { id: "row", x: 50, y: 101, rotation: 0 },
    { id: "row", x: Number.NaN, y: 50, rotation: 0 },
    { id: "row", x: 50, y: 50, rotation: 4 },
    { id: "", x: 50, y: 50, rotation: 0 },
  ])("rejects unsafe placement %j", (invalid) => {
    expect(homeFurnitureSaveInputSchema.safeParse({ homeType: "NONE", revision: 0, placements: [invalid] }).success).toBe(false);
  });
});

describe("painted furniture geometry", () => {
  const piece = fixture("table", {
    width: 20,
    geometry: {
      aspectRatio: 2,
      visibleBounds: { x: 20, y: 10, width: 60, height: 80 },
      footprint: { x: 25, y: 75, width: 50, height: 15 },
    },
  });

  it("projects normalized image bounds without transparent padding or source-aspect distortion", () => {
    const position = placement(piece.id);
    const anchor = projectHomePlacement(position);
    expect(unprojectHomePlacement(anchor)).toEqual({ x: 50, y: 50 });
    const geometry = getHomeFurnitureGeometry(piece, position);
    expect(geometry.image.width).toBe(20);
    expect(geometry.image.height).toBeCloseTo(40 / 3);
    expect(geometry.visibleBounds.width).toBe(12);
    expect(geometry.visibleBounds.height).toBeCloseTo(32 / 3);
    expect(geometry.footprint.width).toBe(10);
    expect(geometry.footprint.height).toBeCloseTo(2);
    expect(geometry.visibleBounds.x).toBeCloseTo(anchor.x - 6);
    expect(geometry.footprint.y).toBeCloseTo(anchor.y - 10 / 3);
  });

  it("uses a direction's own source geometry and never reuses another image's padding", () => {
    const rotated = fixture("table", {
      ...piece,
      views: { "90": { image: "/table-90.webp", width: 15, geometry: { ...piece.geometry!, aspectRatio: 1 } } },
    });
    expect(getHomeFurnitureGeometry(rotated, { ...placement(piece.id), rotation: 1 }).image.height).toBe(20);
    expect(getHomeFurnitureView({ ...rotated, views: { "90": { image: "/uncalibrated.webp" } } }, 1).geometry).toEqual(DEFAULT_HOME_FURNITURE_GEOMETRY);
  });

  it("fits tight visible bounds at the right wall instead of reserving transparent frame padding", () => {
    const rightWall = Math.max(...HOME_ROOM_GEOMETRY.NONE.interior.map(({ x }) => x));
    const fitted = clampHomeFurniturePlacement({ ...placement(piece.id), x: 100 }, piece, "NONE");
    expect(fitted).not.toBeNull();
    const geometry = getHomeFurnitureGeometry(piece, fitted!);
    expect(geometry.visibleBounds.x + geometry.visibleBounds.width).toBeCloseTo(rightWall);
    expect(geometry.image.x + geometry.image.width).toBeGreaterThan(rightWall);
    expect(homeLayoutPlacementError([fitted!], [piece], "NONE")).toBeNull();
  });

  it("keeps footprint overlap strict while allowing rugs under furniture and disjoint ground", () => {
    const other = fixture("chair", { ...piece, id: "chair" });
    expect(homeLayoutPlacementError([placement(piece.id), placement(other.id)], [piece, other], "NONE")).toContain("overlaps");
    expect(homeLayoutPlacementError([placement(piece.id), placement(other.id)], [piece, { ...other, isFloor: true }], "NONE")).toBeNull();
    const touching = { ...placement(other.id), ...unprojectHomePlacement({ x: projectHomePlacement(placement(piece.id)).x + 10, y: projectHomePlacement(placement(piece.id)).y }) };
    expect(homeLayoutPlacementError([placement(piece.id), touching], [piece, other], "NONE")).toBeNull();
    // These sprites overlap above the floor, while their ground strips have separate space.
    expect(homeLayoutPlacementError([placement(piece.id), { ...placement(other.id), y: 60 }], [piece, other], "NONE")).toBeNull();
  });

  it("rejects walls and the front curtains, with farm pieces confined to outdoor ground", () => {
    const curtain = { ...placement(piece.id), ...unprojectHomePlacement({ x: 50, y: 80 }) };
    expect(homeLayoutPlacementError([curtain], [piece], "NONE")).toContain("walls and curtains");
    expect(homeLayoutPlacementError([{ ...placement(piece.id), ...unprojectHomePlacement({ x: 5, y: 60 }) }], [piece], "NONE")).toContain("walls and curtains");
    const farm = { ...piece, groundAnchor: 90, action: "farm" as const };
    expect(homeLayoutPlacementError([placement(piece.id)], [farm], "NONE")).toContain("outside");
    const outdoor = clampHomeFurniturePlacement(placement(piece.id), farm, "NONE");
    expect(outdoor).not.toBeNull();
    expect(homeLayoutPlacementError([outdoor!], [farm], "NONE")).toBeNull();
    expect(homeLayoutPlacementError([outdoor!], [piece], "NONE")).toContain("walls and curtains");
  });

  it("finds free ground and recovers old placements without changing the saved input", () => {
    const other = { ...piece, id: "chair" };
    const saved = [placement(piece.id), placement(other.id), { ...placement("garden"), y: 40 }];
    const pieces = [piece, other, { ...piece, id: "garden", groundAnchor: 90, action: "farm" as const }];
    const fitted = fitHomeFurniturePlacement(placement(other.id), other, [placement(piece.id)], pieces, "NONE");
    expect(fitted).not.toBeNull();
    expect(homeLayoutPlacementError([placement(piece.id), fitted!], pieces, "NONE")).toBeNull();
    const recovered = recoverHomeLayout(saved, pieces, "NONE");
    expect(recovered).toHaveLength(3);
    expect(homeLayoutPlacementError(recovered, pieces, "NONE")).toBeNull();
    expect(saved[1]).toEqual(placement(other.id));
    expect(saved[2]!.y).toBe(40);
  });
});
