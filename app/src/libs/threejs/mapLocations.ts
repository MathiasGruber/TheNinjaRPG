import type { Grid } from "honeycomb-grid";
import { type Group, Sprite, SpriteMaterial } from "three";
import { ASSETS_LAYER, IMG_SECTOR_USER_MARKER } from "@/drizzle/constants";
import type { MapAsset } from "@/drizzle/schema";
import type { TerrainHex } from "@/libs/hexgrid";
import { groupMapLocations } from "@/libs/mapLocations";
import { loadTexture } from "@/libs/threejs/util";
import type { MapLocation } from "@/validators/mapLocation";

type LocationAsset = Pick<MapAsset, "id" | "imageUrl" | "renderScale">;

/** Patch only landmark sprites, preserving terrain, camera, and shared textures. */
export const syncMapLocationSprites = (
  group: Group,
  grid: Grid<TerrainHex>,
  locations: MapLocation[],
  assets: LocationAsset[],
  textureForPath: typeof loadTexture = loadTexture,
) => {
  const signature = JSON.stringify([
    locations,
    assets.map((a) => [a.id, a.imageUrl, a.renderScale]),
  ]);
  if (group.userData.mapLocationSignature === signature) return;
  group.userData.mapLocationSignature = signature;
  const occupiedTiles = new Set(
    locations.map((location) => `${location.longitude},${location.latitude}`),
  );
  for (const child of group.children) {
    if (child.userData.type !== "decoration") continue;
    if (occupiedTiles.has(`${child.userData.mapX},${child.userData.mapY}`)) {
      child.userData.mapLocationBaseVisible ??= child.visible;
      child.visible = false;
    } else if (child.userData.mapLocationBaseVisible !== undefined) {
      child.visible = child.userData.mapLocationBaseVisible;
      delete child.userData.mapLocationBaseVisible;
    }
  }
  group.children
    .filter((child) => child.userData.type === "questStructure")
    .forEach((child) => {
      group.remove(child);
      // Materials belong to these sprites; cached textures are shared with other sectors and previews.
      (child as Sprite).material.dispose();
    });
  for (const entries of groupMapLocations(locations)) {
    const location = entries[0];
    if (!location) continue;
    const hex = grid.getHex({ col: location.longitude, row: location.latitude });
    if (!hex) continue;
    const asset = assets.find((a) => a.id === location.assetId);
    const size = hex.height * (asset?.renderScale ?? 2.4) * location.scale;
    if (asset) {
      const texture = textureForPath(asset.imageUrl, 512);
      const sprite = new Sprite(
        new SpriteMaterial({
          map: texture,
          depthWrite: false,
          depthTest: false,
          transparent: true,
          opacity: 0,
        }),
      );
      sprite.center.set(0.5, 0.15);
      sprite.position.set(hex.x, hex.y + hex.height / 10, ASSETS_LAYER);
      sprite.scale.set(size, size, 1);
      // TextureLoader fills image asynchronously. Preserve proportions without replacing shared textures.
      sprite.onBeforeRender = () => {
        const image = texture.image as { width?: number; height?: number } | null;
        if (image?.width && image.height) {
          sprite.scale.set((size * image.width) / image.height, size, 1);
          sprite.material.opacity = 1;
        }
      };
      sprite.userData = {
        type: "questStructure",
        locationId: location.id,
        assetSortY: hex.y,
      };
      group.add(sprite);
    }
    // A small, independent pin identifies the arrival tile and remains usable if artwork fails.
    const pinTexture = textureForPath(IMG_SECTOR_USER_MARKER);
    const pin = new Sprite(
      new SpriteMaterial({
        map: pinTexture,
        alphaMap: pinTexture,
        depthTest: false,
        depthWrite: false,
      }),
    );
    pin.scale.set(hex.height * 0.85, hex.height * 1.05, 1);
    pin.position.set(hex.x + hex.width * 0.45, hex.y, ASSETS_LAYER + 0.1);
    pin.material.color.setHex(
      entries.some((entry) => entry.active) ? 0xffdf66 : 0x9acddd,
    );
    pin.userData = {
      type: "questStructure",
      locationId: location.id,
      assetSortY: hex.y,
    };
    group.add(pin);
  }
};
