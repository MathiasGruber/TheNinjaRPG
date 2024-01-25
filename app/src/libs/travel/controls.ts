import { type SectorPoint, type GlobalMapData } from "./types";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "./constants";
import { VILLAGE_LONG, VILLAGE_LAT } from "./constants";

/**
 * Check if a given position is at the edge of a sector
 */
export const isAtEdge = (position: SectorPoint | null) => {
  return (
    position &&
    (position.x === 0 ||
      position.x === SECTOR_WIDTH - 1 ||
      position.y === 0 ||
      position.y === SECTOR_HEIGHT - 1)
  );
};

/**
 * Based on current position, find the nearest edge
 */
export const findNearestEdge = (position: SectorPoint) => {
  const x = position.x < SECTOR_WIDTH / 2 ? 0 : SECTOR_WIDTH - 1;
  const y = position.y < SECTOR_HEIGHT / 2 ? 0 : SECTOR_HEIGHT - 1;
  return { x: x, y: y };
};

// Calculate distance between two points on the hexasphere
export const calcGlobalTravelTime = (
  sectorA: number,
  sectorB: number,
  map: GlobalMapData,
) => {
  const a = map?.tiles[sectorA]?.c;
  const b = map?.tiles[sectorB]?.c;
  const r = map?.radius;
  if (a && b && r) {
    const distance = r * Math.acos((a.x * b.x + a.y * b.y + a.z * b.z) / r ** 2);
    return Math.floor(distance / 2);
  }
  return Infinity;
};

// Calculate if we are in village or not. Villages are located within 1 square of its location
export const calcIsInVillage = (position: SectorPoint) => {
  return (
    position.x <= VILLAGE_LONG + 1 &&
    position.x >= VILLAGE_LONG - 1 &&
    position.y <= VILLAGE_LAT + 1 &&
    position.y >= VILLAGE_LAT - 1 &&
    !(position.x === VILLAGE_LONG - 1 && position.y === VILLAGE_LAT + 1) &&
    !(position.x === VILLAGE_LONG + 1 && position.y === VILLAGE_LAT + 1)
  );
};

// Maximum distance between two set of longitudes / latitudes
export const maxDistance = (
  userData: { longitude: number; latitude: number },
  b: SectorPoint,
) => {
  return Math.max(
    Math.abs(userData.longitude - b.x),
    Math.abs(userData.latitude - b.y),
  );
};
