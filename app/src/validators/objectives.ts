import { z } from "zod";
import { DateTimeRegExp } from "@/utils/regex";
import { UserRanks, LetterRanks, TimeFrames, QuestTypes } from "@/drizzle/constants";

export const SimpleTasks = [
  "pvp_kills",
  "arena_kills",
  "minutes_passed",
  // "anbu_kills",
  // "tournaments_won",
  // "village_funds_earned",
  // "any_missions_completed",
  // "any_crimes_completed",
  "days_as_kage",
  "errands_total",
  "a_missions_total",
  "b_missions_total",
  "c_missions_total",
  "d_missions_total",
  "a_crimes_total",
  "b_crimes_total",
  "c_crimes_total",
  "d_crimes_total",
  "minutes_training",
  "stats_trained",
  "days_in_village",
  "jutsus_mastered",
  "user_level",
  "reputation_points",
  //"students_trained",
] as const;

export const LocationTasks = [
  "move_to_location",
  "collect_item",
  "defeat_opponents",
] as const;
export type LocationTasksType = (typeof LocationTasks)[number];

export const allObjectiveTasks = [...SimpleTasks, ...LocationTasks] as const;
export type AllObjectiveTask = (typeof allObjectiveTasks)[number];

const rewardFields = {
  reward_money: z.coerce.number().default(0),
  reward_clanpoints: z.coerce.number().default(0),
  reward_exp: z.coerce.number().default(0),
  reward_tokens: z.coerce.number().default(0),
  reward_prestige: z.coerce.number().default(0),
  reward_rank: z.enum(UserRanks).default("NONE"),
  reward_items: z.array(z.string()).default([]),
  reward_jutsus: z.array(z.string()).default([]),
  reward_badges: z.array(z.string()).default([]),
};

export const ObjectiveReward = z.object(rewardFields);
export type ObjectiveRewardType = z.infer<typeof ObjectiveReward>;

export const hasReward = (reward: ObjectiveRewardType) => {
  const parsedReward = ObjectiveReward.parse(reward);
  return (
    parsedReward.reward_money > 0 ||
    parsedReward.reward_clanpoints > 0 ||
    parsedReward.reward_exp > 0 ||
    parsedReward.reward_prestige > 0 ||
    parsedReward.reward_rank !== "NONE" ||
    parsedReward.reward_items.length > 0 ||
    parsedReward.reward_jutsus.length > 0 ||
    parsedReward.reward_badges.length > 0
  );
};

export const attackerFields = {
  attackers: z.array(z.string()).default([]),
  attackers_chance: z.coerce.number().min(0).max(100).default(0),
  attackers_scaled_to_user: z.coerce.boolean().default(false),
  attackers_scale_gains: z.coerce.number().min(0).max(1).default(1),
};

export const baseObjectiveFields = {
  id: z.string(),
  description: z.string().default(""),
  successDescription: z.string().default(""),
};

export const SimpleObjective = z.object({
  ...baseObjectiveFields,
  task: z.enum(SimpleTasks),
  value: z.coerce.number().min(0).default(3),
  ...rewardFields,
  ...attackerFields,
});

const complexObjectiveFields = {
  sector: z.coerce.number().min(0).default(0),
  longitude: z.coerce.number().min(0).default(0),
  latitude: z.coerce.number().min(0).default(0),
  hideLocation: z.coerce.boolean().default(false),
  completed: z.coerce.number().min(0).max(1).default(0),
  image: z.string().default(""),
  ...rewardFields,
  ...attackerFields,
};
export const baseComplexObjective = z.object(complexObjectiveFields);
export type ComplexObjectiveFields = z.infer<typeof baseComplexObjective>;

export const MoveToObjective = z.object({
  ...baseObjectiveFields,
  ...complexObjectiveFields,
  task: z.literal("move_to_location").default("move_to_location"),
});

