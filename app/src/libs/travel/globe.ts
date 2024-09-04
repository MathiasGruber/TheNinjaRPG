import { IMG_MAP_HEXASPHERE } from "@/drizzle/constants";
import { type GlobalMapData } from "./types";

/**
 * Fetches the map data from the server.
 */
export const fetchMap = async () => {
  const response = await fetch(IMG_MAP_HEXASPHERE);
  const hexasphere = await response.json().then((data) => data as GlobalMapData);
  return hexasphere;
};
