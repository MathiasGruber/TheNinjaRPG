import { readFile } from "node:fs/promises";
import { describe, expect, it } from "bun:test";
import { HOME_FURNITURE_ESSENTIALS, HOME_FURNITURE_MAX_PLACEMENTS } from "@/drizzle/constants";
import { DEFAULT_HOME_FURNITURE_GEOMETRY, clampHomeFurniturePlacement, completeHomeLayoutEssentials, fitHomeFurniturePlacement, getHomeLayout, getHomeFurnitureGeometry, getHomeFurnitureRotations, getHomeFurnitureView, homeLayoutOrientationError, homeLayoutOwnershipError, homeLayoutPlacementError, projectHomePlacement, recoverHomeLayout, unprojectHomePlacement, type HomeFurniture } from "@/libs/home";
import { homeFurnitureSaveInputSchema } from "@/validators/home";
import { HOME_ROOM_GEOMETRY } from "@/libs/homeRoomGeometry";
import { furnitureDataSchema } from "@/validators/itemFurniture";

const fixture = (id: string, patch: Partial<HomeFurniture> = {}): HomeFurniture => ({
  id, itemId: `content-${id}`, name: id, image: "/furniture.webp",
  width: 24, groundAnchor: 100, action: null, isFloor: false, quantity: 1, views: {}, ...patch,
});
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

  it("bounds room size while action validation uses the owned content snapshot", () => {
    const input = { homeType: "NONE", revision: 0, placements: [] };
    expect(homeFurnitureSaveInputSchema.safeParse(input).success).toBe(true);
    const placements = Array.from({ length: HOME_FURNITURE_MAX_PLACEMENTS }, (_, index) => placement(`owned-${index}`));
    expect(homeFurnitureSaveInputSchema.safeParse({ ...input, placements }).success).toBe(true);
    expect(homeFurnitureSaveInputSchema.safeParse({ ...input, placements: [...placements, placement("overflow")] }).success).toBe(false);
    expect(homeFurnitureSaveInputSchema.safeParse({ ...input, placements: [placement("same"), placement("same")] }).success).toBe(false);
    expect(homeFurnitureSaveInputSchema.safeParse({ ...input, owned: ["foreign"] }).success).toBe(false);
  });

  it("fills missing actions around valid furniture without changing their existing positions", () => {
    const decoration = fixture("decoration", { width: 6 });
    const pieces = [decoration, ...HOME_FURNITURE_ESSENTIALS.map(({ action, itemId }) => fixture(itemId, { action, width: 6 }))];
    const existing = [placement(decoration.id)];
    const completed = completeHomeLayoutEssentials(existing, pieces, "NONE");
    expect(completed).toContainEqual(existing[0]!);
    expectStarterActions(completed, pieces);
    expect(homeLayoutPlacementError(completed, pieces, "NONE")).toBeNull();
    expect(existing).toEqual([placement(decoration.id)]);
  });

  it("returns only a blocking decoration to storage when an essential needs its ground", () => {
    const pieces = Array.from({ length: HOME_FURNITURE_MAX_PLACEMENTS }, (_, index) => fixture(`decoration-${index}`, { width: 6, isFloor: true }));
    pieces.push(...HOME_FURNITURE_ESSENTIALS.map(({ action, itemId }) => fixture(itemId, { action, width: 6 })));
    const existing = pieces.slice(0, HOME_FURNITURE_MAX_PLACEMENTS).map(({ id }) => placement(id));
    const completed = completeHomeLayoutEssentials(existing, pieces, "NONE");
    expect(completed).toHaveLength(HOME_FURNITURE_MAX_PLACEMENTS);
    expect(completed.filter(({ id }) => id.startsWith("decoration-"))).toHaveLength(HOME_FURNITURE_MAX_PLACEMENTS - 3);
    expectStarterActions(completed, pieces);
    expect(homeLayoutPlacementError(completed, pieces, "NONE")).toBeNull();
    expect(pieces).toHaveLength(HOME_FURNITURE_MAX_PLACEMENTS + 3);
  });

  it("frees redundant essential furniture at the placement cap while preserving each required action", () => {
    const beds = Array.from({ length: HOME_FURNITURE_MAX_PLACEMENTS }, (_, index) => fixture(`bed-${index}`, { action: "sleep", width: 6 }));
    const pieces = [...beds, fixture("box", { action: "storage", width: 6 }), fixture("utensils", { action: "kitchen", width: 6 })];
    const existing = beds.map(({ id }, index) => ({ id, x: 15 + (index % 10) * 7, y: 20 + Math.floor(index / 10) * 8, rotation: 0 as const }));
    expect(homeLayoutPlacementError(existing, pieces, "NONE")).toBeNull();
    const completed = completeHomeLayoutEssentials(existing, pieces, "NONE");
    expect(completed).toHaveLength(HOME_FURNITURE_MAX_PLACEMENTS);
    expect(completed).toContainEqual(existing[0]!);
    expect(completed.filter(({ id }) => id.startsWith("bed-"))).toHaveLength(HOME_FURNITURE_MAX_PLACEMENTS - 2);
    expectStarterActions(completed, pieces);
    expect(homeLayoutPlacementError(completed, pieces, "NONE")).toBeNull();
    expect(beds).toHaveLength(HOME_FURNITURE_MAX_PLACEMENTS);
  });

  it("keeps farming reachable while freeing redundant garden copies at the placement cap", () => {
    const gardens = Array.from({ length: HOME_FURNITURE_MAX_PLACEMENTS }, (_, index) => fixture(`garden-${index}`, {
      action: "farm", width: 6, geometry: { ...DEFAULT_HOME_FURNITURE_GEOMETRY, aspectRatio: 10 },
    }));
    const pieces = [...gardens, ...HOME_FURNITURE_ESSENTIALS.map(({ action, itemId }) => fixture(itemId, { action, width: 6 }))];
    const existing = gardens.map(({ id }, index) => ({ id, x: 10 + (index % 10) * 7, y: 85 + Math.floor(index / 10) * 3, rotation: 0 as const }));
    expect(homeLayoutPlacementError(existing, pieces, "NONE")).toBeNull();
    const completed = completeHomeLayoutEssentials(existing, pieces, "NONE");
    expect(completed).toHaveLength(HOME_FURNITURE_MAX_PLACEMENTS);
    expect(completed).toContainEqual(existing[0]!);
    expect(completed.filter(({ id }) => id.startsWith("garden-"))).toHaveLength(HOME_FURNITURE_MAX_PLACEMENTS - 3);
    expectStarterActions(completed, pieces);
    expect(homeLayoutPlacementError(completed, pieces, "NONE")).toBeNull();
    expect(gardens).toHaveLength(HOME_FURNITURE_MAX_PLACEMENTS);
  });

  it("fits a published side view of the basic storage box when its canonical footprint cannot fit", async () => {
    const catalogue = await readFile("data/item.sql", "utf8");
    const definition = catalogue.split("\n").find((line) => line.includes("('home-storage-box',"))!;
    const data = furnitureDataSchema.parse(JSON.parse(definition.match(/'FURNITURE', '(.+?)', 'COMMON'/)![1]!));
    const fullFloorPiece = (id: string, action: "kitchen" | "sleep", width: number) => fixture(id, {
      action, width, geometry: {
        aspectRatio: width * (4 / 3) / 55,
        visibleBounds: { x: 0, y: 0, width: 100, height: 100 },
        footprint: { x: 0, y: 0, width: 100, height: 100 },
      },
    });
    const box = fixture("box", { ...data, itemId: "home-storage-box" });
    const pieces = [fullFloorPiece("kitchen", "kitchen", 40), fullFloorPiece("bed", "sleep", 28), box];
    const existing = [
      { id: "kitchen", ...unprojectHomePlacement({ x: 33.5, y: 75 }), rotation: 0 as const },
      { id: "bed", ...unprojectHomePlacement({ x: 67.5, y: 75 }), rotation: 0 as const },
    ];
    expect(getHomeFurnitureRotations(box)).toEqual([0, 1, 2, 3]);
    expect(homeLayoutPlacementError(existing, pieces, "NONE")).toBeNull();
    expect(fitHomeFurniturePlacement({ id: box.id, x: 75, y: 15.15, rotation: 0 }, box, existing, pieces, "NONE")).toBeNull();
    const completed = completeHomeLayoutEssentials(existing, pieces, "NONE");
    expect(completed.find(({ id }) => id === box.id)?.rotation).toBe(1);
    expect(completed).toContainEqual(existing[0]!);
    expect(completed).toContainEqual(existing[1]!);
    expectStarterActions(completed, pieces);
    expect(homeLayoutPlacementError(completed, pieces, "NONE")).toBeNull();
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

/** Initial layouts expose each starter action without making later decoration require them. */
const expectStarterActions = (placements: { id: string }[], furniture: HomeFurniture[]) => {
  const placed = new Set(placements.map(({ id }) => id));
  const actions = new Set(furniture.filter(({ id }) => placed.has(id)).map(({ action }) => action));
  for (const { action } of HOME_FURNITURE_ESSENTIALS) expect(actions.has(action)).toBe(true);
};