export const CollectItem = z.object({
  ...baseObjectiveFields,
  task: z.literal("collect_item").default("collect_item"),
  item_name: z.string().min(3).default("Secret scroll"),
  collect_item_id: z.string().optional().nullish(),
  delete_on_complete: z.coerce.boolean().default(false),
  ...complexObjectiveFields,
});
export type CollectItemType = z.infer<typeof CollectItem>;

export const DefeatOpponents = z.object({
  ...baseObjectiveFields,
  task: z.literal("defeat_opponents").default("defeat_opponents"),
  opponent_name: z.string().min(3).default("Opponent"),
  opponent_ai: z.string().min(10).optional().nullish(),
  opponent_scaled_to_user: z.coerce.boolean().default(false),
  completionOutcome: z.enum(["Win", "Lose", "Flee", "Draw", "Any"]).default("Win"),
  failDescription: z.string().default("You failed to defeat the opponent"),
  fleeDescription: z.string().default("You fled from the opponent"),
  drawDescription: z.string().default("The battle ended in a draw"),
  scaleGains: z.coerce.number().min(0).max(1).default(1),
  ...complexObjectiveFields,
});

export const AllObjectives = z.union([
  SimpleObjective,
  MoveToObjective,
  CollectItem,
  DefeatOpponents,
]);
export type AllObjectivesType = z.infer<typeof AllObjectives>;

export const ObjectiveTracker = z.object({
  id: z.string(),
  done: z.boolean().default(false),
  value: z.coerce.number().default(0),
  collected: z.boolean().default(false),
});
export type ObjectiveTrackerType = z.infer<typeof ObjectiveTracker>;

export type QuestContentType = {
  reward: ObjectiveRewardType;
  objectives: AllObjectivesType[];
};

export const QuestTracker = z.object({
  id: z.string(),
  startAt: z.string().datetime().default(new Date().toISOString()),
  goals: z.array(ObjectiveTracker).default([]),
});
export type QuestTrackerType = z.infer<typeof QuestTracker>;

export const QuestValidator = z
  .object({
    name: z.string().min(1).max(191),
    image: z.string().url().optional().nullish(),
    description: z.string().min(1).max(5000).optional().nullish(),
    successDescription: z.string().min(1).max(5000).optional().nullish(),
    questRank: z.enum(LetterRanks).optional(),
    requiredLevel: z.coerce.number().min(0).max(100).optional(),
    maxLevel: z.coerce.number().min(0).max(100).optional(),
    requiredVillage: z.string().min(0).max(30).optional().nullish(),
    tierLevel: z.coerce.number().min(0).max(100).optional().nullish(),
    timeFrame: z.enum(TimeFrames),
    questType: z.enum(QuestTypes),
    content: z.object({ objectives: z.array(AllObjectives), reward: ObjectiveReward }),
    hidden: z.coerce.boolean(),
    consecutiveObjectives: z.coerce.boolean(),
    expiresAt: z
      .string()
      .regex(DateTimeRegExp, "Must be of format YYYY-MM-DD")
      .optional()
      .nullish(),
  })
  .superRefine((val, ctx) => {
    if (["daily", "tier"].includes(val.questType)) {
      if (val.content.objectives.length !== 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Daily & Tier quests must have 3 objectives",
        });
      }
    }
  });
export type ZodQuestType = z.infer<typeof QuestValidator>;

export const getObjectiveSchema = (type: string) => {
  if (SimpleTasks.includes(type as (typeof SimpleTasks)[number])) {
    return SimpleObjective;
  } else if (type === "move_to_location") {
    return MoveToObjective;
  } else if (type === "collect_item") {
    return CollectItem;
  } else if (type === "defeat_opponents") {
    return DefeatOpponents;
  }
  throw new Error(`Unknown objective task ${type}`);
};

export const allObjectiveSchema = z.union([
  SimpleObjective,
  MoveToObjective,
  CollectItem,
  DefeatOpponents,
]);
