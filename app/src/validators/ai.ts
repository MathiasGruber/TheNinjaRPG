import { z } from "zod";

export const AvailableTargets = [
  "SELF",
  "RANDOM_OPPONENT",
  "CLOSEST_OPPONENT",
  "BARRIER_BETWEEN",
  "RANDOM_ALLY",
  "CLOSEST_ALLY",
  "BARRIER_BLOCKING_CLOSEST_OPPONENT",
] as const;

export type AvailableTarget = (typeof AvailableTargets)[number];

/*********************************/
/*          Conditions           */
/*********************************/
export const ConditionHealthBelow = z.object({
  type: z.literal("health_below").default("health_below"),
  description: z.string().default("Health below given percentage"),
  value: z.coerce.number().int().positive().default(10),
});

export const ConditionDistanceHigherThan = z.object({
  type: z.literal("distance_higher_than").default("distance_higher_than"),
  description: z.string().default("Distance higher than or equal given value"),
  value: z.coerce.number().int().positive().default(3),
  target: z.enum(AvailableTargets).default("RANDOM_OPPONENT"),
});

export const ConditionDistanceLowerThan = z.object({
  type: z.literal("distance_lower_than").default("distance_lower_than"),
  description: z.string().default("Distance lower than or equal given value"),
  value: z.coerce.number().int().positive().default(2),
  target: z.enum(AvailableTargets).default("RANDOM_OPPONENT"),
});

export const ZodAllAiConditions = z.union([
  ConditionHealthBelow,
  ConditionDistanceHigherThan,
  ConditionDistanceLowerThan,
]);

export const AiConditionTypes = ZodAllAiConditions._def.options.map(
  (o) => o.shape.type._def.innerType._def.value,
);

export type AiConditionType = (typeof AiConditionTypes)[number];

export type ZodAllAiCondition = z.infer<typeof ZodAllAiConditions>;

export const getConditionSchema = (type: ZodAllAiCondition["type"]) => {
  const schema = ZodAllAiConditions._def.options.find(
    (o) => o.shape.type._def.innerType._def.value === type,
  );
  if (!schema) throw new Error(`No schema found for type ${type}`);
  return schema;
};

/*********************************/
/*            Actions            */
/*********************************/
export const ActionMoveTowardsOpponent = z.object({
  type: z.literal("move_towards_opponent").default("move_towards_opponent"),
  description: z.string().default("Move towards opponent"),
  target: z.enum(AvailableTargets).default("RANDOM_OPPONENT"),
});

export const ActionEndTurn = z.object({
  type: z.literal("end_turn").default("end_turn"),
  description: z.string().default("End turn"),
});

export const ActionUseSpecificJutsu = z.object({
  type: z.literal("use_specific_jutsu").default("use_specific_jutsu"),
  description: z.string().default("Select specific jutsu"),
  jutsuId: z.string().default(""),
  target: z.enum(AvailableTargets).default("RANDOM_OPPONENT"),
});

export const ActionUseRandomJutsu = z.object({
  type: z.literal("use_random_jutsu").default("use_random_jutsu"),
  description: z.string().default("Use random jutsu"),
  target: z.enum(AvailableTargets).default("RANDOM_OPPONENT"),
});

export const ActionWithHighestPowerJutsuEffect = z.object({
  type: z.literal("use_highest_power_jutsu").default("use_highest_power_jutsu"),
  description: z.string().default("Use jutsu with given effect with highest power"),
  target: z.enum(AvailableTargets).default("RANDOM_OPPONENT"),
  effect: z.string().default("damage"),
});

export const ActionUseSpecificItem = z.object({
  type: z.literal("use_specific_item").default("use_specific_item"),
  description: z.string().default("Select specific item"),
  itemId: z.string().default(""),
  target: z.enum(AvailableTargets).default("RANDOM_OPPONENT"),
});

export const ActionUseRandomItem = z.object({
  type: z.literal("use_random_item").default("use_random_item"),
  description: z.string().default("Use random item"),
  target: z.enum(AvailableTargets).default("RANDOM_OPPONENT"),
});

export const ActionWithHighestPowerItemEffect = z.object({
  type: z.literal("use_highest_power_item").default("use_highest_power_item"),
  description: z.string().default("Use item with given effect with highest power"),
  target: z.enum(AvailableTargets).default("RANDOM_OPPONENT"),
  effect: z.string().default("damage"),
});

export const ActionWithEffectHighestPower = z.object({
  type: z.literal("use_highest_power_action").default("use_highest_power_action"),
  description: z.string().default("Use action with given effect with highest power"),
  target: z.enum(AvailableTargets).default("RANDOM_OPPONENT"),
  effect: z.string().default("damage"),
});

export const ZodAllAiActions = z.union([
  ActionMoveTowardsOpponent,
  ActionEndTurn,
  ActionUseSpecificJutsu,
  ActionUseSpecificItem,
  ActionUseRandomJutsu,
  ActionUseRandomItem,
  ActionWithEffectHighestPower,
  ActionWithHighestPowerJutsuEffect,
  ActionWithHighestPowerItemEffect,
]);

export const AiActionTypes = ZodAllAiActions._def.options.map(
  (o) => o.shape.type._def.innerType._def.value,
);

export type AiActionType = (typeof AiActionTypes)[number];

export type ZodAllAiAction = z.infer<typeof ZodAllAiActions>;

export const getActionSchema = (type: ZodAllAiAction["type"]) => {
  const schema = ZodAllAiActions._def.options.find(
    (o) => o.shape.type._def.innerType._def.value === type,
  );
  if (!schema) throw new Error(`No schema found for type ${type}`);
  return schema;
};

/*********************************/
/*            Rules              */
/*********************************/
export const AiRule = z.object({
  conditions: z.array(ZodAllAiConditions),
  action: ZodAllAiActions,
});

export type AiRuleType = z.infer<typeof AiRule>;

/**
 * Get a set of backup AI rules to the provided rules array.
 *
 * The rules are as follows:
 * 1. If the distance to the opponent is greater than 2, move towards the opponent.
 * 2. If the distance to the opponent is less than 2, perform an action with the highest power effect that causes damage.
 * 3. If no conditions are met, perform an action with the highest power effect
 *
 * @param rules - The array of AI rules to which the backup rules will be added.
 * @returns void
 */
export const getBackupRules = () => {
  const rules: AiRuleType[] = [];
  rules.push(
    AiRule.parse({
      conditions: [ConditionDistanceHigherThan.parse({ value: 2 })],
      action: ActionMoveTowardsOpponent.parse({}),
    }),
    AiRule.parse({
      conditions: [ConditionDistanceHigherThan.parse({ value: 2 })],
      action: ActionMoveTowardsOpponent.parse({}),
    }),
    AiRule.parse({
      conditions: [ConditionDistanceHigherThan.parse({ value: 2 })],
      action: ActionMoveTowardsOpponent.parse({}),
    }),
    AiRule.parse({
      conditions: [ConditionDistanceLowerThan.parse({ value: 2 })],
      action: ActionWithEffectHighestPower.parse({ effect: "damage" }),
    }),
    AiRule.parse({
      conditions: [],
      action: ActionWithEffectHighestPower.parse({
        effect: "damage",
        target: "BARRIER_BLOCKING_CLOSEST_OPPONENT",
      }),
    }),
  );
  return rules;
};
