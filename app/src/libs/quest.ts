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
  type LetterRank,
  type QuestType,
} from "@/drizzle/constants";
import type { UserWithRelations } from "@/routers/profile";
import type { AllObjectivesType, AllObjectiveTask } from "@/validators/objectives";
import type { Quest, UserData } from "@/drizzle/schema";
import type { QuestTrackerType } from "@/validators/objectives";

/**
 * Get currently active quests for a user
 */
export const getUserQuests = (user: NonNullable<UserWithRelations>) => {
  return (
    user?.userQuests.filter((uq) => !!uq.quest).map((uq) => ({ ...uq, ...uq.quest })) ??
    []
  );
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
      location.sector === objective.sector &&
      location.latitude === objective.latitude &&
      location.longitude === objective.longitude
    ) {
      return true;
    }
  }
  return false;
};

export const handleDialogActions = async (
  client: DrizzleClient,
  user: NonNullable<UserWithRelations>,
  actions: { type: string; value?: string }[],
) => {
  const consequences: {
    type: "item" | "combat" | "jutsu" | "bloodline" | "feature";
    id: string;
    scaleStats?: boolean;
    scaleGains?: number;
  }[] = [];

  for (const action of actions) {
    switch (action.type) {
      case "quest_fail":
        // Quest failure is handled by the quest router
        break;
      case "collect_item":
        if (action.value) {
          consequences.push({ type: "item", id: action.value });
        }
        break;
      case "collect_jutsu":
        if (action.value) {
          consequences.push({ type: "jutsu", id: action.value });
        }
        break;
      case "collect_bloodline":
        if (action.value) {
          consequences.push({ type: "bloodline", id: action.value });
        }
        break;
      case "start_battle":
        if (action.value) {
          consequences.push({ type: "combat", id: action.value });
        }
        break;
      case "unlock_feature":
      case "lock_feature":
        if (action.value) {
          consequences.push({
            type: "feature",
            id: action.value,
            scaleStats: action.type === "unlock_feature"
          });
        }
        break;
    }
  }

  return consequences;
};

/**
 * Go through current user quests, and return updated list of questData &
 * list of rewards to award the user
 */
