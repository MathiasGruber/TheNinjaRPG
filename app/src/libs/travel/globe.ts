import { type GlobalMapData } from "./types";

/**
 * Fetches the map data from the server.
 */
export const fetchMap = async () => {
  const response = await fetch("/map/hexasphere.json");
  const hexasphere = await response.json().then((data) => data as GlobalMapData);
  return hexasphere;
};
