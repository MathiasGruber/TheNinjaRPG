import { useEffect } from "react";
import { useSafePush } from "./routing";
import { useRequiredUserData } from "./UserContext";
import { calcIsInVillage } from "@/libs/travel/controls";
import { api } from "@/utils/api";
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
  | "trainSpeedPerLvl"
  | "villageDefencePerLvl";

export const calcStructureContribution = (
  attribute: StructureAttribute,
  structures?: VillageStructure[],
) => {
  return structures?.reduce((a, b) => a + b[attribute] * b.level, 0) ?? 0;
};
