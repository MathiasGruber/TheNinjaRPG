import HumanDiff from "human-object-diff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QuestValidator, ObjectiveReward } from "@/validators/objectives";
import { LetterRanks, TimeFrames, QuestTypes, UserRanks } from "@/drizzle/constants";
import { api } from "@/utils/api";
import { show_toast, show_errors } from "@/libs/toast";
import { ObjectiveTracker, QuestTracker } from "@/validators/objectives";
import { secondsPassed } from "@/utils/time";
import type { UserWithRelations } from "@/routers/profile";
import type { AllObjectivesType, AllObjectiveTask } from "@/validators/objectives";
import type { Quest } from "@/drizzle/schema";
import type { FormEntry } from "@/layout/EditContent";
import type { ZodQuestType, QuestContentType } from "@/validators/objectives";
import type { ObjectiveRewardType, QuestTrackerType } from "@/validators/objectives";

// A merged type for quest with its rewards, so that we can show both in the same form
type ZodCombinedQuest = ZodQuestType & ObjectiveRewardType;

/**
 * Hook used when creating frontend forms for editing items
 * @param data
 */
export const useQuestEditForm = (quest: Quest, refetch: () => void) => {
  // Form handling
  const expires = quest.expiresAt ? quest.expiresAt.slice(0, 10) : "";
  const start = {
    ...quest,
    ...quest.content.reward,
    expiresAt: expires,
  };

  const form = useForm<ZodCombinedQuest>({
    mode: "all",
    criteriaMode: "all",
    values: start,
    defaultValues: start,
    resolver: zodResolver(QuestValidator._def.schema.merge(ObjectiveReward)),
  });

  // Query for relations
  const { data: items, isLoading: l1 } = api.item.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
  });
  const { data: jutsus, isLoading: l2 } = api.jutsu.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
  });
  const { data: ais, isLoading: l3 } = api.profile.getAllAiNames.useQuery(undefined, {
    staleTime: Infinity,
  });
  const { data: villages, isLoading: l4 } = api.village.getAll.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Mutation for updating item
  const { mutate: updateQuest } = api.quests.update.useMutation({
    onSuccess: (data) => {
      refetch();
      show_toast("Updated Quest", data.message, "info");
    },
    onError: (error) => {
      show_toast("Error updating", error.message, "error");
    },
  });

  // Form submission
  const handleQuestSubmit = form.handleSubmit(
    (data: ZodCombinedQuest) => {
      const newObjectives = data.content.objectives.map((objective) => {
        if (objective.task === "move_to_location" && data.image) {
          objective.image = data.image;
        } else if (objective.task === "collect_item") {
          const item = items?.find((i) => i.id === objective.collect_item_id);
          if (item) {
            objective.image = item.image;
            objective.item_name = item.name;
          }
        } else if (objective.task === "defeat_opponents") {
          const ai = ais?.find((u) => u.userId === objective.opponent_ai);
          if (ai?.avatar) {
            objective.image = ai.avatar;
            objective.opponent_name = ai.username;
          }
        }
        return objective;
      });
      const newQuest = {
        ...quest,
        ...data,
        expiresAt: data.expiresAt ? data.expiresAt : null,
        content: {
          objectives: newObjectives,
          reward: {
            reward_money: data.reward_money,
            reward_jutsus: data.reward_jutsus,
            reward_items: data.reward_items,
            reward_rank: data.reward_rank,
          },
        },
      };
      const diff = new HumanDiff({}).diff(quest, newQuest);
      if (diff.length > 0) {
        updateQuest({ id: quest.id, data: newQuest });
      }
    },
    (errors) => show_errors(errors)
  );

  // Watch the effects
  const content = form.watch("content");
  const objectives = content.objectives ?? [];

  // Handle updating of effects
  const setObjectives = (values: AllObjectivesType[]) => {
    const newContent: QuestContentType = { ...content, objectives: values };
    form.setValue("content", newContent, { shouldDirty: true });
  };

  // Are we loading data
  const loading = l1 || l2 || l3 || l4;

  // Watch for changes
  const imageUrl = form.watch("image");
  const questType = form.watch("questType");

  // Object for form values
  const formData: FormEntry<keyof ZodCombinedQuest>[] = [
    { id: "name", label: "Title", type: "text" },
    { id: "hidden", type: "number", label: "Hidden" },
    { id: "questType", type: "str_array", values: QuestTypes },
    { id: "requiredRank", type: "str_array", values: LetterRanks },
    { id: "requiredLevel", type: "number" },
  ];

  // Add villages if they exist
  if (villages) {
    formData.push({ id: "requiredVillage", type: "db_values", values: villages });
  }

  // For everything except daily, add timeframe
  if (questType !== "daily") {
    formData.push({ id: "timeFrame", type: "str_array", values: TimeFrames });
  }

  // For tiers, add tier level
  if (questType === "tier") {
    formData.push({ id: "tierLevel", type: "number" });
  }

  // Rewards
  formData.push({ id: "reward_money", type: "number" });
  formData.push({ id: "reward_rank", type: "str_array", values: UserRanks });

  // Add items if they exist
  if (items) {
    formData.push({
      id: "reward_items",
      type: "db_values",
      values: items,
      multiple: true,
    });
  }

  // Add jutsus if they exist
  if (jutsus) {
    formData.push({
      id: "reward_jutsus",
      type: "db_values",
      values: jutsus,
      multiple: true,
    });
  }

  // Image & description
  formData.unshift({ id: "image", type: "avatar", href: imageUrl });
  formData.push({ id: "description", type: "richinput", doubleWidth: true });
  formData.push({ id: "successDescription", type: "richinput", doubleWidth: true });

  // Add description & image only for missions/crimes/events
  if (["mission", "crime", "event", "exam"].includes(questType)) {
    formData.push({ id: "expiresAt", type: "date", label: "Expires At" });
  }

  return {
    quest,
    objectives,
    form,
    formData,
    loading,
    setObjectives,
    handleQuestSubmit,
  };
};

