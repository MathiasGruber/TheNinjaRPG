import { calculateContentDiff } from "@/utils/diff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QuestValidator, ObjectiveReward } from "@/validators/objectives";
import { LetterRanks, TimeFrames, QuestTypes, UserRanks } from "@/drizzle/constants";
import { api } from "@/app/_trpc/client";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import type { AllObjectivesType } from "@/validators/objectives";
import type { Quest } from "@/drizzle/schema";
import type { FormEntry } from "@/layout/EditContent";
import type { ZodQuestType, QuestContentType } from "@/validators/objectives";
import type { ObjectiveRewardType } from "@/validators/objectives";

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
  const { data: items, isPending: l1 } = api.item.getAllNames.useQuery(undefined);
  const { data: jutsus, isPending: l2 } = api.jutsu.getAllNames.useQuery(undefined);
  const { data: ais, isPending: l3 } = api.profile.getAllAiNames.useQuery(undefined);
  const { data: villages, isPending: l4 } = api.village.getAllNames.useQuery(undefined);
  const { data: badges, isPending: l5 } = api.badge.getAll.useQuery(undefined);

  // Mutation for updating item
  const { mutate: updateQuest } = api.quests.update.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      refetch();
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
            reward_clanpoints: data.reward_clanpoints,
            reward_exp: data.reward_exp,
            reward_tokens: data.reward_tokens,
            reward_prestige: data.reward_prestige,
            reward_jutsus: data.reward_jutsus,
            reward_badges: data.reward_badges,
            reward_items: data.reward_items,
            reward_rank: data.reward_rank,
          },
        },
      };
      const diff = calculateContentDiff(quest, newQuest);
      if (diff.length > 0) {
        updateQuest({ id: quest.id, data: newQuest });
      }
    },
    (errors) => showFormErrorsToast(errors),
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
  const loading = l1 || l2 || l3 || l4 || l5;

  // Watch for changes
  const imageUrl = form.watch("image");
  const questType = form.watch("questType");

  // Object for form values
  const formData: FormEntry<keyof ZodCombinedQuest>[] = [
    { id: "name", label: "Title", type: "text" },
    { id: "hidden", type: "boolean", label: "Hidden" },
    { id: "consecutiveObjectives", type: "boolean", label: "Consecutive Objectives" },
    { id: "questType", type: "str_array", values: QuestTypes },
    { id: "questRank", type: "str_array", values: LetterRanks },
    { id: "requiredLevel", type: "number" },
    { id: "maxLevel", type: "number" },
  ];

  // Add villages if they exist
  if (villages) {
    formData.push({
      id: "requiredVillage",
      type: "db_values",
      values: villages,
      resetButton: true,
    });
  }

  // For everything except daily, add timeframe & expiry
  if (questType !== "daily") {
    formData.push({ id: "timeFrame", type: "str_array", values: TimeFrames });
  }

  // For tiers, add tier level
  if (questType === "tier") {
    formData.push({ id: "tierLevel", type: "number" });
  }

  // Rewards
  formData.push({ id: "reward_money", type: "number" });
  formData.push({ id: "reward_clanpoints", type: "number" });
  formData.push({ id: "reward_exp", type: "number" });
  formData.push({ id: "reward_tokens", type: "number" });
  formData.push({ id: "reward_prestige", type: "number" });
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

  // Add badges if they exist
  if (badges?.data) {
    formData.push({
      id: "reward_badges",
      type: "db_values",
      values: badges.data,
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
