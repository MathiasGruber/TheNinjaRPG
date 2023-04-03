import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import { Grid, ring, rectangle } from "honeycomb-grid";
import { type BoundingBox, type Ellipse } from "honeycomb-grid";
import { Orientation, type Point } from "honeycomb-grid";
import { type HexOffset, type HexOptions } from "honeycomb-grid";
import { defaultHexSettings } from "honeycomb-grid";
import { createHexDimensions } from "honeycomb-grid";
import { createHexOrigin } from "honeycomb-grid";
import { aStar } from "abstract-astar";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "./constants";
import { TerrainHex, type GlobalTile } from "./types";
import { getTileInfo } from "./biome";
import { calcIsInVillage } from "./controls";

/**
 * Hexagonal tile used by honeycomb.js
 */
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
 * Creates heaxognal grid & draw it using Three.js. Return groups of objects drawn
 */
export const createSectorBackground = (
  width: number,
  prng: () => number,
  hasVillage: boolean,
  globalTile: GlobalTile
) => {
  // Calculate hex size
  const stackingDisplacement = 1.31;
  const hexsize = (width / SECTOR_WIDTH / 2) * stackingDisplacement;

  // Used for procedural map generation
  const noiseGen = createNoise2D(prng);

  // Create the grid first
  const Tile = defineHex({
    dimensions: hexsize,
    origin: { x: -hexsize, y: -hexsize },
    orientation: Orientation.FLAT,
  });
  const honeycombGrid = new Grid(
    Tile,
    rectangle({ width: SECTOR_WIDTH, height: SECTOR_HEIGHT })
  ).map((tile) => {
    const nx = tile.col / SECTOR_WIDTH - 0.5;
    const ny = tile.row / SECTOR_HEIGHT - 0.5;
    tile.level = noiseGen(nx, ny) / 2 + 0.5;
    tile.cost = 1;
    return tile;
  });

  // Groups for organizing objects
  const group_tiles = new THREE.Group();
  const group_edges = new THREE.Group();
  const group_assets = new THREE.Group();

  // Hex points
  const points = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];

  // Line material to use for edges
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x555555 });

  // Draw the tiles
  honeycombGrid.forEach((tile) => {
    if (tile) {
      const { material, sprites } = getTileInfo(prng, tile, globalTile);
      if (!hasVillage || !calcIsInVillage({ x: tile.col, y: tile.row })) {
        sprites.map((sprite) => group_assets.add(sprite));
      }

      const geometry = new THREE.BufferGeometry();
      const corners = tile.corners;
      const vertices = new Float32Array(
        points.map((p) => corners[p]).flatMap((p) => (p ? [p.x, p.y, -10] : []))
      );
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      const mesh = new THREE.Mesh(geometry, material?.clone());
      mesh.name = `${tile.row},${tile.col}`;
      mesh.userData.type = "tile";
      mesh.userData.tile = tile;
      mesh.userData.hex = material?.color.getHex();
      mesh.userData.highlight = false;
      mesh.matrixAutoUpdate = false;
      group_tiles.add(mesh);

      const edges = new THREE.EdgesGeometry(geometry);
      edges.translate(0, 0, 1);
      const edgeMesh = new THREE.Line(edges, lineMaterial);
      edgeMesh.matrixAutoUpdate = false;
      group_edges.add(edgeMesh);
    }
  });

  // Reverse the order of objects in the group_assets
  group_assets.children.sort((a, b) => b.position.y - a.position.y);

  return { group_tiles, group_edges, group_assets, honeycombGrid };
};

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
  hex: TerrainHex
) => {
  // Group is used to group components of the user Marker
  const group = new THREE.Group();
  const { height: h, width: w } = hex;

  // Marker
  const marker = new THREE.TextureLoader().load("map/userMarker.webp");
  const markerMat = new THREE.SpriteMaterial({ map: marker, alphaMap: marker });
  const markerSprite = new THREE.Sprite(markerMat);
  markerSprite.userData.type = "marker";
  Object.assign(markerSprite.scale, new THREE.Vector3(h, h * 1.2, 0.00000001));
  Object.assign(markerSprite.position, new THREE.Vector3(w / 2, h * 0.9, -6));
  group.add(markerSprite);

  // Avatar Sprite
  const alphaMap = new THREE.TextureLoader().load("map/userSpriteMask.webp");
  const map = new THREE.TextureLoader().load(userData.avatar || "");
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: map, alphaMap: alphaMap });
  const sprite = new THREE.Sprite(material);
  Object.assign(sprite.scale, new THREE.Vector3(h * 0.8, h * 0.8, 0.00000001));
  Object.assign(sprite.position, new THREE.Vector3(w / 2, h * 1.0, -6));
  group.add(sprite);

  // Attack button
  const attack = new THREE.TextureLoader().load("map/attack.png");
  const attackMat = new THREE.SpriteMaterial({ map: attack, depthTest: false });
  const attackSprite = new THREE.Sprite(attackMat);
  attackSprite.visible = false;
  attackSprite.userData.userId = userData.userId;
  attackSprite.userData.type = "attack";
  Object.assign(attackSprite.scale, new THREE.Vector3(h * 0.8, h * 0.8, 0.00000001));
  Object.assign(attackSprite.position, new THREE.Vector3(w * 0.9, h * 1.4, -5));
  group.add(attackSprite);

  // Info button
  const info = new THREE.TextureLoader().load("map/info.png");
  const infoMat = new THREE.SpriteMaterial({ map: info, depthTest: false });
  const infoSprite = new THREE.Sprite(infoMat);
  infoSprite.visible = false;
  infoSprite.userData.userId = userData.userId;
  infoSprite.userData.type = "info";
  Object.assign(infoSprite.scale, new THREE.Vector3(h * 0.7, h * 0.7, 0.00000001));
  Object.assign(infoSprite.position, new THREE.Vector3(w * 0.1, h * 1.4, -5));
  group.add(infoSprite);

  // Name
  group.name = userData.userId;
  group.userData.type = "user";
  group.userData.userId = userData.userId;
  group.userData.hex = hex;

  return group;
};

