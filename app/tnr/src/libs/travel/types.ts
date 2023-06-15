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

export interface GlobalMapData {
  radius: number;
  tiles: NonEmptyArray<GlobalTile>;
}

export interface SectorUser {
  userId: string;
  username: string;
  curHealth: number;
  maxHealth: number;
  avatar: string | null;
  sector: number;
  longitude: number;
  latitude: number;
  location: string;
}
