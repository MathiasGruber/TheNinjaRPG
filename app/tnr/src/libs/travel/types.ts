import { Hex } from "honeycomb-grid";

type NonEmptyArray<T> = T[] & { 0: T };

export interface GlobalPoint {
  x: number;
  y: number;
  z: number;
}

export interface GlobalTile {
  b: NonEmptyArray<GlobalPoint>; // boundary
  c: GlobalPoint; // centerPoint
  t: number; // 0=ocean, 1=land, 2=desert
}

export interface SectorPoint {
  x: number;
  y: number;
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

export interface GlobalMapData {
  radius: number;
  tiles: NonEmptyArray<GlobalTile>;
}

export class TerrainHex extends Hex {
  level!: number;
  cost!: number;
}

export interface SectorUser {
  userId: string;
  username: string;
  cur_health: number;
  max_health: number;
  avatar: string | null;
  sector: number;
  longitude: number;
  latitude: number;
  location: string;
}
