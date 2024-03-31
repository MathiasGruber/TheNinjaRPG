import { useEffect } from "react";
import { useSafePush } from "./routing";
import { useRequiredUserData } from "./UserContext";
import { calcIsInVillage } from "@/libs/travel/controls";
import type { VillageStructure } from "@/drizzle/schema";

/**
 * A hook which requires the user to be in their village,
 * otherwise redirect to the profile page
 */
export const useRequireInVillage = () => {
  const { data: userData } = useRequiredUserData();
  const router = useSafePush();
  useEffect(() => {
    if (userData) {
      const inVillage = calcIsInVillage({
        x: userData.longitude,
        y: userData.latitude,
      });
      const inSector = userData.sector === userData.village?.sector;
      if (!inVillage || !inSector) {
        void router.push("/");
      }
    }
  }, [userData, router]);
};

export type StructureAttribute =
  | "anbuSquadsPerLvl"
  | "arenaRewardPerLvl"
  | "bankInterestPerLvl"
  | "blackDiscountPerLvl"
  | "clansPerLvl"
  | "hospitalSpeedupPerLvl"
  | "itemDiscountPerLvl"
  | "patrolsPerLvl"
  | "ramenDiscountPerLvl"
  | "regenIncreasePerLvl"
  | "sleepRegenPerLvl"
  | "structureDiscountPerLvl"
  | "trainBoostPerLvl"
  | "villageDefencePerLvl";

/**
 * Calculates the total boost for a given structure attribute in a village.
 * @param attribute - The attribute to calculate the boost for.
 * @param structures - An optional array of village structures.
 * @returns The total boost for the given attribute.
 */
export const structureBoost = (
  attribute: StructureAttribute,
  structures?: VillageStructure[],
) => {
  return structures?.reduce((a, b) => a + b[attribute] * b.level, 0) ?? 0;
};

/**
 * Calculates the cost of upgrading a village structure.
 *
 * @param structure - The village structure to upgrade.
 * @returns The cost of upgrading the structure in village funds
 */
export const calcStructureUpgrade = (structure: VillageStructure) => {
  const cost = structure.baseCost * (structure.level + 1);
  return Math.floor(cost);
};
