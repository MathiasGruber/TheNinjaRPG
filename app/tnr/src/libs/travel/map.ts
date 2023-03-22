import * as THREE from "three";
import { type Grid, Hex, ring } from "honeycomb-grid";
import { BoundingBox, Ellipse } from "honeycomb-grid";
import { HexOffset, HexOptions, Orientation, Point } from "honeycomb-grid";
import { defaultHexSettings } from "honeycomb-grid";
import { createHexDimensions } from "honeycomb-grid";
import { createHexOrigin } from "honeycomb-grid";
import { aStar } from "abstract-astar";

type NonEmptyArray<T> = T[] & { 0: T };

export interface MapPoint {
  x: number;
  y: number;
  z: number;
}

export interface MapTile {
  b: NonEmptyArray<MapPoint>; // boundary
  c: MapPoint; // centerPoint
  t: number; // 0=ocean, 1=land, 2=desert
}

export interface HexagonalFaceMesh extends THREE.Mesh {
  currentHex: number;
  material: THREE.MeshBasicMaterial;
  userData: {
    id: number;
    hex: number;
    tile: TerrainHex;
    highlight: boolean;
  };
}

export interface MapData {
  radius: number;
  tiles: NonEmptyArray<MapTile>;
}

/**
 * Fetches the map data from the server.
 */
export const fetchMap = async () => {
  const response = await fetch("map/hexasphere.json");
  const hexasphere = await response.json().then((data) => data as MapData);
  return hexasphere;
};

/**
 * Hexagonal tile used by honeycomb.js
 */
export class TerrainHex extends Hex {
  level!: number;
  cost!: number;
}
export function defineHex(hexOptions?: Partial<HexOptions>): typeof TerrainHex {
  const { dimensions, orientation, origin, offset } = {
    ...defaultHexSettings,
    ...hexOptions,
  };

  return class extends TerrainHex {
    get dimensions(): Ellipse {
      return createHexDimensions(dimensions as BoundingBox, orientation);
    }

    get orientation(): Orientation {
      return orientation;
    }

    get origin(): Point {
      return createHexOrigin(origin as "topLeft", this);
    }

    get offset(): HexOffset {
      return offset;
    }
  };
}

/**
 * User sprite, which loads the avatar image and displays the health bar as a Three.js sprite
 */
export const createUserSprite = (
  userData: {
    userId: string;
    username: string;
    avatar: string | null;
    longitude: number;
    latitude: number;
    cur_health: number;
    max_health: number;
  },
  grid: Grid<TerrainHex>
) => {
  // Group is used to group components of the user Marker
  const group = new THREE.Group();

  // Get the hex where this is placed
  const hex = grid.getHex({ col: userData.longitude, row: userData.latitude });
  if (!hex) return group;
  const { height: h, width: w } = hex;
  const { x, y } = hex.center;

  // Marker
  const marker = new THREE.TextureLoader().load("map/userMarker.webp");
  const markerMat = new THREE.SpriteMaterial({ map: marker, alphaMap: marker });
  const markerSprite = new THREE.Sprite(markerMat);
  Object.assign(markerSprite.scale, new THREE.Vector3(h, h * 1.2, 1));
  Object.assign(markerSprite.position, new THREE.Vector3(w / 2, h * 0.8, 2));
  group.add(markerSprite);

  // Avatar Sprite
  const alphaMap = new THREE.TextureLoader().load("map/userSpriteMask.webp");
  const map = new THREE.TextureLoader().load(userData.avatar || "");
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: map, alphaMap: alphaMap });
  const sprite = new THREE.Sprite(material);
  Object.assign(sprite.scale, new THREE.Vector3(h * 0.8, h * 0.8, 1));
  Object.assign(sprite.position, new THREE.Vector3(w / 2, h * 0.9, 2));
  group.add(sprite);

  // Move object to the center of the hex in question
  Object.assign(group.position, new THREE.Vector3(-x, -y, 0));
  group.name = userData.userId;

  //sprite.scale.set(0.5, 0.5, 0.5);
  //sprite.name = userData.username;

  //   const healthBar = new THREE.Sprite(
  //     new THREE.SpriteMaterial({
  //       color: 0x00ff00,
  //     })
  //   );
  //   healthBar.scale.set(0.5, 0.05, 0.05);
  //   healthBar.position.set(0, 0.3, 0);
  //   sprite.add(healthBar);

  return group;
};

/**
 * Uses A* algorithm to calculate the shortest path between two hexes.
 */
export class PathCalculator {
  cache: Map<string, TerrainHex[] | undefined>;
  grid: Grid<TerrainHex>;

  constructor(grid: Grid<TerrainHex>) {
    this.cache = new Map<string, TerrainHex[] | undefined>();
    this.grid = grid;
  }

  getShortestPath = (origin: TerrainHex, target: TerrainHex) => {
    const key = `${origin.col},${origin.row},${target.col},${target.row}`;
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    const shortestPath = aStar<TerrainHex>({
      start: origin,
      goal: target,
      estimateFromNodeToGoal: (tile) => this.grid.distance(tile, origin),
      neighborsAdjacentToNode: (center) =>
        this.grid.traverse(ring({ radius: 1, center })).toArray(),
      actualCostToMove: (_, __, tile) => tile.cost,
    });
    this.cache.set(key, shortestPath);
    return shortestPath;
  };
}
