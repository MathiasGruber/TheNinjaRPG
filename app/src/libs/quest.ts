import { ObjectiveReward } from "@/validators/objectives";
import { getQuestCounterFieldName } from "@/validators/user";
import { ObjectiveTracker, QuestTracker } from "@/validators/objectives";
import { secondsPassed } from "@/utils/time";
import { isQuestObjectiveAvailable } from "@/libs/objectives";
import { canChangeContent, canPlayHiddenQuests } from "@/utils/permissions";
import {
  IMG_MISSION_S,
  IMG_MISSION_A,
  IMG_MISSION_B,
  IMG_MISSION_C,
  IMG_MISSION_D,
  IMG_MISSION_E,
  VILLAGE_SYNDICATE_ID,
  MISSIONS_PER_DAY,
  ADDITIONAL_MISSION_REWARD_MULTIPLIER,
  type LetterRank,
  type QuestType,
  MAP_TOTAL_SECTORS,
} from "@/drizzle/constants";
import { SECTOR_WIDTH, SECTOR_HEIGHT } from "@/libs/travel/constants";
import { getUnique } from "@/utils/grouping";
import type { UserWithRelations } from "@/routers/profile";
import type { AllObjectivesType, AllObjectiveTask } from "@/validators/objectives";
import type { Quest, UserData } from "@/drizzle/schema";
import type { QuestTrackerType } from "@/validators/objectives";

/**
 * Get currently active quests for a user
 */
export const getUserQuests = (user: NonNullable<UserWithRelations>) => {
  const userQuests =
    user?.userQuests
      .filter((uq) => !!uq.quest)
      .filter((uq) => isAvailableUserQuests({ ...uq.quest, ...uq }, user).check)
      .map((uq) => ({ ...uq, ...uq.quest })) ?? [];
  return userQuests;
};

/**
 * Get active objectives for a user
 */
export const getActiveObjectives = (user: NonNullable<UserWithRelations>) => {
  const activeQuests = user.userQuests.map((uq) => uq.quest);
  const activeObjectives: AllObjectivesType[] = [];
  activeQuests.forEach((quest) => {
    const tracker = user.questData?.find((q) => q.id === quest.id);
    quest?.content.objectives.forEach((objective, i) => {
      if (tracker && !isQuestObjectiveAvailable(quest, tracker, i)) {
        return;
      }
      const goal = tracker?.goals.find((g) => g.id === objective.id);
      if (goal && goal.done === false) {
        activeObjectives.push(objective);
      }
    });
  });
  return activeObjectives;
};

/**
 * Check if this is a location objective and user is at the location
 */
