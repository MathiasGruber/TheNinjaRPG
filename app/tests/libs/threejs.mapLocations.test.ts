import { describe, expect, it } from "bun:test";
import { Group, Sprite, Texture } from "three";
import { syncMapLocationSprites } from "@/libs/threejs/mapLocations";
import type { MapLocation } from "@/validators/mapLocation";

const grid = { getHex: ({ col, row }: { col: number; row: number }) => ({ x: col * 20, y: row * 20, width: 20, height: 20 }) } as never;
const location: MapLocation = { id: "tower", sector: 724, longitude: 3, latitude: 4, name: "Tower", description: "A tower.", assetId: "art", scale: 1 };
const asset = { id: "art", imageUrl: "tower.png", renderScale: 2.4 };
const textureForPath = () => new Texture({ width: 100, height: 200 } as never);

describe("quest structure rendering", () => {
  it("draws one structure for co-located objectives with an independent arrival pin", () => {
    const group = new Group();
    syncMapLocationSprites(group, grid, [location, { ...location, id: "another-quest" }], [asset], textureForPath);
    expect(group.children).toHaveLength(2);
    expect(group.children.every((child) => child.userData.type === "questStructure")).toBe(true);
    expect((group.children[0] as Sprite).material.alphaMap).toBeNull();
  });
  it("preserves the source artwork proportions once the texture loads", () => {
    const group = new Group();
    syncMapLocationSprites(group, grid, [location], [asset], textureForPath);
    const sprite = group.children[0] as Sprite;
    sprite.onBeforeRender({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    expect(sprite.scale.x / sprite.scale.y).toBe(0.5);
    expect(sprite.material.opacity).toBe(1);
  });
  it("refreshes changed art and disposes its old material without disposing shared textures", () => {
    const group = new Group();
    syncMapLocationSprites(group, grid, [location], [asset], textureForPath);
    const original = group.children[0] as Sprite;
    let disposedMaterial = false;
    let disposedTexture = false;
    original.material.addEventListener("dispose", () => { disposedMaterial = true; });
    original.material.map?.addEventListener("dispose", () => { disposedTexture = true; });
    syncMapLocationSprites(group, grid, [location], [{ ...asset, imageUrl: "replacement.png" }], textureForPath);
    expect(group.children[0]).not.toBe(original);
    expect(disposedMaterial).toBe(true);
    expect(disposedTexture).toBe(false);
  });
  it("keeps a usable arrival pin when an asset is unavailable", () => {
    const group = new Group();
    syncMapLocationSprites(group, grid, [location], [], textureForPath);
    expect(group.children).toHaveLength(1);
    expect(group.children[0]?.userData.locationId).toBe("tower");
  });
  it("removes ended private scenery while preserving the surrounding world", () => {
    const group = new Group();
    const scenery = new Group();
    group.add(scenery);
    syncMapLocationSprites(group, grid, [location], [asset], textureForPath);
    syncMapLocationSprites(group, grid, [], [asset], textureForPath);
    expect(group.children).toEqual([scenery]);
  });
  it("temporarily clears overlapping decorations and restores them when a private structure ends", () => {
    const group = new Group();
    const tree = new Group();
    tree.userData = { type: "decoration", mapX: 3, mapY: 4 };
    group.add(tree);
    syncMapLocationSprites(group, grid, [location], [asset], textureForPath);
    expect(tree.visible).toBe(false);
    syncMapLocationSprites(group, grid, [], [asset], textureForPath);
    expect(tree.visible).toBe(true);
  });
});
