import { calculateContentDiff } from "@/utils/diff";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QuestValidator, ObjectiveReward } from "@/validators/objectives";
import {
  LetterRanks,
  QuestTypes,
  UserRanks,
  RetryQuestDelays,
} from "@/drizzle/constants";
import { api } from "@/app/_trpc/client";
import { IMG_AVATAR_DEFAULT } from "@/drizzle/constants";
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
  // Schema used
  const schema = QuestValidator._def.schema.merge(ObjectiveReward);

  // Form handling
  const endsAt = quest.endsAt ? quest.endsAt.slice(0, 10) : "";
  const startsAt = quest.startsAt ? quest.startsAt.slice(0, 10) : "";
  const initialData = {
    ...quest,
    ...quest.content.reward,
    endsAt: endsAt,
    startsAt: startsAt,
  };
  const parsedStart = schema.safeParse(initialData);
  const start = parsedStart.success ? parsedStart.data : initialData;

  const form = useForm<ZodCombinedQuest>({
    mode: "all",
    criteriaMode: "all",
    values: start,
    defaultValues: start,
    resolver: zodResolver(schema),
  });

  // Query for relations
  const { data: items, isPending: l1 } = api.item.getAllNames.useQuery(undefined);
  const { data: jutsus, isPending: l2 } = api.jutsu.getAllNames.useQuery(undefined);
  const { data: ais, isPending: l3 } = api.profile.getAllAiNames.useQuery(undefined);
  const { data: villages, isPending: l4 } = api.village.getAllNames.useQuery(undefined);
  const { data: badges, isPending: l5 } = api.badge.getAll.useQuery(undefined);
  const { data: quests, isPending: l6 } = api.quests.getAllNames.useQuery(undefined);

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
          const subset = items?.filter((i) => objective.collectItemIds.includes(i.id));
          if (subset && subset.length > 0) {
            objective.image = subset?.[0]?.image || IMG_AVATAR_DEFAULT;
            objective.item_name = subset.map((i) => i.name).join(", ");
          }
        } else if (objective.task === "defeat_opponents") {
          const ai = ais?.find((u) => objective.opponentAIs.includes(u.userId));
          if (ai?.avatar) {
            objective.image = ai.avatar;
          }
        }
        return objective;
      });
      const newQuest = {
        ...quest,
        ...data,
        endsAt: data.endsAt ? data.endsAt : null,
        startsAt: data.startsAt ? data.startsAt : null,
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
  const content = useWatch({
    control: form.control,
    name: "content",
  });
  const objectives = content.objectives ?? [];

  // Handle updating of effects
  const setObjectives = (values: AllObjectivesType[]) => {
    const newContent: QuestContentType = { ...content, objectives: values };
    form.setValue("content", newContent, { shouldDirty: true });
  };

  // Are we loading data
  const loading = l1 || l2 || l3 || l4 || l5 || l6;

  // Watch for changes
  const imageUrl = useWatch({
    control: form.control,
    name: "image",
  });
  const questType = useWatch({
    control: form.control,
    name: "questType",
  });

  // Object for form values
  const formData: FormEntry<keyof ZodCombinedQuest>[] = [
    { id: "name", label: "Title", type: "text" },
    { id: "hidden", type: "boolean", label: "Hidden" },
    { id: "consecutiveObjectives", type: "boolean", label: "Sequential Objectives" },
    { id: "questType", type: "str_array", values: QuestTypes },
    { id: "questRank", type: "str_array", values: LetterRanks },
    { id: "requiredLevel", type: "number" },
    { id: "maxLevel", type: "number", label: "Max Level" },
  ];

  if (questType === "event" || questType === "story") {
    formData.push({ id: "maxAttempts", type: "number", label: "Max Attempts" });
    formData.push({ id: "maxCompletes", type: "number", label: "Max Completes" });
    formData.push({ id: "retryDelay", type: "str_array", values: RetryQuestDelays });
  }

  // Add prerequisite quest if quests exist
  if (quests) {
    formData.push({
      id: "prerequisiteQuestId",
      type: "db_values",
      values: quests.filter((q) => q.id !== quest.id), // Don't allow self-reference
      resetButton: true,
      label: "Prerequisite Quest",
      searchable: true,
    });
  }

  // Add villages if they exist
  if (villages) {
    formData.push({
      id: "requiredVillage",
      type: "db_values",
      values: villages,
      resetButton: true,
    });
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
  formData.push({ id: "endsAt", type: "date", label: "Ends At" });
  formData.push({ id: "startsAt", type: "date", label: "Starts At" });

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