/**
 * Get currently active quests for a user
 */
export const getUserQuests = (user: NonNullable<UserWithRelations>) => {
  return user?.userQuests?.map((uq) => uq.quest) ?? [];
};

/**
 * Get active objectives for a user
 */
/**
 * Get active objectives for a user
 */
export const getActiveObjectives = (user: NonNullable<UserWithRelations>) => {
  const activeQuests = getUserQuests(user);
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
  objective: AllObjectivesType
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
  const activeQuests = getUserQuests(user);
  let rewards: ObjectiveRewardType = {
    reward_money: 0,
    reward_jutsus: [],
    reward_items: [],
    reward_rank: "NONE",
  };
  const { trackers } = getNewTrackers(user, [{ task: "any" }]);
  const quest = activeQuests.find((q) => q.id === questId);
  let done = false;
  if (quest) {
    const questTracker = trackers.find((q) => q.id === quest.id);
    done = questTracker?.goals.every((g) => g.done) ?? false;
    if (done) {
      rewards = quest.content.reward;
      quest.content.objectives.forEach((objective) => {
        if (objective.reward_money) {
          rewards.reward_money += objective.reward_money;
        }
        if (objective.reward_jutsus) {
          rewards.reward_jutsus.push(...objective.reward_jutsus);
        }
        if (objective.reward_items) {
          rewards.reward_items.push(...objective.reward_items);
        }
        if (objective.reward_rank !== "NONE") {
          rewards.reward_rank = objective.reward_rank;
        }
      });
    }
  }
  return { rewards, quest, done };
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
  }[]
) => {
  const questData = user.questData ?? [];
  const activeQuests = getUserQuests(user);
  const notifications: string[] = [];
  const consequences: { type: "item" | "combat"; id: string }[] = [];
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
              secondsPassed(new Date(questTracker.startAt)) / 60
            );
            status.value = minutes;
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
                  consequences.push({ type: "combat", id: objective.opponent_ai });
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