export const isLocationObjective = (
  location: { latitude: number; longitude: number; sector: number },
  objective: AllObjectivesType,
) => {
  if ("sector" in objective) {
    if (
      location.sector === Number(objective.sector) &&
      location.latitude === Number(objective.latitude) &&
      location.longitude === Number(objective.longitude)
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Go through current user quests, and return updated list of questData &
 * list of rewards to award the user
 */
export const getReward = (user: NonNullable<UserWithRelations>, questId: string) => {
  // Derived
  let rewards = ObjectiveReward.parse({});
  const { trackers } = getNewTrackers(user, [{ task: "any" }]);
  const userQuest = user.userQuests.find((uq) => uq.questId === questId);
  const successDescriptions: string[] = [];
  let resolved = false;
  // Start mutating
  if (userQuest && !userQuest.completed) {
    const tracker = trackers.find((q) => q.id === userQuest.quest.id);
    const goals = tracker?.goals ?? [];
    resolved = (goals.every((g) => g.done) || goals.length === 0) ?? false;
    if (resolved) {
      rewards = ObjectiveReward.parse(userQuest.quest.content.reward);
    }
    userQuest.quest.content.objectives.forEach((objective) => {
      const status = goals.find((g) => g.id === objective.id);
      if (status?.done && !status.collected) {
        status.collected = true;
        if (objective.successDescription) {
          successDescriptions.push(objective.successDescription);
        }
        if (objective.reward_money) {
          rewards.reward_money += objective.reward_money;
        }
        if (objective.reward_clanpoints) {
          rewards.reward_clanpoints += objective.reward_clanpoints;
        }
        if (objective.reward_exp) {
          rewards.reward_exp += objective.reward_exp;
        }
        if (objective.reward_tokens) {
          rewards.reward_tokens += objective.reward_tokens;
        }
        if (objective.reward_prestige) {
          rewards.reward_prestige += objective.reward_prestige;
        }
        if (objective.reward_jutsus) {
          rewards.reward_jutsus.push(...objective.reward_jutsus);
        }
        if (objective.reward_badges) {
          rewards.reward_badges.push(...objective.reward_badges);
        }
        if (objective.reward_items) {
          rewards.reward_items.push(...objective.reward_items);
        }
        if (objective.reward_rank !== "NONE") {
          rewards.reward_rank = objective.reward_rank;
        }
      }
    });
    // Scale rewards
    const isMissionOrCrime =
      userQuest.quest.questType === "mission" || userQuest.quest.questType === "crime";
    const factor =
      isMissionOrCrime && user.dailyMissions > MISSIONS_PER_DAY
        ? ADDITIONAL_MISSION_REWARD_MULTIPLIER
        : 1;
    rewards.reward_money = Math.floor(rewards.reward_money * factor);
    rewards.reward_clanpoints = Math.floor(rewards.reward_clanpoints * factor);
    rewards.reward_exp = Math.floor(rewards.reward_exp * factor);
    rewards.reward_tokens = Math.floor(rewards.reward_tokens * factor);
    rewards.reward_prestige = Math.floor(rewards.reward_prestige * factor);
  }
  return { rewards, trackers, userQuest, resolved, successDescriptions };
};

/**
 * Used to update the quest tracking data for a user. Takes in the user with his questData
 * information, as well as a task to update. The value is the value to update the task with,
 * e.g. if task is 'pvp_kills' and value is 1, then the user has killed 1 player. This function
 * also ensure to remove all questData which is no longer needed, i.e. data relating to quests no longer
 * active for the user
 * @param user  - User with questData
 * @param task - Task to update
 * @param value - Value to update task with
 * @param contentId - If provided, refers to ID of content, e.g. opponentID defeated
 * @param notifications - If provided, is used to set notifications
 */
export const getNewTrackers = (
  user: NonNullable<UserWithRelations>,
  tasks: {
    task: AllObjectiveTask | "any";
    increment?: number;
    value?: number;
    text?: string;
    contentId?: string;
  }[],
) => {
  let shouldUpdateUserInDB = false;
  const questData = user.questData ?? [];
  const activeQuests = getUserQuests(user);
  const notifications: string[] = [];
  const consequences: {
    type: "item" | "combat";
    id: string;
    scaleStats?: boolean;
    scaleGains?: number;
  }[] = [];
  const trackers = activeQuests
    .map((quest) => {
      if (quest) {
        // Get the quest tracker for this quest, or create it
        let questTracker = questData.find((q) => q.id === quest.id);
        if (!questTracker) {
          questTracker = QuestTracker.parse({ id: quest.id });
        }
        // Update the goals of the quest
        questTracker.goals = quest.content.objectives.map((objective, i) => {
          // Get the current goal, or create it
          let status = questTracker?.goals.find((goal) => goal.id === objective.id);
          if (!status) {
            status = ObjectiveTracker.parse({ id: objective.id });
          }
          // Figure out sector & location if not already specified
          if ("sectorType" in objective && !status.sector) {
            if (objective.sectorType === "specific") {
              status.sector = objective.sector;
            } else if (objective.sectorType === "random") {
              status.sector = Math.floor(Math.random() * MAP_TOTAL_SECTORS);
            } else if (objective.sectorType === "from_list") {
              if (objective.sectorList.length === 0) {
                status.sector = Math.floor(Math.random() * MAP_TOTAL_SECTORS);
              } else {
                const idx = Math.floor(Math.random() * objective.sectorList.length);
                status.sector = Number(objective.sectorList?.[idx]);
              }
            } else if (objective.sectorType === "user_village") {
              status.sector = user?.village?.sector || user.sector;
            } else if (objective.sectorType === "current_sector") {
              status.sector = user.sector;
            }
            shouldUpdateUserInDB = true;
          }

          // If locationType is not specific, update the location accordingly
          if ("locationType" in objective && (!status.longitude || !status.latitude)) {
            if (objective.locationType === "specific") {
              status.longitude = objective.longitude;
              status.latitude = objective.latitude;
            } else if (objective.locationType === "random") {
              status.longitude = Math.floor(Math.random() * SECTOR_WIDTH);
              status.latitude = Math.floor(Math.random() * SECTOR_HEIGHT);
            }
            shouldUpdateUserInDB = true;
          }

          // If done, return status
          if (status.done) {
            return status;
          }

          // If not available yet, just skip
          if (questTracker && !isQuestObjectiveAvailable(quest, questTracker, i)) {
            return status;
          }

          //Convenience
          const task = objective.task;
          const isKage = user.village?.kageId === user.userId;

          // General updates we want to apply every time
          if (task === "user_level") {
            status.value = user.level;
          } else if (task === "days_in_village") {
            const days = Math.floor(secondsPassed(user.joinedVillageAt) / 60 / 60 / 24);
            status.value = days;
          } else if (task === "days_as_kage" && isKage && user.village) {
            const seconds = secondsPassed(user.village.leaderUpdatedAt);
            const days = Math.floor(seconds / 60 / 60 / 24);
            status.value = days;
          } else if (task === "reputation_points") {
            status.value = user.reputationPointsTotal;
          } else if (task === "minutes_passed" && questTracker) {
            const minutes = Math.floor(
              secondsPassed(new Date(questTracker.startAt)) / 60,
            );
            status.value = minutes;
          } else if (task.includes("missions_total") || task.includes("crimes_total")) {
            const type = task.includes("missions") ? "mission" : "crime";
            const rank = task.split("_")[0]?.toUpperCase() as LetterRank;
            const field = getQuestCounterFieldName(type, rank);
            if (field) status.value = user[field];
          } else if (task === "errands_total") {
            const field = getQuestCounterFieldName("errand", "D");
            if (field) status.value = user[field];
          }

          // Specific updates requested by the caller
          tasks
            .filter((taskUpdate) => taskUpdate.task === task)
            .forEach((taskUpdate) => {
              // If objective has a value, increment it
              if (status && "value" in objective) {
                if (taskUpdate.increment) {
                  status.value += taskUpdate.increment;
                }
                if (taskUpdate.value) {
                  status.value = taskUpdate.value;
                }
              }
              // If objective has a location, set to completed
              if (status && isLocationObjective(user, objective)) {
                if (task === "move_to_location") {
                  notifications.push(`You arrived at destination for ${quest.name}.`);
                  status.done = true;
                } else if (
                  task === "collect_item" &&
                  "item_name" in objective &&
                  "collect_item_id" in objective &&
                  objective.collect_item_id
                ) {
                  notifications.push(`Got ${objective.item_name} for ${quest.name}.`);
                  consequences.push({ type: "item", id: objective.collect_item_id });
                  status.done = true;
                }
                if (task === "defeat_opponents" && "opponent_ai" in objective) {
                  if (
                    objective.opponent_ai &&
                    objective.opponent_ai !== taskUpdate.contentId
                  ) {
                    notifications.push(`Attacking target for ${quest.name}.`);
                    consequences.push({
                      type: "combat",
                      id: objective.opponent_ai,
                      scaleStats: objective.opponent_scaled_to_user,
                      scaleGains: objective.scaleGains,
                    });
                  }
                }
              }
              if (status && task === "defeat_opponents" && "opponent_ai" in objective) {
                if (
                  taskUpdate.text &&
                  objective.opponent_ai &&
                  objective.opponent_ai === taskUpdate.contentId
                ) {
                  const completionOutcome = objective.completionOutcome || "Win";
                  if (completionOutcome === "Any") {
                    status.done = true;
                  }
                  if (taskUpdate.text === "Won") {
                    if (objective.successDescription) {
                      notifications.push(objective.successDescription);
                    }
                    if (completionOutcome === "Win") {
                      status.done = true;
                    }
                  } else if (taskUpdate.text === "Lost") {
                    if (objective.failDescription) {
                      notifications.push(objective.failDescription);
                    }
                    if (completionOutcome === "Lose") {
                      status.done = true;
                    }
                  } else if (taskUpdate.text === "Draw") {
                    if (objective.drawDescription) {
                      notifications.push(objective.drawDescription);
                    }
                    if (completionOutcome === "Draw") {
                      status.done = true;
                    }
                  } else if (taskUpdate.text === "Fled") {
                    if (objective.fleeDescription) {
                      notifications.push(objective.fleeDescription);
                    }
                    if (completionOutcome === "Flee") {
                      status.done = true;
                    }
                  }
                }
              }
            });
          if ("value" in objective && status.value >= objective.value) {
            status.done = true;
          }
          return status;
        });
        return questTracker;
      }
    })
    .filter((q): q is QuestTrackerType => !!q);

  return {
    trackers: getUnique(trackers, "id"),
    notifications,
    consequences,
    shouldUpdateUserInDB,
  };
};

export const getMissionHallSettings = (isOutlaw: boolean) => {
  const type = isOutlaw ? "crime" : "mission";
  return [
    {
      type: "errand",
      rank: "D",
      name: "Errand",
      image: IMG_MISSION_E,
      delayMinutes: 1,
      description: `Errands typically involve simple tasks such as fetching an item somewhere in the village, delivering groceries, etc.`,
    },
    {
      type: type,
      rank: "D",
      name: "D-rank",
      image: IMG_MISSION_D,
      delayMinutes: 5,
      description: `D-rank ${type}s are the lowest rank of ${type}s. They are usually simple ${type}s that have a low chance of danger, finding & retrieving items, doing manual labor, or fetching a lost cat`,
    },
    {
      type: type,
      rank: "C",
      name: "C-rank",
      image: IMG_MISSION_C,
      delayMinutes: 10,
      description: `C-rank ${type}s are the second lowest rank of ${type}s. They are usually ${type}s that have a chance of danger, e.g. escorting a client through friendly territory, etc.`,
    },
    {
      type: type,
      rank: "B",
      name: "B-rank",
      image: IMG_MISSION_B,
      delayMinutes: 15,
      description: `B-rank ${type}s are the third highest rank of ${type}s. They are usually ${type}s that have a decent chance of danger, e.g. escorting a client through neutral or enemy territory.`,
    },
    {
      type: type,
      rank: "A",
      name: "A-rank",
      image: IMG_MISSION_A,
      delayMinutes: 20,
      description: `A-rank ${type}s are the second highest rank of ${type}s. They usually have a high chance of danger and are considered to be very difficult, e.g. assassinating a target, etc.`,
    },
    {
      type: type,
      rank: "S",
      name: "S-rank",
      image: IMG_MISSION_S,
      delayMinutes: 25,
      description: `S-rank ${type}s are the highest rank of ${type}s. They are usually extremely dangerous and difficult and reserved for kage-level shinobi.`,
    },
  ] as const;
};

export const mockAchievementHistoryEntries = (
  achievements: Quest[],
  user: NonNullable<UserWithRelations>,
) => {
  return achievements
    .filter((q) => q !== null)
    .filter((q) => !q.hidden || canChangeContent(user.role))
    .filter((q) => !user.userQuests?.find((uq) => uq.questId === q.id))
    .map((a) => ({
      id: a.id,
      userId: user.userId,
      questId: a.id,
      questType: a.questType,
      completed: 0,
      previousCompletes: 0,
      previousAttempts: 0,
      quest: a,
      endAt: null,
      startedAt: new Date(),
    }));
};

/**
 * Hides the location information of quest objectives if certain conditions are met.
 *
 * @param quest - The quest object containing objectives.
 * @param user - Optional user data to check against objective sectors.
 *
 * This function iterates over each objective in the quest's content. If an objective has the
 * `hideLocation` property set to true and the user's sector does not match the objective's sector,
 * it will obfuscate the objective's location by setting its latitude, longitude, and sector to 1337.
 */
export const controlShownQuestLocationInformation = (
  quest?: Quest,
  user?: UserData,
) => {
  const tracker = user?.questData?.find((q) => q.id === quest?.id);
  quest?.content.objectives.forEach((objective) => {
    // If we have a tracker which specifies the location, use that (e.g. from random sectors etc)
    const status = tracker?.goals.find((goal) => goal.id === objective.id);
    if (tracker && status) {
      if ("sector" in status && "sector" in objective) {
        objective.sector = status.sector!;
        delete status.sector;
      }
      if ("longitude" in status && "longitude" in objective) {
        objective.longitude = status.longitude!;
        delete status.longitude;
      }
      if ("latitude" in status && "latitude" in objective) {
        objective.latitude = status.latitude!;
        delete status.latitude;
      }
    }

    // If we should hide the location, hide it when the user is not in the sector
    if (
      "hideLocation" in objective &&
      objective.hideLocation &&
      user?.sector !== objective.sector &&
      !canChangeContent(user?.role || "USER")
    ) {
      objective.latitude = 1337;
      objective.longitude = 1337;
      objective.sector = 1337;
    }
  });
};

/**
 * Filters out hidden and expired quests based on the user's role.
 *
 * @param questAndUserQuestInfo - The quest object to be checked.
 * @param role - The role of the user.
 * @returns A boolean indicating whether the quest is either hidden and the user can play hidden quests, or the quest is not expired.
 */
export const isAvailableUserQuests = (
  questAndUserQuestInfo: {
    hidden: boolean;
    questType: QuestType;
    expiresAt?: string | null;
    requiredVillage: string | null;
    prerequisiteQuestId?: string | null;
    previousAttempts?: number | null;
    previousCompletes?: number | null;
    completed?: number | null;
  },
  user: UserData & {
    completedQuests: { id: string; questId: string; completed?: number }[];
  },
  ignorePreviousAttempts = false,
) => {
  const hideCheck = !questAndUserQuestInfo.hidden || canPlayHiddenQuests(user.role);
  const expiresCheck =
    !questAndUserQuestInfo.expiresAt ||
    new Date(questAndUserQuestInfo.expiresAt) > new Date();
  const prevCheck =
    questAndUserQuestInfo.questType !== "event" ||
    !questAndUserQuestInfo.previousAttempts ||
    (questAndUserQuestInfo.previousAttempts <= 1 &&
      questAndUserQuestInfo.completed === 0) ||
    (ignorePreviousAttempts && questAndUserQuestInfo.previousCompletes !== 1);
  const villageCheck =
    !questAndUserQuestInfo.requiredVillage ||
    questAndUserQuestInfo.requiredVillage === user.villageId ||
    (questAndUserQuestInfo.requiredVillage === VILLAGE_SYNDICATE_ID && user.isOutlaw);

  // Story specific checks
  const storyCompletedCheck =
    questAndUserQuestInfo.questType !== "story" ||
    !questAndUserQuestInfo.completed ||
    questAndUserQuestInfo.completed < 1;
  const storyAttemptsCheck =
    questAndUserQuestInfo.questType !== "story" ||
    !questAndUserQuestInfo.previousAttempts ||
    questAndUserQuestInfo.previousAttempts < 3;

  // Check if prerequisite quest is completed
  const prerequisiteCheck =
    !questAndUserQuestInfo.prerequisiteQuestId ||
    user.completedQuests?.some((q) => {
      return (
        q.questId === questAndUserQuestInfo.prerequisiteQuestId && q.completed === 1
      );
    });

  // Check if quest is available
  const check =
    hideCheck &&
    expiresCheck &&
    prevCheck &&
    villageCheck &&
    prerequisiteCheck &&
    storyCompletedCheck &&
    storyAttemptsCheck;

  // If quest is not available, return the reason
  let message = "";
  if (!hideCheck) message += "Quest is hidden\n";
  if (!expiresCheck) message += "Quest has expired\n";
  if (!prevCheck) message += "Quest has been attempted too many times\n";
  if (!villageCheck) message += "Quest is not available in your village\n";
  if (!prerequisiteCheck) message += "You must complete the prerequisite quest first\n";
  if (!storyCompletedCheck) message += "Story quest already completed\n";
  if (!storyAttemptsCheck) message += "Story quest has been attempted too many times\n";
  // Returned detailed info on all the checks
  return { check, message };
};
