import { MAP_RESERVED_SECTORS } from "@/drizzle/constants";
import { fetchMap } from "@/libs/travel/globe";

export const checkIfSectorIsAvailable = async (sector: number) => {
  // Check that it's not ocean
  const map = await fetchMap();
  const tile = map.tiles[sector];
  if (!tile) return false;
  // if (tile.t === 0) return false; // Prevent purchasing hideout on ocean
  // Check that it's not reserved
  if (MAP_RESERVED_SECTORS.includes(sector)) return false;
  // Passed all checks
  return true;
};