/**
 * User sprite, which loads the avatar image and displays the health bar as a Three.js sprite
 */
export const createMultipleUserSprite = (
  nUsers: number,
  location: string,
  dimensions: { height: number; width: number }
) => {
  // Group is used to group components of the user Marker
  const group = new THREE.Group();
  const { height: h, width: w } = dimensions;

  // Avatar Sprite
  const canvas = document.createElement("canvas");
  const r = 3;
  canvas.width = r * h;
  canvas.height = r * h;
  const context = canvas.getContext("2d");
  if (context) {
    context.font = `bold ${(r * h) / 2}px Serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    // NOTE: drawing a circle here there is a bug with alphaMap and userSprite sorting
    //       Therefore doing a square for now
    // const centerX = canvas.width / 2;
    // const centerY = canvas.height / 2;
    // const radius = ((r - 0.1) * h) / 2;
    // context.beginPath();
    // context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
    // context.fillStyle = "darkorange";
    // context.fill();
    // context.lineWidth = 1;
    // context.strokeStyle = "#003300";
    // context.stroke();
    context.fillStyle = "firebrick";
    context.fillRect(0, 0, r * h, r * h);
    context.lineWidth = h / 2;
    context.strokeStyle = "maroon";
    context.strokeRect(0, 0, r * h, r * h);
    context.fillStyle = "white";
    context.fillText(`${nUsers}`, (r * h) / 2, (r * h) / 2);
  }
  const texture = new THREE.Texture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(w * 0.8, h * 1.3, -4);
  sprite.scale.set(h * 0.5, h * 0.5, 0.00000001);
  group.add(sprite);

  // Name
  group.name = location;
  group.userData.type = "users";

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
