import * as THREE from "three";

import { type TerrainHex, type GlobalTile } from "./map";

/**
 * Map materials & colors
 */
export const groundColors = [0x9feb57, 0x89cd4e, 0x98df56] as const;

export const oceanColors = [0x184695, 0x1c54b5, 0x2767d7] as const;

export const dessertColors = [0xf9e79f, 0xfad7a0, 0xf5cba7] as const;

export const groundMats = groundColors.map(
  (color) => new THREE.MeshBasicMaterial({ color, transparent: true })
);

export const oceanMats = oceanColors.map(
  (color) => new THREE.MeshBasicMaterial({ color, transparent: true })
);

export const dessertMats = dessertColors.map(
  (color) => new THREE.MeshBasicMaterial({ color, transparent: true })
);

/**
 * Returns materials and potential game assets to show on a given tile
 */
interface TileInfo {
  material: THREE.MeshBasicMaterial;
  sprites: THREE.Sprite[];
  density: number;
  asset: "ocean" | "ground" | "dessert";
}

export const getTileInfo = (prng: () => number, hex: TerrainHex, tile: GlobalTile) => {
  const material = getMaterial(hex, tile);
  material.sprites = getMapSprite(prng, material.density, material.asset, hex);
  return material;
};

const TREES_PATH = "craftpix-949054/PNG/Assets_separately/Trees_texture_shadow/";
const STONES_PATH = "craftpix-377140/PNG/Objects_separately/";

const groundAssets = [
  { filepath: TREES_PATH, filename: "Moss_tree1.png", chance: 0.05 },
  { filepath: TREES_PATH, filename: "Moss_tree2.png", chance: 0.1 },
  { filepath: TREES_PATH, filename: "Moss_tree3.png", chance: 0.15 },
  { filepath: TREES_PATH, filename: "Fruit_tree1.png", chance: 0.2 },
  { filepath: TREES_PATH, filename: "Fruit_tree2.png", chance: 0.25 },
  { filepath: TREES_PATH, filename: "Fruit_tree3.png", chance: 0.3 },
  { filepath: TREES_PATH, filename: "Tree1.png", chance: 0.4 },
  { filepath: TREES_PATH, filename: "Tree2.png", chance: 0.5 },
  { filepath: TREES_PATH, filename: "Tree3.png", chance: 0.6 },
  { filepath: STONES_PATH, filename: "Rock1_1.png", chance: 0.605 },
  { filepath: STONES_PATH, filename: "Rock1_2.png", chance: 0.61 },
  { filepath: STONES_PATH, filename: "Rock1_3.png", chance: 0.615 },
  { filepath: STONES_PATH, filename: "Rock1_4.png", chance: 0.62 },
  { filepath: STONES_PATH, filename: "Rock4_1.png", chance: 0.625 },
  { filepath: STONES_PATH, filename: "Rock4_2.png", chance: 0.63 },
  { filepath: STONES_PATH, filename: "Rock4_3.png", chance: 0.635 },
  { filepath: STONES_PATH, filename: "Rock4_4.png", chance: 0.64 },
];

const dessertAssets = [
  { filepath: STONES_PATH, filename: "Rock1_1.png", chance: 0.005 },
  { filepath: STONES_PATH, filename: "Rock1_2.png", chance: 0.01 },
  { filepath: STONES_PATH, filename: "Rock1_3.png", chance: 0.015 },
  { filepath: STONES_PATH, filename: "Rock1_4.png", chance: 0.02 },
  { filepath: STONES_PATH, filename: "Rock2_1.png", chance: 0.025 },
  { filepath: STONES_PATH, filename: "Rock2_2.png", chance: 0.03 },
  { filepath: STONES_PATH, filename: "Rock2_3.png", chance: 0.035 },
  { filepath: STONES_PATH, filename: "Rock2_4.png", chance: 0.04 },
  { filepath: STONES_PATH, filename: "Rock5_1.png", chance: 0.045 },
  { filepath: STONES_PATH, filename: "Rock5_2.png", chance: 0.05 },
  { filepath: STONES_PATH, filename: "Rock5_3.png", chance: 0.055 },
  { filepath: STONES_PATH, filename: "Rock5_4.png", chance: 0.06 },
  { filepath: STONES_PATH, filename: "Rock6_1.png", chance: 0.065 },
  { filepath: STONES_PATH, filename: "Rock6_2.png", chance: 0.07 },
  { filepath: STONES_PATH, filename: "Rock6_3.png", chance: 0.075 },
  { filepath: STONES_PATH, filename: "Rock6_4.png", chance: 0.08 },
  { filepath: STONES_PATH, filename: "Rock7_1.png", chance: 0.085 },
  { filepath: STONES_PATH, filename: "Rock7_2.png", chance: 0.09 },
  { filepath: STONES_PATH, filename: "Rock7_3.png", chance: 0.095 },
  { filepath: STONES_PATH, filename: "Rock7_4.png", chance: 0.1 },
  { filepath: TREES_PATH, filename: "Burned_tree1.png", chance: 0.125 },
  { filepath: TREES_PATH, filename: "Burned_tree2.png", chance: 0.15 },
  { filepath: TREES_PATH, filename: "Burned_tree2.png", chance: 0.175 },
];

const oceanAssets = [
  { filepath: TREES_PATH, filename: "Broken_tree7.png", chance: 0.001 },
];

const getMapSprite = (
  prng: () => number,
  density: number,
  asset: string,
  hex: TerrainHex
) => {
  const sprites: THREE.Sprite[] = [];
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
    const posX = -x + w / 2 + (prng() - 0.5) * h;
    const posY = -y + h / 2 + (prng() - 0.5) * h;
    Object.assign(sprite.scale, new THREE.Vector3(h, h, 1));
    Object.assign(sprite.position, new THREE.Vector3(posX, posY, 2));
  });
  // Sort so the ones with the highest y's are last
  sprites.sort((a, b) => a.position.y - b.position.y);
  // Return sprite
  return sprites;
};

const loadAsset = (filepath: string) => {
  const texture = new THREE.TextureLoader().load(filepath);
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
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
