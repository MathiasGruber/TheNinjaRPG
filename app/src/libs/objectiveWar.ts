import {
  MAP_RESERVED_SECTORS,
  WAR_ESPIONAGE_TARGET,
  WAR_OBJECTIVES_PER_SIDE,
} from "@/drizzle/constants";
import type { SectorType, War } from "@/drizzle/schema";
import type { WarObjectiveState, WarRules } from "@/validators/war";

/** Resolve the main village credited for a participant; callers supply active allies only. */
export const getWarSide = (
  activeWar: Pick<War, "attackerVillageId" | "defenderVillageId"> & {
    warAllies: { villageId: string; supportVillageId: string }[];
  },
  villageId: string | null,
) => {
  if (!villageId) return null;
  if ([activeWar.attackerVillageId, activeWar.defenderVillageId].includes(villageId))
    return villageId;
  return (
    activeWar.warAllies.find((ally) => ally.villageId === villageId)
      ?.supportVillageId ?? null
  );
};

/** Exclude notice, expired and defeated wars even before background settlement finishes. */
export const isObjectiveWarActive = (
  activeWar: Pick<
    War,
    | "rules"
    | "combatStartedAt"
    | "endedAt"
    | "status"
    | "attackerWarHealth"
    | "defenderWarHealth"
  >,
  now = new Date(),
) =>
  activeWar.status === "ACTIVE" &&
  activeWar.attackerWarHealth > 0 &&
  activeWar.defenderWarHealth > 0 &&
  !activeWar.endedAt &&
  !!activeWar.rules &&
  !!activeWar.combatStartedAt &&
  new Date(activeWar.combatStartedAt) <= now &&
  now.getTime() <
    new Date(activeWar.combatStartedAt).getTime() +
      activeWar.rules.durationDays * 86400000;

/** Missing progress on legacy wars behaves as an empty espionage counter. */
export const getWarEspionage = (
  activeWar: Pick<War, "objectiveState" | "attackerVillageId">,
  sideVillageId: string,
) =>
  (sideVillageId === activeWar.attackerVillageId
    ? activeWar.objectiveState?.attackerEspionage
    : activeWar.objectiveState?.defenderEspionage) ?? 0;

/** Both sides' objective locations unlock together when the viewing side finishes espionage. */
export const areWarObjectivesRevealed = (
  activeWar: Pick<War, "objectiveState" | "attackerVillageId">,
  sideVillageId: string,
) => getWarEspionage(activeWar, sideVillageId) >= WAR_ESPIONAGE_TARGET;

/**
 * Choose distinct, usable shrines. Ordinary ownership blocks reserve fallback even
 * when those ordinary shrines are destroyed, disputed or temporarily locked.
 */
export const selectWarObjectives = (
  sectors: Pick<
    SectorType,
    "sector" | "villageId" | "boostLockedUntil" | "shrineLevel"
  >[],
  villageId: string,
  homeSector: number,
  rules: WarRules,
  random = Math.random,
  excludedSectors: number[] = [],
): WarObjectiveState[] => {
  const owned = sectors.filter((s) => s.villageId === villageId);
  const ordinary = owned.filter(
    (s) => s.sector !== homeSector && !MAP_RESERVED_SECTORS.includes(s.sector),
  );
  const eligible = (ordinary.length ? ordinary : owned).filter(
    (s) =>
      s.shrineLevel > 0 &&
      !excludedSectors.includes(s.sector) &&
      (!s.boostLockedUntil || new Date(s.boostLockedUntil) <= new Date()),
  );
  // Fisher-Yates avoids the bias of random comparator sorting.
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j]!, eligible[i]!];
  }
  return eligible.slice(0, WAR_OBJECTIVES_PER_SIDE).map((s) => ({
    sector: s.sector,
    villageId,
    hp: rules.shrineHp,
    maxHp: rules.shrineHp,
    isReserve: s.sector === homeSector || MAP_RESERVED_SECTORS.includes(s.sector),
    destroyed: false,
  }));
};

/** Only authorized leaders or a side whose espionage is complete receive locations. */
export const maskWarObjectives = <
  T extends War & { warAllies: { villageId: string; supportVillageId: string }[] },
>(
  activeWar: T,
  villageId: string | null,
  isLeader: boolean,
): T => {
  if (!activeWar.objectiveState) return activeWar;
  const side = getWarSide(activeWar, villageId);
  if (side && (isLeader || areWarObjectivesRevealed(activeWar, side))) return activeWar;
  return {
    ...activeWar,
    objectiveState: { ...activeWar.objectiveState, objectives: [] },
  };
};
