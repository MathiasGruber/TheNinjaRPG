import { z } from "zod";
import { DateTimeRegExp } from "@/utils/regex";
import { UserRanks, LetterRanks, TimeFrames, QuestTypes } from "@/drizzle/constants";

export const SimpleTasks = [
  "pvp_kills",
  "arena_kills",
  // "anbu_kills",
  // "tournaments_won",
  // "village_funds_earned",
  // "any_missions_completed",
  // "any_crimes_completed",
  // "a_missions_completed",
  // "b_missions_completed",
  // "c_missions_completed",
  // "d_missions_completed",
  // "a_crimes_completed",
  // "b_crimes_completed",
  // "c_crimes_completed",
  // "d_crimes_completed",
  "minutes_training",
  "stats_trained",
  "days_in_village",
  "jutsus_mastered",
  "user_level",
  //"students_trained",
] as const;

export const LocationTasks = [
  "move_to_location",
  "collect_item",
  "defeat_opponents",
] as const;
export type LocationTasksType = typeof LocationTasks[number];

export const allObjectiveTasks = [...SimpleTasks, ...LocationTasks] as const;
export type AllObjectiveTask = typeof allObjectiveTasks[number];

const rewardFields = {
  reward_money: z.number().default(0),
  reward_rank: z.enum(UserRanks).default("NONE"),
  reward_items: z.array(z.string()).default([]),
  reward_jutsus: z.array(z.string()).default([]),
};

export const ObjectiveReward = z.object(rewardFields);
export type ObjectiveRewardType = z.infer<typeof ObjectiveReward>;

export const attackerFields = {
  attackers: z.array(z.string()).default([]),
  attackers_chance: z.number().min(0).max(100).default(0),
};

export const baseObjectiveFields = {
  id: z.string(),
};

export const SimpleObjective = z.object({
  ...baseObjectiveFields,
  task: z.enum(SimpleTasks),
  value: z.number().min(0).default(3),
  ...rewardFields,
  ...attackerFields,
});

const complexObjectiveFields = {
  sector: z.number().min(0).default(0),
  longitude: z.number().min(0).default(0),
  latitude: z.number().min(0).default(0),
  completed: z.number().min(0).max(1).default(0),
  image: z.string().default(""),
  ...rewardFields,
  ...attackerFields,
};
const baseComplexObjective = z.object(complexObjectiveFields);
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
  collect_item_id: z.string(),
  ...complexObjectiveFields,
});

export const DefeatOpponents = z.object({
  ...baseObjectiveFields,
  task: z.literal("defeat_opponents").default("defeat_opponents"),
  opponent_name: z.string().min(3).default("Opponent"),
  opponent_ai: z.string().min(10).optional().nullish(),
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
  value: z.number().default(0),
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
    description: z.string().min(1).max(512).optional().nullish(),
    successDescription: z.string().min(1).max(512).optional().nullish(),
    requiredRank: z.enum(LetterRanks).optional(),
    requiredLevel: z.number().min(0).max(100).optional(),
    tierLevel: z.number().min(0).max(100).optional().nullish(),
    timeFrame: z.enum(TimeFrames),
    questType: z.enum(QuestTypes),
    content: z.object({ objectives: z.array(AllObjectives), reward: ObjectiveReward }),
    hidden: z.number().min(0).max(1),
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
  if (SimpleTasks.includes(type as typeof SimpleTasks[number])) {
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
