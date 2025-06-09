import {
  IMG_BADGE_PVPKILLS,
  IMG_BADGE_ARENAKILLS,
  IMG_BADGE_MINUTES_PASSED,
  IMG_BADGE_ERRANDS_TOTAL,
  IMG_BADGE_D_MISSION_TOTAL,
  IMG_BADGE_C_MISSION_TOTAL,
  IMG_BADGE_B_MISSION_TOTAL,
  IMG_BADGE_A_MISSION_TOTAL,
  IMG_BADGE_D_CRIME_TOTAL,
  IMG_BADGE_C_CRIME_TOTAL,
  IMG_BADGE_B_CRIME_TOTAL,
  IMG_BADGE_A_CRIME_TOTAL,
  IMG_BADGE_MINUTES_TRAINING,
  IMG_BADGE_JUTSUS_MASTERED,
  IMG_BADGE_STATS_TRAINED,
  IMG_BADGE_DAYS_IN_VILLAGE,
  IMG_BADGE_REPUTATION_POINTS,
  IMG_BADGE_USER_LEVEL,
  IMG_BADGE_MOVE_TO_LOCATION,
  IMG_BADGE_COLLECT_ITEM,
  IMG_BADGE_DEFEAT_OPPONENTS,
} from "@/drizzle/constants";
import type { Quest } from "@/drizzle/schema";
import type { AllObjectivesType } from "@/validators/objectives";
import type { QuestTrackerType } from "@/validators/objectives";

export const getObjectiveImage = (objective: AllObjectivesType) => {
  switch (objective.task) {
    case "pvp_kills":
      return { image: IMG_BADGE_PVPKILLS, title: "PVP kills" };
    case "arena_kills":
      return { image: IMG_BADGE_ARENAKILLS, title: "Arena kills" };
    case "minutes_passed":
      return { image: IMG_BADGE_MINUTES_PASSED, title: "Minutes passed" };
    case "errands_total":
      return { image: IMG_BADGE_ERRANDS_TOTAL, title: "Errands" };
    case "d_missions_total":
      return { image: IMG_BADGE_D_MISSION_TOTAL, title: "D-rank Missions" };
    case "c_missions_total":
      return { image: IMG_BADGE_C_MISSION_TOTAL, title: "C-rank Missions" };
    case "b_missions_total":
      return { image: IMG_BADGE_B_MISSION_TOTAL, title: "B-rank Missions" };
    case "a_missions_total":
      return { image: IMG_BADGE_A_MISSION_TOTAL, title: "A-rank Missions" };
    case "d_crimes_total":
      return { image: IMG_BADGE_D_CRIME_TOTAL, title: "D-rank crimes" };
    case "c_crimes_total":
      return { image: IMG_BADGE_C_CRIME_TOTAL, title: "C-rank crimes" };
    case "b_crimes_total":
      return { image: IMG_BADGE_B_CRIME_TOTAL, title: "B-rank crimes" };
    case "a_crimes_total":
      return { image: IMG_BADGE_A_CRIME_TOTAL, title: "A-rank crimes" };
    case "minutes_training":
      return { image: IMG_BADGE_MINUTES_TRAINING, title: "Minutes Training" };
    case "jutsus_mastered":
      return { image: IMG_BADGE_JUTSUS_MASTERED, title: "Jutsus Mastered" };
    case "stats_trained":
      return { image: IMG_BADGE_STATS_TRAINED, title: "Stats Trained" };
    case "days_in_village":
      return { image: IMG_BADGE_DAYS_IN_VILLAGE, title: "Days in Village" };
    case "reputation_points":
      return { image: IMG_BADGE_REPUTATION_POINTS, title: "Reputation Bought" };
    case "user_level":
      return { image: IMG_BADGE_USER_LEVEL, title: "User Level" };
    case "move_to_location":
      return { image: IMG_BADGE_MOVE_TO_LOCATION, title: "Travel" };
    case "collect_item":
      return { image: IMG_BADGE_COLLECT_ITEM, title: "Collect Item" };
    case "defeat_opponents":
      return { image: IMG_BADGE_DEFEAT_OPPONENTS, title: "Defeat" };
    default:
      return { image: "", title: "???" };
  }
};

/**
 * Checks if an objective is complete based on the provided tracker and objective.
 * @param tracker - The quest tracker object.
 * @param objective - The objective to check.
 * @returns An object containing the value, done status, and canCollect status of the objective.
 */
export const isObjectiveComplete = (
  tracker: QuestTrackerType,
  objective: AllObjectivesType,
) => {
  const status = tracker.goals.find((g) => g.id === objective.id);
  const value = status?.value || 0;
  const done = status?.done || ("value" in objective && value >= objective.value);
  const canCollect = !status?.collected && done;
  return { value, done, canCollect, status };
};

/**
 * Checks if a quest objective is available. If the quest has consecutive objectives,
 * the previous objective must be completed before the current one is available.
 *
 * @param quest - The quest object.
 * @param tracker - The quest tracker object.
 * @param objectiveIdx - The index of the objective to check.
 * @returns A boolean indicating whether the objective is available.
 */
export const isQuestObjectiveAvailable = (
  quest: Quest,
  tracker: QuestTrackerType,
  objectiveIdx: number,
) => {
  if (quest.consecutiveObjectives && objectiveIdx > 0) {
    const prevObjective = quest.content.objectives[objectiveIdx - 1];
    if (prevObjective) {
      const { done } = isObjectiveComplete(tracker, prevObjective);
      return done;
    }
  }
  return true;
};
