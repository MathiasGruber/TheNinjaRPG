import { Vector3, MeshBasicMaterial, Sprite, SpriteMaterial } from "three";
import { loadTexture } from "@/libs/threejs/util";
import { groundAssets, oceanAssets, dessertAssets } from "./constants";
import type { TerrainHex } from "../hexgrid";
import type { GlobalTile } from "./types";

/**
 * Map materials & colors
 */
export const groundColors = [0x9feb57, 0x89cd4e, 0x98df56] as const;

export const oceanColors = [0x184695, 0x1c54b5, 0x2767d7] as const;

export const dessertColors = [0xf9e79f, 0xfad7a0, 0xf5cba7] as const;

export const groundMats = groundColors.map(
  (color) => new MeshBasicMaterial({ color, transparent: true })
);

export const oceanMats = oceanColors.map(
  (color) => new MeshBasicMaterial({ color, transparent: true })
);

export const dessertMats = dessertColors.map(
  (color) => new MeshBasicMaterial({ color, transparent: true })
);

/**
 * Returns materials and potential game assets to show on a given tile
 */
interface TileInfo {
  material: MeshBasicMaterial;
  sprites: Sprite[];
  density: number;
  asset: "ocean" | "ground" | "dessert";
}

export const getTileInfo = (prng: () => number, hex: TerrainHex, tile: GlobalTile) => {
  const material = getMaterial(hex, tile);
  material.sprites = getMapSprites(prng, material.density, material.asset, hex, 1);
  return material;
};

export const getMapSprites = (
  prng: () => number,
  density: number,
  asset: string,
  hex: TerrainHex,
  scatterStrength: number
) => {
  const sprites: Sprite[] = [];
  // Fetch tile sprite
  let cost = hex.cost;
  for (let i = 0; i < density; i++) {
    const rand = prng();
    let sprite = null;
    let assets = null;
    if (asset === "ground") {
      assets = groundAssets;
      cost += 1;
    } else if (asset === "dessert") {
      assets = dessertAssets;
      cost += 1;
    } else {
      assets = oceanAssets;
      cost += 5;
    }
    assets.every((asset) => {
      if (rand < asset.chance) {
        sprite = loadAsset(asset.filepath + asset.filename);
        return false;
      }
      return true;
    });
    if (sprite) sprites.push(sprite);
  }
  hex.cost = cost;
  // Adjust sprite to tile
  sprites.map((sprite) => {
    const { height: h, width: w } = hex;
    const { x, y } = hex.center;
    const posX = -x + w / 2 + (prng() - 0.5) * h * scatterStrength;
    const posY = -y + h / 2 + (prng() - 0.5) * h * scatterStrength;
    Object.assign(sprite.scale, new Vector3(h, h, 1));
    Object.assign(sprite.position, new Vector3(posX, posY, -8));
  });
  // Sort so the ones with the highest y's are last
  sprites.sort((a, b) => a.position.y - b.position.y);
  // Return sprite
  return sprites;
};

const loadAsset = (filepath: string) => {
  const texture = loadTexture(filepath);
  const material = new SpriteMaterial({ map: texture });
  const sprite = new Sprite(material);
  return sprite;
};

const getMaterial = (hex: TerrainHex, tile: GlobalTile) => {
  if (tile.t === 0) {
    if (hex.level < 0.3) {
      return { material: oceanMats[0], asset: "ocean", density: 1 } as TileInfo;
    } else if (hex.level < 0.6) {
      return { material: oceanMats[1], asset: "ocean", density: 1 } as TileInfo;
    } else if (hex.level < 0.8) {
      return { material: oceanMats[2], asset: "ocean", density: 1 } as TileInfo;
    } else if (hex.level < 0.85) {
      return { material: dessertMats[0], asset: "dessert", density: 1 } as TileInfo;
    } else if (hex.level < 0.9) {
      return { material: dessertMats[1], asset: "dessert", density: 1 } as TileInfo;
    } else if (hex.level < 0.95) {
      return { material: dessertMats[2], asset: "dessert", density: 1 } as TileInfo;
    } else {
      return { material: groundMats[2], asset: "ground", density: 2 } as TileInfo;
    }
  } else if (tile.t === 1) {
    if (hex.level < 0.05) {
      return { material: oceanMats[0], asset: "ocean", density: 1 } as TileInfo;
    } else if (hex.level < 0.1) {
      return { material: oceanMats[1], asset: "ocean", density: 1 } as TileInfo;
    } else if (hex.level < 0.15) {
      return { material: oceanMats[2], asset: "ocean", density: 1 } as TileInfo;
    } else if (hex.level < 0.2) {
      return { material: groundMats[2], asset: "ground", density: 3 } as TileInfo;
    } else if (hex.level < 0.5) {
      return { material: groundMats[1], asset: "ground", density: 2 } as TileInfo;
    } else if (hex.level < 0.8) {
      return { material: groundMats[0], asset: "ground", density: 1 } as TileInfo;
    } else if (hex.level < 0.9) {
      return { material: dessertMats[0], asset: "dessert", density: 1 } as TileInfo;
    } else if (hex.level < 0.95) {
      return { material: dessertMats[1], asset: "dessert", density: 2 } as TileInfo;
    } else {
      return { material: dessertMats[2], asset: "dessert", density: 3 } as TileInfo;
    }
  } else {
    if (hex.level < 0.05) {
      return { material: oceanMats[2], asset: "ocean", density: 1 } as TileInfo;
    } else if (hex.level < 0.1) {
      return { material: groundMats[2], asset: "ground", density: 1 } as TileInfo;
    } else if (hex.level < 0.3) {
      return { material: dessertMats[0], asset: "dessert", density: 1 } as TileInfo;
    } else if (hex.level < 0.6) {
      return { material: dessertMats[1], asset: "dessert", density: 1 } as TileInfo;
    } else {
      return { material: dessertMats[2], asset: "dessert", density: 1 } as TileInfo;
    }
  }
};

export const getBackgroundColor = (tile: GlobalTile) => {
  if (tile.t === 0) {
    return { color: oceanColors[0] };
  } else if (tile.t === 1) {
    return { color: groundColors[1] };
  } else {
    return { color: dessertColors[2] };
  }
};