export const getReward = async (user: NonNullable<UserWithRelations>, questId: string) => {
  // Derived
  let rewards = ObjectiveReward.parse({});
  const { trackers } = await getNewTrackers(user, [{ task: "any" }]);
  const userQuest = user.userQuests.find((uq) => uq.questId === questId);
  const successDescriptions: string[] = [];
  let resolved = false;
  let canRepeat = false;

  // Start mutating
  if (userQuest && !userQuest.completed) {
    const tracker = trackers.find((q) => q.id === userQuest.quest.id);
    const goals = tracker?.goals ?? [];
    resolved = (goals.every((g) => g.done) || goals.length === 0) ?? false;

    if (resolved) {
      rewards = ObjectiveReward.parse(userQuest.quest.content.reward);

      // Check if quest can be repeated
      if (userQuest.quest.repeatInterval && userQuest.quest.maxRepeats) {
        const completedCount = userQuest.completed || 0;
        if (completedCount < userQuest.quest.maxRepeats) {
          canRepeat = true;
        }
      }
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
  return { rewards, trackers, userQuest, resolved, successDescriptions, canRepeat };
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
export const getNewTrackers = async (
  user: NonNullable<UserWithRelations>,
  tasks: {
    task: AllObjectiveTask | "any";
    increment?: number;
    value?: number;
    text?: string;
    contentId?: string;
    dialogActions?: {
      type: string;
      value?: string;
    }[];
  }[],
) => {
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
          if (status.done) {
            return status;
          }

          // If not available yet, just skip
          if (!isQuestObjectiveAvailable(quest, questTracker, i)) {
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
          } else if (task === "reputation_points") {
            status.value = user.reputationPointsTotal;
          } else if (task === "minutes_passed" && questTracker) {
            const minutes = Math.floor(
              secondsPassed(new Date(questTracker.startAt)) / 60,
            );
            status.value = minutes;
          } else if (task === "dialog_scene" && "dialogFolderId" in objective) {
            // Handle dialog scene objective
            if (isLocationObjective(user, objective)) {
              const taskUpdate = tasks.find(t => t.task === task && t.dialogActions);
              if (taskUpdate?.dialogActions) {
                const consequences = await handleDialogActions(client, user, taskUpdate.dialogActions);
                if (consequences.length > 0) {
                  consequences.forEach(c => {
                    if (c.type === "combat") {
                      notifications.push(`Starting battle...`);
                    } else if (c.type === "item") {
                      notifications.push(`Received item`);
                    } else if (c.type === "jutsu") {
                      notifications.push(`Learned jutsu`);
                    } else if (c.type === "bloodline") {
                      notifications.push(`Acquired bloodline`);
                    } else if (c.type === "feature") {
                      notifications.push(`${c.scaleStats ? "Unlocked" : "Locked"} feature: ${c.id}`);
                    }
                  });
                  status.done = true;
                }
              }
            }
          } else if (task === "collect_puzzle_piece" && "piece_id" in objective) {
            // Handle puzzle piece collection
            if (isLocationObjective(user, objective)) {
              const taskUpdate = tasks.find(t => t.task === task && t.contentId === objective.piece_id);
              if (taskUpdate) {
                const collectedPieces = user.userQuests
                  ?.filter(q => q.questId === quest.id)
                  ?.reduce((acc, q) => acc + (q.completed ? 1 : 0), 0) ?? 0;
                if (collectedPieces >= objective.required_pieces) {
                  consequences.push({ type: "item", id: objective.complete_item_id });
                  notifications.push(`Completed puzzle: ${objective.piece_name}`);
                  status.done = true;
                } else {
                  notifications.push(`Collected puzzle piece (${collectedPieces + 1}/${objective.required_pieces})`);
                  consequences.push({ type: "item", id: objective.piece_id });
                  status.done = true;
                }
              }
            }
          } else if (task === "deliver_item" && "item_id" in objective) {
            // Handle item delivery
            if (isLocationObjective(user, objective)) {
              const taskUpdate = tasks.find(t => t.task === task && t.contentId === objective.target_ai);
              if (taskUpdate) {
                const userItems = user.userItems as { itemId: string }[] | undefined;
                const hasItem = userItems?.some(i => i.itemId === objective.item_id) ?? false;
                if (hasItem) {
                  if (objective.reward_item_id) {
                    consequences.push({ type: "item", id: objective.reward_item_id });
                    notifications.push(`Received ${objective.reward_item_id} from ${objective.target_name}`);
                  }
                  status.done = true;
                } else {
                  notifications.push(`You don't have the required item to deliver`);
                }
              }
            }
          } else if (task === "defeat_random_ai" && "opponent_ai_pool" in objective) {
            // Handle random AI defeats
            const taskUpdate = tasks.find(t => t.task === task && t.contentId);
            if (taskUpdate?.text) {
              const completionOutcome = objective.completionOutcome || "Win";
              const isSuccess = (
                completionOutcome === "Any" ||
                (taskUpdate.text === "Won" && completionOutcome === "Win") ||
                (taskUpdate.text === "Lost" && completionOutcome === "Lose") ||
                (taskUpdate.text === "Draw" && completionOutcome === "Draw") ||
                (taskUpdate.text === "Fled" && completionOutcome === "Flee")
              );
              if (isSuccess) {
                status.value += 1;
                if (status.value >= objective.required_defeats) {
                  status.done = true;
                } else {
                  // Queue next random opponent
                  const aiPool = objective.opponent_ai_pool as string[] | undefined;
                  const nextOpponent = aiPool ? (aiPool[Math.floor(Math.random() * aiPool.length)] as string | undefined) : undefined;
                  if (nextOpponent) {
                    consequences.push({
                      type: "combat",
                      id: nextOpponent,
                      scaleStats: objective.opponent_scaled_to_user,
                      scaleGains: objective.scaleGains,
                    });
                  }
                }
              }
            }
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
                      scaleStats: objective.opponent_scaled_to_user,
                      scaleGains: objective.scaleGains,
                    });
                  }
                }
              }
              if (task === "defeat_opponents" && "opponent_ai" in objective) {
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
  return { trackers, notifications, consequences };
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
  quests: Quest[],
  user: NonNullable<UserWithRelations>,
) => {
  return quests
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
export const hideQuestInformation = (quest?: Quest, user?: UserData) => {
  quest?.content.objectives.forEach((objective) => {
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
 * @param quest - The quest object to be checked.
 * @param role - The role of the user.
 * @returns A boolean indicating whether the quest is either hidden and the user can play hidden quests, or the quest is not expired.
 */
export const isAvailableUserQuests = (
  quest: {
    hidden: boolean;
    questType: QuestType;
    expiresAt?: string | null;
    requiredVillage: string | null;
    previousAttempts?: number | null;
    completed?: number | null;
    // New fields
    prerequisiteQuestId?: string | null;
    maxRetries?: number | null;
    maxRepeats?: number | null;
    releaseAt?: string | null;
    expirationAt?: string | null;
  },
  user: UserData,
) => {
  const now = new Date();
  const hideCheck = !quest.hidden || canPlayHiddenQuests(user.role);
  const expiresCheck = !quest.expiresAt || new Date(quest.expiresAt) > now;
  const releaseCheck = !quest.releaseAt || new Date(quest.releaseAt) <= now;
  const expirationCheck = !quest.expirationAt || new Date(quest.expirationAt) > now;

  // Check if prerequisite quest is completed
  const userQuests = user.userQuests as { questId: string; completed: number }[] | undefined;
  const prerequisiteCheck = !quest.prerequisiteQuestId || userQuests?.some(
    uq => uq.questId === quest.prerequisiteQuestId && uq.completed === 1
  ) ?? false;

  // Check retry/repeat limits
  const retryCheck = !quest.maxRetries || !quest.previousAttempts || quest.previousAttempts < quest.maxRetries;
  const repeatCheck = !quest.maxRepeats || !quest.completed || quest.completed < quest.maxRepeats;

  // Original checks
  const prevCheck =
    quest.questType !== "event" ||
    !quest.previousAttempts ||
    (quest.previousAttempts <= 1 && quest.completed === 0);
  const villageCheck =
    !quest.requiredVillage || quest.requiredVillage === user.villageId;

  const result = Boolean(hideCheck && expiresCheck && prevCheck && villageCheck &&
         releaseCheck && expirationCheck && prerequisiteCheck &&
         retryCheck && repeatCheck);
  return result;
};
