import { useEffect, useState } from "react";
import { useSafePush } from "./routing";
import { useRequiredUserData } from "./UserContext";
import { calcIsInVillage } from "@/libs/travel/controls";
import { api } from "@/utils/api";
import { findVillageUserRelationship } from "@/utils/alliance";
import type { UserWithRelations } from "@/routers/profile";
import type { Village, VillageStructure, VillageAlliance } from "@/drizzle/schema";
import type { StructureName } from "@/drizzle/seeds/village";

/**
 * A hook which requires the user to be in their village,
 * otherwise redirect to the profile page. Can optionally be
 * narrowed further to a specific structure in the village
 */
export const useRequireInVillage = (structureName?: StructureName) => {
  // Access state
  const [access, setAccess] = useState<boolean>(false);
  // Get user information
  const { data: userData, timeDiff } = useRequiredUserData();
  // Get sector information based on user data
  const { data: sectorVillage, isPending } = api.travel.getVillageInSector.useQuery(
    { sector: userData?.sector ?? -1 },
    { enabled: userData?.sector !== undefined, staleTime: Infinity },
  );
  const ownVillage = userData?.village?.sector === sectorVillage?.sector;
  const router = useSafePush();
  useEffect(() => {
    if (userData && !isPending) {
      // Check structure access
      const access = canAccessStructure(userData, structureName, sectorVillage);
      // If not in village or village not exist
      const inVillage = calcIsInVillage({
        x: userData.longitude,
        y: userData.latitude,
      });
      // Redirect user
      if (!inVillage || !sectorVillage || !access) {
        void router.push("/");
      } else {
        setAccess(true);
      }
    }
  }, [userData, sectorVillage, router, isPending, structureName, ownVillage]);
  return { userData, sectorVillage, ownVillage, timeDiff, access };
};

/**
 * Checks if a user can access a specific structure in a village.
 * @param userData - The user data.
 * @param structureName - The name of the structure to check access for.
 * @param sectorVillage - The sector village data, including relationships and structures.
 * @returns A boolean indicating whether the user can access the structure.
 */
export const canAccessStructure = (
  userData: NonNullable<UserWithRelations>,
  structureName?: StructureName,
  sectorVillage?: Village & {
    relationshipA: VillageAlliance[];
    relationshipB: VillageAlliance[];
    structures: VillageStructure[];
  },
) => {
  let structureAccess = true;
  const ownVillage = userData?.village?.sector === sectorVillage?.sector;
  if (structureName && sectorVillage) {
    const relationship = findVillageUserRelationship(
      sectorVillage,
      userData.villageId ?? "syndicate",
    );
    const isAlly = relationship?.status === "ALLY";
    const structure = sectorVillage?.structures.find((s) => s.name === structureName);
    if (!structure || (!ownVillage && (!isAlly || structure.allyAccess === 0))) {
      structureAccess = false;
    }
  }
  return structureAccess;
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
