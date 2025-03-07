import { JUTSU_TRANSFER_FREE_AMOUNT } from "@/drizzle/constants";
import { JUTSU_TRANSFER_FREE_NORMAL } from "@/drizzle/constants";
import { JUTSU_TRANSFER_FREE_SILVER } from "@/drizzle/constants";
import { JUTSU_TRANSFER_FREE_GOLD } from "@/drizzle/constants";
import type { FederalStatus } from "@/drizzle/constants";

/**
 * Get the number of free jutsu level transfers based on the federal status
 * @param federalStatus
 * @returns
 */
export const getFreeTransfers = (federalStatus: FederalStatus) => {
  switch (federalStatus) {
    case "GOLD":
      return JUTSU_TRANSFER_FREE_GOLD;
    case "SILVER":
      return JUTSU_TRANSFER_FREE_SILVER;
    case "NORMAL":
      return JUTSU_TRANSFER_FREE_NORMAL;
    default:
      return JUTSU_TRANSFER_FREE_AMOUNT;
  }
};
