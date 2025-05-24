import fetchRetry from "fetch-retry";
import { IMG_MAP_HEXASPHERE } from "@/drizzle/constants";
import { type GlobalMapData } from "./types";

/**
 * Fetches the map data from the server.
 */
export const fetchMap = async () => {
  const fetch = fetchRetry(global.fetch);
  const response = await fetch(IMG_MAP_HEXASPHERE, {
    retries: 3,
    retryDelay: function (attempt) {
      return Math.pow(2, attempt) * 1000; // 1000, 2000, 4000
    },
  });
  const hexasphere = await response.json().then((data) => data as GlobalMapData);
  return hexasphere;
};
