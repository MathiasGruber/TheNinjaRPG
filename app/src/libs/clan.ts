import { fetchMap } from "@/libs/travel/globe";

export const checkIfSectorIsAvailable = async (sector: number) => {
  // Check that it's not ocean
  const map = await fetchMap();
  const tile = map.tiles[sector];
  if (!tile) return false;
  // if (tile.t === 0) return false; // Prevent purchasing hideout on ocean
  // Check that it's not reserved
  const reservedSectors = [
    332, 336, 341, 335, 340, 334, 330, 331, 332, 337, 342, 12, 18, 109, 113, 308, 305,
    307, 304, 275, 279, 201, 284, 283, 259, 95, 75, 289, 253, 260, 72, 272, 271, 203,
    264, 270, 254, 83, 93,
  ];
  if (reservedSectors.includes(sector)) return false;
  // Passed all checks
  return true;
};
