import { describe, expect, it } from "bun:test";
import { getDefaultHomeLayout, getHomeLayout, homeLayoutOwnershipError } from "@/libs/home";
import { homeFurnitureSaveInputSchema, type HomeFurnitureState } from "@/validators/home";

describe("home furniture layouts", () => {
  it("provides the four movable actions before any furniture is purchased", () => {
    const layout = getDefaultHomeLayout();
    expect(layout.map(({ id }) => id)).toEqual(["bed", "armory", "kitchen", "garden"]);
    expect(homeFurnitureSaveInputSchema.safeParse({ homeType: "NONE", revision: 0, placements: layout }).success).toBe(true);
    expect(homeLayoutOwnershipError(layout, { owned: [], layouts: {} })).toBeNull();
  });

  it("preserves separate tier layouts and returns independent editing drafts", () => {
    const tent = getDefaultHomeLayout();
    tent[0]!.x = 30;
    const furniture: HomeFurnitureState = { owned: ["rug"], layouts: { NONE: tent } };
    const draft = getHomeLayout("NONE", furniture);
    draft[0]!.x = 40;
    expect(furniture.layouts.NONE?.[0]?.x).toBe(30);
    expect(getHomeLayout("STUDIO_APARTMENT", furniture)).toEqual(getDefaultHomeLayout());
    expect(getHomeLayout("NONE", furniture)[0]?.x).toBe(30);
  });

  it("allows owned decorations to be placed or kept in storage", () => {
    const furniture: HomeFurnitureState = { owned: ["rug"], layouts: {} };
    const layout = [...getDefaultHomeLayout(), { id: "rug" as const, x: 50, y: 50, rotation: 1 as const }];
    expect(homeLayoutOwnershipError(layout, furniture)).toBeNull();
    expect(homeLayoutOwnershipError(getDefaultHomeLayout(), furniture)).toBeNull();
    expect(homeLayoutOwnershipError(layout, { owned: [], layouts: {} })).toContain("Purchase");
  });

  it.each([
    { id: "bed", x: -1, y: 50, rotation: 0 },
    { id: "bed", x: 50, y: 101, rotation: 0 },
    { id: "bed", x: Number.NaN, y: 50, rotation: 0 },
    { id: "bed", x: 50, y: 50, rotation: 2 },
    { id: "unknown", x: 50, y: 50, rotation: 0 },
  ])("rejects unsafe placement %j", (placement) => {
    expect(homeFurnitureSaveInputSchema.safeParse({
      homeType: "NONE", revision: 0, placements: [placement, ...getDefaultHomeLayout().slice(1)],
    }).success).toBe(false);
  });

  it("rejects duplicated furniture, missing core actions and client-owned inventory", () => {
    const input = { homeType: "NONE", revision: 0, placements: getDefaultHomeLayout() };
    expect(homeFurnitureSaveInputSchema.safeParse({ ...input, placements: [...input.placements, input.placements[0]] }).success).toBe(false);
    expect(homeFurnitureSaveInputSchema.safeParse({ ...input, placements: input.placements.slice(1) }).success).toBe(false);
    expect(homeFurnitureSaveInputSchema.safeParse({ ...input, owned: ["sofa"] }).success).toBe(false);
  });
});
