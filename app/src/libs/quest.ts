import { ObjectiveReward } from "@/validators/objectives";
import { getQuestCounterFieldName } from "@/validators/user";
import { ObjectiveTracker, QuestTracker } from "@/validators/objectives";
import { secondsPassed } from "@/utils/time";
import type { LetterRank } from "@/drizzle/constants";
import type { UserWithRelations } from "@/routers/profile";
import type { AllObjectivesType, AllObjectiveTask } from "@/validators/objectives";
import type { Quest } from "@/drizzle/schema";
import type { QuestTrackerType } from "@/validators/objectives";

/**
 * Get currently active quests for a user
 */
export const getUserQuests = (user: NonNullable<UserWithRelations>) => {
  return user?.userQuests?.map((uq) => ({ ...uq, ...uq.quest })) ?? [];
};

/**
 * Get active objectives for a user
 */
/**
 * Get active objectives for a user
 */
export const getActiveObjectives = (user: NonNullable<UserWithRelations>) => {
  const activeQuests = user.userQuests.map((uq) => uq.quest);
  const activeObjectives: AllObjectivesType[] = [];
  activeQuests.forEach((quest) => {
    const questTracker = user.questData?.find((q) => q.id === quest.id);
    quest?.content.objectives.forEach((objective) => {
      const goal = questTracker?.goals.find((g) => g.id === objective.id);
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
      location.sector === objective.sector &&
      location.latitude === objective.latitude &&
      location.longitude === objective.longitude
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
    contentId?: string;
  }[],
) => {
  const questData = user.questData ?? [];
  const activeQuests = getUserQuests(user);
  const notifications: string[] = [];
  const consequences: { type: "item" | "combat"; id: string; scale?: boolean }[] = [];
  const trackers = activeQuests
    .map((quest) => {
      if (quest) {
        // Get the quest tracker for this quest, or create it
        let questTracker = questData.find((q) => q.id === quest.id);
        if (!questTracker) {
          questTracker = QuestTracker.parse({ id: quest.id });
        }
        // Update the goals of the quest
        questTracker.goals = quest.content.objectives.map((objective) => {
          // Get the current goal, or create it
          let status = questTracker?.goals.find((goal) => goal.id === objective.id);
          if (!status) {
            status = ObjectiveTracker.parse({ id: objective.id });
          }
          if (status.done) {
            return status;
          }

          // Get the task update for this objective
          const task = objective.task;

          // General updates we want to apply every time
          if (task === "user_level") {
            status.value = user.level;
          } else if (task === "days_in_village") {
            const days = Math.floor(secondsPassed(user.joinedVillageAt) / 60 / 60 / 24);
            status.value = days;
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
          const taskUpdate = tasks.find((t) => t.task === task);
          if (taskUpdate) {
            // If objective has a value, increment it
            if ("value" in objective) {
              if (taskUpdate.increment) {
                status.value += taskUpdate.increment;
              }
              if (taskUpdate.value) {
                status.value = taskUpdate.value;
              }
            }
            // If objective has a location, set to completed
            if (isLocationObjective(user, objective)) {
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
                    scale: objective.opponent_scaled_to_user,
                  });
                }
              }
            }
            if (task === "defeat_opponents" && "opponent_ai" in objective) {
              if (
                objective.opponent_ai &&
                objective.opponent_ai === taskUpdate.contentId
              ) {
                notifications.push(`Opponent defeated for ${quest.name}.`);
                status.done = true;
              }
            }
          }
          if ("value" in objective && status.value >= objective.value) {
            status.done = true;
          }
          return status;
        });
        return questTracker;
      }
    })
    .filter((q): q is QuestTrackerType => !!q);
  return { trackers, notifications, consequences };
};

export const missionHallSettings = [
  {
    type: "errand",
    rank: "D",
    name: "Errand",
    image: "/missions/errands.webp",
    delayMinutes: 1,
    description:
      "Errands typically involve simple tasks such as fetching an item somewhere in the village, delivering groceries, etc.",
  },
  {
    type: "mission",
    rank: "D",
    name: "D-rank",
    image: "/missions/D_mission.webp",
    delayMinutes: 5,
    description:
      "D-rank missions are the lowest rank of missions. They are usually simple missions that have a low chance of danger, finding & retrieving items, doing manual labor, or fetching a lost cat",
  },
  {
    type: "mission",
    rank: "C",
    name: "C-rank",
    image: "/missions/C_mission.webp",
    delayMinutes: 10,
    description:
      "C-rank missions are the second lowest rank of missions. They are usually missions that have a chance of danger, e.g. escorting a client through friendly territory, etc.",
  },
  {
    type: "mission",
    rank: "B",
    name: "B-rank",
    image: "/missions/B_mission.webp",
    delayMinutes: 15,
    description:
      "B-rank missions are the third highest rank of missions. They are usually missions that have a decent chance of danger, e.g. escorting a client through neutral or enemy territory.",
  },
  {
    type: "mission",
    rank: "A",
    name: "A-rank",
    image: "/missions/A_mission.webp",
    delayMinutes: 20,
    description:
      "A-rank missions are the second highest rank of missions. They usually have a high chance of danger and are considered to be very difficult, e.g. assassinating a target, etc.",
  },
  {
    type: "mission",
    rank: "S",
    name: "S-rank",
    image: "/missions/S_mission.webp",
    delayMinutes: 25,
    description:
      "S-rank missions are the highest rank of missions. They are usually extremely dangerous and difficult and reserved for kage-level shinobi.",
  },
] as const;

export const mockAchievementHistoryEntries = (
  quests: Quest[],
  user: NonNullable<UserWithRelations>,
) => {
  return quests
    .filter((q) => !q.hidden)
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
