import { MAP_SECTOR_ID_MAX, SECTOR_MAP_MAX_DIMENSION } from "@/drizzle/constants";
import type { Quest } from "@/drizzle/schema";
import { findCompletedPredecessor, isQuestObjectiveAvailable } from "@/libs/objectives";
import type { UserWithRelations } from "@/routers/profile";
import { calculateContentDiff } from "@/utils/diff";
import type { MapLocation } from "@/validators/mapLocation";
import { mapLocationFields } from "@/validators/mapLocation";
import type { AllObjectivesType } from "@/validators/objectives";

/** Cosmetic map edits preserve accepted quest runs; gameplay edits retain revision checks. */
export const isQuestPresentationOnlyChange = <
  T extends {
    hidden: boolean;
    publicLocations: boolean;
    content: { objectives: AllObjectivesType[] };
  },
>(
  before: T,
  after: T,
) => {
  const comparable = (value: T) => ({
    ...value,
    hidden: false,
    publicLocations: false,
    content: {
      ...value.content,
      objectives: value.content.objectives.map((objective) => {
        const fields = new Set(Object.keys(mapLocationFields));
        return Object.fromEntries(
          Object.entries(objective).filter(([key]) => !fields.has(key)),
        );
      }),
    },
  });
  return calculateContentDiff(comparable(before), comparable(after)).length === 0;
};

export const questLocationId = (questId: string, objectiveId: string) =>
  `quest:${questId}:${objectiveId}`;

/** Only neutral location presentation crosses the public boundary. */
export const publicQuestLocations = (
  quests: (Pick<Quest, "id" | "hidden" | "startsAt" | "endsAt"> & {
    content: { objectives: AllObjectivesType[] };
  })[],
  now = new Date(),
): MapLocation[] => {
  const today = now.toISOString().slice(0, 10);
  return quests.flatMap((quest) => {
    if (
      quest.hidden ||
      (quest.startsAt && quest.startsAt > today) ||
      (quest.endsAt && quest.endsAt < today)
    )
      return [];
    return quest.content.objectives.flatMap((objective) => {
      if (
        !objective.structureAssetId ||
        !("sectorType" in objective) ||
        objective.sectorType !== "specific" ||
        !("locationType" in objective) ||
        objective.locationType !== "specific" ||
        objective.hideLocation ||
        objective.overworldPlacementId
      )
        return [];
      const location = objectiveMapLocation(quest.id, objective, objective);
      return location ? [location] : [];
    });
  });
};

const objectiveMapLocation = (
  questId: string,
  objective: {
    id: string;
    sector?: number;
    longitude?: number;
    latitude?: number;
    overworldPlacementId?: string;
  },
  presentation: AllObjectivesType,
): MapLocation | null => {
  if (
    !presentation.structureAssetId ||
    ![objective.sector, objective.longitude, objective.latitude].every(
      (v) => typeof v === "number" && Number.isInteger(v) && v >= 0,
    ) ||
    (objective.sector ?? Infinity) > MAP_SECTOR_ID_MAX ||
    (objective.longitude ?? Infinity) >= SECTOR_MAP_MAX_DIMENSION ||
    (objective.latitude ?? Infinity) >= SECTOR_MAP_MAX_DIMENSION
  )
    return null;
  return {
    id: questLocationId(questId, presentation.id),
    questId,
    objectiveId: objective.id,
    ...(objective.overworldPlacementId
      ? { npcPlacementId: objective.overworldPlacementId }
      : {}),
    sector: objective.sector as number,
    longitude: objective.longitude as number,
    latitude: objective.latitude as number,
    name: presentation.locationName || "Quest location",
    description: presentation.locationDescription || "",
    assetId: presentation.structureAssetId,
    scale: presentation.structureScale ?? 1,
  };
};

/** Public scenery survives completion; private scenery follows the selected same-location chain. */
export const getQuestMapLocations = (
  user: NonNullable<UserWithRelations>,
  publicLocations: MapLocation[],
  placements: {
    npcPlacementId?: string | null;
    sector: number;
    longitude: number;
    latitude: number;
  }[] = [],
): MapLocation[] => {
  const locations = new Map(publicLocations.map((location) => [location.id, location]));
  for (const entry of user.userQuests) {
    if (entry.completed || entry.endAt || !entry.quest) continue;
    const quest = entry.quest;
    const tracker = user.questData?.find((t) => t.id === quest.id);
    if (!tracker) continue;
    quest.content.objectives.forEach((objective, index) => {
      const goal = tracker.goals.find((g) => g.id === objective.id);
      if (!goal || goal.done || !isQuestObjectiveAvailable(quest, tracker, index))
        return;
      const resolved = {
        ...objective,
        sector: goal.sector,
        longitude: goal.longitude,
        latitude: goal.latitude,
      };
      if (objective.overworldPlacementId) {
        const placement = placements.find(
          (p) => p.npcPlacementId === objective.overworldPlacementId,
        );
        if (!placement) return;
        Object.assign(resolved, {
          sector: placement.sector,
          longitude: placement.longitude,
          latitude: placement.latitude,
        });
      }
      let presentation = objective;
      const visited = new Set<string>();
      while (!presentation.structureAssetId && !visited.has(presentation.id)) {
        visited.add(presentation.id);
        const previous = findCompletedPredecessor(
          quest.content.objectives,
          presentation.id,
          tracker,
        );
        const previousGoal = tracker.goals.find((g) => g.id === previous?.id);
        if (
          !previous ||
          previousGoal?.sector !== goal.sector ||
          previousGoal?.longitude !== goal.longitude ||
          previousGoal?.latitude !== goal.latitude
        )
          break;
        presentation = previous;
      }
      // Fixed NPC bindings retain their authored position and still require the NPC interaction.
      const location = objectiveMapLocation(quest.id, resolved, presentation);
      if (location) locations.set(location.id, { ...location, active: true });
    });
  }
  return [...locations.values()];
};

/** Shared artwork at a shared tile is one landmark; retain every active quest action. */
export const groupMapLocations = (locations: MapLocation[]) => {
  const groups = new Map<string, MapLocation[]>();
  for (const location of locations) {
    const key = `${location.sector}:${location.longitude}:${location.latitude}`;
    const group = groups.get(key) ?? [];
    group.push(location);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) =>
    group.sort(
      (a, b) => Number(!!b.active) - Number(!!a.active) || a.id.localeCompare(b.id),
    ),
  );
};
