import { z } from "zod";
import { AttackMethods, AttackTargets, ItemRarities } from "@/drizzle/constants";
import { ItemSlotTypes, ItemTypes, JutsuTypes } from "@/drizzle/constants";
import { LetterRanks, UserRanks, WeaponTypes } from "@/drizzle/constants";
import { ElementNames } from "@/drizzle/constants";
import { combatAssetsNames } from "@/libs//travel/constants";
import { StatType, GeneralType, PoolType } from "@/libs/combat/constants";
import type { publicState } from "@/libs/combat/constants";
import type { StatNames } from "@/libs/combat/constants";
import type { Jutsu, Item } from "@/drizzle/schema";
import type { UserJutsu, UserItem } from "@/drizzle/schema";
import type { TerrainHex } from "@/libs/hexgrid";
import type { BattleType } from "@/drizzle/constants";
import type { UserWithRelations } from "@/routers/profile";

/**
 * BattleUserState is the data stored in the battle entry about a given user
 */
export type BattleUserState = UserWithRelations & {
  jutsus: (UserJutsu & {
    jutsu: Jutsu;
  })[];
  items: (UserItem & {
    item: Item;
  })[];
  highestOffence: (typeof StatNames)[number];
  highestDefence: (typeof StatNames)[number];
  iAmHere: boolean;
  actionPoints: number;
  armor: number;
  hidden?: boolean;
  isOriginal: boolean;
  controllerId: string;
  leftBattle: boolean;
  fledBattle: boolean;
  initiative: number;
  hex?: TerrainHex;
  originalMoney: number;
  direction: "left" | "right";
  usedGenerals: (typeof GeneralType)[number][];
  usedStats: (typeof StatNames)[number][];
  usedActions: { id: string; type: "jutsu" | "item" | "basic" | "bloodline" }[];
};

// Create type for battle, which contains information on user current state
export type CompleteBattle = {
  usersState: BattleUserState[];
  usersEffects: UserEffect[];
  groundEffects: GroundEffect[];
  id: string;
  activeUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  roundStartAt: Date;
  background: string;
  battleType: BattleType;
  version: number;
  round: number;
  rewardScaling: number;
};

/**
 * User state returned is masked to hide confidential information about other players
 */
export type ReturnedUserState = Pick<BattleUserState, (typeof publicState)[number]> &
  Partial<BattleUserState>;

/**
 * A returned battle used on frontend where private information is hidden
 */
export type ReturnedBattle = Omit<CompleteBattle, "usersState"> & {
  usersState: ReturnedUserState[];
};

/**
 * Result type for users when battle is ended
 */
export type CombatResult = {
  didWin: number;
  experience: number;
  pvpStreak: number;
  eloPvp: number;
  eloPve: number;
  curHealth: number;
  curStamina: number;
  curChakra: number;
  strength: number;
  intelligence: number;
  willpower: number;
  speed: number;
  money: number;
  ninjutsuOffence: number;
  ninjutsuDefence: number;
  genjutsuOffence: number;
  genjutsuDefence: number;
  taijutsuOffence: number;
  taijutsuDefence: number;
  bukijutsuOffence: number;
  bukijutsuDefence: number;
  villagePrestige: number;
  friendsLeft: number;
  targetsLeft: number;
};

export type CombatAction = {
  id: string;
  name: string;
  image: string;
  battleDescription: string;
  type: "basic" | "jutsu" | "item";
  target: (typeof AttackTargets)[number];
  method: (typeof AttackMethods)[number];
  range: number;
  healthCostPerc: number;
  chakraCostPerc: number;
  staminaCostPerc: number;
  actionCostPerc: number;
  updatedAt: number;
  cooldown: number;
  effects: ZodAllTags[];
  data?: Jutsu | Item;
  level?: number;
  quantity?: number;
  hidden?: boolean;
};

export interface BattleState {
  battle?: ReturnedBattle | null | undefined;
  result: CombatResult | null | undefined;
  isLoading: boolean;
}

/**
 * Schema & types for performing battle actions
 */
export const performActionSchema = z.object({
  battleId: z.string(),
  userId: z.string().optional(),
  actionId: z.string().optional(),
  longitude: z.number().optional(),
  latitude: z.number().optional(),
  version: z.number(),
});
export type PerformActionType = z.infer<typeof performActionSchema>;

/**
 * Battle Consequence, i.e. the permanent things that happen to a user as a result of an action
 */
export type Consequence = {
  userId: string;
  targetId: string;
  heal?: number;
  damage?: number;
  reflect?: number;
  absorb_hp?: number;
  absorb_sp?: number;
  absorb_cp?: number;
};

/**
 * Animation Visuals
 */
export const Animations = new Map<string, { frames: number; speed: number }>();
Animations.set("hit", { frames: 4, speed: 50 });
Animations.set("smoke", { frames: 9, speed: 50 });
Animations.set("fire", { frames: 6, speed: 50 });
Animations.set("heal", { frames: 20, speed: 50 });
Animations.set("explosion", { frames: 10, speed: 50 });
Animations.set("rising_smoke", { frames: 14, speed: 50 });

export const animationNames = [
  "",
  "hit",
  "smoke",
  "fire",
  "heal",
  "explosion",
  "rising_smoke",
] as const;

export type AnimationName = (typeof animationNames)[number];

/**
 * Convenience method for a string with a default value
 */
const msg = (defaultString: string) => {
  return z.string().default(defaultString);
};

const type = (defaultString: string) => {
  return z.literal(defaultString).default(defaultString);
};

/**
 * Battle Descriptions use the following variables:
 * https://www.scribbr.com/nouns-and-pronouns/pronouns/
 *
 * %user - the name of the one who is affected by the effect
 * %target - the name of the one who is affected by the effect
 * %user_subject - he/she
 * %target_subject - he/she
 * %user_object - him/her
 * %target_object - him/her
 * %user_posessive - his/hers
 * %target_posessive - his/hers
 * %user_reflexive - himself/herself
 * %target_reflexive - himself/herself
 * %attacker - a character attacking the target
 * %rounds - the number of rounds the effect will last
 * %amount - the amount of the effect
 * %affected - the stats or pools that are affected by the effect
 * %changetype - the type of change (increased or decreased)
 * %location - the location of the action
 */

/******************** */
/**  BASE ATTRIBUTES  */
/******************** */
const BaseTagTargets = ["INHERIT", "SELF"] as const;
const BaseAttributes = {
  // Visual controls
  staticAssetPath: z.enum(combatAssetsNames).default(""),
  staticAnimation: z.enum(animationNames).default(""),
  appearAnimation: z.enum(animationNames).default(""),
  disappearAnimation: z.enum(animationNames).default(""),
  // Timing controls
  rounds: z.coerce.number().int().min(0).max(100).optional(),
  timeTracker: z.record(z.string(), z.coerce.number()).optional(),
  // Power controls. Has different meanings depending on calculation
  power: z.coerce.number().min(-100).max(100).default(1),
  powerPerLevel: z.coerce.number().min(-1).max(1).default(0),
  // Used for indicating offensive / defensive effect
  direction: type("offence"),
  // Attack target, if different from the default
  target: z.enum(BaseTagTargets).optional().default("INHERIT"),
  // Enable / disables applying to friendlies. Default is to apply to all users
  friendlyFire: z.enum(["ALL", "FRIENDLY", "ENEMIES"]).optional(),
  // Default is for calculation to be static
  calculation: z.enum(["static"]).default("static"),
};

const PowerAttributes = {
  power: z.coerce.number().min(-100).max(100).default(1),
  powerPerLevel: z.coerce.number().min(-1).max(1).default(0),
};

const PositivePowerAttributes = {
  power: z.coerce.number().min(1).max(100).default(1),
  powerPerLevel: z.coerce.number().min(0).max(1).default(0),
};

const PoolAttributes = {
  poolsAffected: z.array(z.enum(PoolType)).default(["Health"]).optional(),
};

const IncludeStats = {
  // Power has the following meaning depending on calculation
  // static: directly equates to the amount returned
  // percentage: power is returned as a percentage
  // formula: power is used in stats-based formula to calculate return value
  statTypes: z.array(z.enum(StatType)).optional(),
  generalTypes: z.array(z.enum(GeneralType)).optional(),
  elements: z.array(z.enum(ElementNames)).optional(),
};

/******************** */
/*******  TAGS  *******/
/******************** */
export const AbsorbTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("absorb").default("absorb"),
  calculation: z.enum(["percentage"]).default("percentage"),
  direction: type("defence"),
  description: msg("Absorb damage taken & convert to health, chakra or stamina"),
  poolsAffected: z.array(z.enum(PoolType)).default(["Health"]),
  target: z.enum(BaseTagTargets).optional().default("SELF"),
});

export const IncreaseArmorTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("increasearmor").default("increasearmor"),
  description: msg("Increase armor rating of target"),
});

export const DecreaseArmorTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("decreasearmor").default("decreasearmor"),
  description: msg("Decrease armor rating of target"),
});

export const IncreaseDamageGivenTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("increasedamagegiven").default("increasedamagegiven"),
  description: msg("Increase damage given by target"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const DecreaseDamageGivenTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("decreasedamagegiven").default("decreasedamagegiven"),
  description: msg("Decrease damage given by target"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const IncreaseDamageTakenTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("increasedamagetaken").default("increasedamagetaken"),
  description: msg("Increase damage taken of target"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const DecreaseDamageTakenTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("decreasedamagetaken").default("decreasedamagetaken"),
  description: msg("Decrease damage taken of target"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const IncreaseHealGivenTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("increaseheal").default("increaseheal"),
  description: msg("Increase how much target can heal others"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const DecreaseHealGivenTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("decreaseheal").default("decreaseheal"),
  description: msg("Decrease how much target can heal others"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const AdjustPoolCostTag = z.object({
  ...BaseAttributes,
  ...PowerAttributes,
  ...PoolAttributes,
  type: z.literal("poolcostadjust").default("poolcostadjust"),
  description: msg("Adjust cost of taking actions"),
  rounds: z.coerce.number().int().min(2).max(20).default(2),
  direction: type("defence"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const IncreasePoolCostTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  ...PoolAttributes,
  type: z.literal("increasepoolcost").default("increasepoolcost"),
  description: msg("Increase cost of taking actions"),
  rounds: z.coerce.number().int().min(2).max(20).default(2),
  direction: type("defence"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const DecreasePoolCostTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  ...PoolAttributes,
  type: z.literal("decreasepoolcost").default("decreasepoolcost"),
  description: msg("Decrease cost of taking actions"),
  rounds: z.coerce.number().int().min(2).max(20).default(2),
  direction: type("defence"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const IncreaseStatTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("increasestat").default("increasestat"),
  description: msg("Increase stats of target"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const DecreaseStatTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("decreasestat").default("decreasestat"),
  description: msg("Decrease stats of target"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const BarrierTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("barrier").default("barrier"),
  curHealth: z.coerce.number().int().min(1).max(100000).default(100),
  maxHealth: z.coerce.number().int().min(1).max(100000).default(100),
  absorbPercentage: z.coerce.number().int().min(1).max(100).default(50),
  direction: type("defence"),
  description: msg("Creates a barrier with level corresponding to power"),
});

export type BarrierTagType = z.infer<typeof BarrierTag>;

export const ClearTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("clear").default("clear"),
  description: msg("Clears all effects from the target"),
});

export const CloneTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("clone").default("clone"),
  description: msg(
    "Create a temporary clone to fight alongside you for a given number of rounds.",
  ),
  rounds: z.coerce.number().int().min(2).max(100).default(2),
  calculation: z.enum(["percentage"]).default("percentage"),
});

export const DamageTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("damage").default("damage"),
  description: msg("Deals damage to target"),
  calculation: z.enum(["formula", "static", "percentage"]).default("formula"),
  residualModifier: z.coerce.number().min(0).max(1).default(1).optional(),
});

export type DamageTagType = z.infer<typeof DamageTag>;

export const FleeTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("flee").default("flee"),
  description: msg("Flee the battle"),
});

export const FleePreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("fleeprevent").default("fleeprevent"),
  description: msg("Prevents fleeing"),
});

export const HealTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("heal").default("heal"),
  description: msg("Heals the target"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const MoveTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("move").default("move"),
  description: msg("Move on the battlefield"),
});

export type MoveTagType = z.infer<typeof MoveTag>;

export const OneHitKillTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("onehitkill").default("onehitkill"),
  description: msg("Instantly kills the target"),
});

export const OneHitKillPreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("onehitkillprevent").default("onehitkillprevent"),
  description: msg("Prevents instant kill effects"),
});

export const ReflectTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("reflect").default("reflect"),
  description: msg("Reflect damage taken"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const RobPreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("robprevent").default("robprevent"),
  description: msg("Prevents robbing of the target"),
});

export const RobTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: z.literal("rob").default("rob"),
  description: msg("Robs money from the target"),
  calculation: z.enum(["formula", "static", "percentage"]).default("formula"),
});

export const SealPreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("sealprevent").default("sealprevent"),
  description: msg("Prevents bloodline from being sealed"),
});

export const SealTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("seal").default("seal"),
  description: msg("Seals the target's bloodline effects"),
});

export const StunPreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("stunprevent").default("stunprevent"),
  description: msg("Prevents being stunned"),
});

export const StunTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("stun").default("stun"),
  description: msg("Stuns the target"),
});

export const SummonPreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("summonprevent").default("summonprevent"),
  description: msg("Prevents summoning"),
});

export const SummonTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: z.literal("summon").default("summon"),
  description: msg(
    "Summon an ally for a certain number of rounds. Its stats are scaled to same total as the summoner, modified by the power of the jutsu as a percentage.",
  ),
  rounds: z.coerce.number().int().min(2).max(100).default(2),
  aiId: z.string().default(""),
  aiHp: z.coerce.number().min(100).max(100000).default(100),
  calculation: z.enum(["percentage"]).default("percentage"),
});

export const VisualTag = z.object({
  ...BaseAttributes,
  type: z.literal("visual").default("visual"),
  description: msg("A battlefield visual effect"),
});

export const UnknownTag = z.object({
  ...BaseAttributes,
  type: z.literal("unknown").default("unknown"),
  description: msg("An unknown tag - please report & change!"),
});

/******************** */
/** UNIONS OF TAGS   **/
/******************** */
const AllTags = z.union([
  AbsorbTag.default({}),
  IncreaseArmorTag.default({}),
  DecreaseArmorTag.default({}),
  IncreaseDamageGivenTag.default({}),
  DecreaseDamageGivenTag.default({}),
  IncreaseDamageTakenTag.default({}),
  DecreaseDamageTakenTag.default({}),
  IncreaseHealGivenTag.default({}),
  DecreaseHealGivenTag.default({}),
  AdjustPoolCostTag.default({}),
  IncreasePoolCostTag.default({}),
  DecreasePoolCostTag.default({}),
  IncreaseStatTag.default({}),
  DecreaseStatTag.default({}),
  BarrierTag.default({}),
  ClearTag.default({}),
  CloneTag.default({}),
  DamageTag.default({}),
  FleeTag.default({}),
  FleePreventTag.default({}),
  HealTag.default({}),
  MoveTag.default({}),
  OneHitKillPreventTag.default({}),
  OneHitKillTag.default({}),
  ReflectTag.default({}),
  RobPreventTag.default({}),
  RobTag.default({}),
  SealPreventTag.default({}),
  SealTag.default({}),
  StunPreventTag.default({}),
  StunTag.default({}),
  SummonPreventTag.default({}),
  SummonTag.default({}),
  VisualTag.default({}),
  UnknownTag.default({}),
]);
export type ZodAllTags = z.infer<typeof AllTags>;
export const tagTypes = AllTags._def.options
  .map((o) => o._def.innerType.shape.type._def.innerType._def.value)
  .filter((t) => t !== "unknown");

const BloodlineTags = z.union([
  AbsorbTag.default({}),
  IncreaseArmorTag.default({}),
  DecreaseArmorTag.default({}),
  IncreaseDamageGivenTag.default({}),
  DecreaseDamageGivenTag.default({}),
  IncreaseDamageTakenTag.default({}),
  DecreaseDamageTakenTag.default({}),
  IncreaseHealGivenTag.default({}),
  DecreaseHealGivenTag.default({}),
  AdjustPoolCostTag.default({}),
  IncreasePoolCostTag.default({}),
  DecreasePoolCostTag.default({}),
  IncreaseStatTag.default({}),
  DecreaseStatTag.default({}),
  DamageTag.default({}),
  HealTag.default({}),
  ReflectTag.default({}),
  RobPreventTag.default({}),
  SealPreventTag.default({}),
  StunPreventTag.default({}),
]);
export type ZodBloodlineTags = z.infer<typeof BloodlineTags>;
export const bloodlineTypes = BloodlineTags._def.options.map(
  (o) => o._def.innerType.shape.type._def.innerType._def.value,
);

/** Based on type name, get the zod schema for validation of that tag */
export const getTagSchema = (type: ZodAllTags["type"]) => {
  const schema = AllTags._def.options.find(
    (o) => o._def.innerType.shape.type._def.innerType._def.value === type,
  );
  if (!schema) return UnknownTag;
  return schema._def.innerType;
};

/**
 * Realized tag, i.e. these are the tags that are actually inserted in battle, with
 * reference information added to the tag (i.e. how powerful was the effect)
 */
export type BattleEffect = ZodAllTags & {
  id: string;
  creatorId: string;
  level: number;
  isNew: boolean;
  castThisRound: boolean;
  createdRound: number;
  villageId?: string | null;
  targetType?: "user" | "barrier";
  power?: number;
  highestOffence?: (typeof StatNames)[number];
  highestDefence?: (typeof StatNames)[number];
  longitude: number;
  latitude: number;
  barrierAbsorb: number;
};

export type GroundEffect = BattleEffect;

export type UserEffect = BattleEffect & {
  targetId: string;
  fromGround?: boolean;
  fromBloodline?: boolean;
};

export type ActionEffect = {
  txt: string;
  color: "red" | "green" | "blue";
};

/**
 * Refiner object, which is used to refine the data in the battle object
 */
type ActionValidatorType = {
  target: (typeof AttackTargets)[number];
  method: (typeof AttackMethods)[number];
  range?: number;
  effects: ZodAllTags[];
};

const addIssue = (ctx: z.RefinementCtx, message: string) => {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
  });
};

const SuperRefineEffects = (
  effects: ZodAllTags[] | ZodBloodlineTags[],
  ctx: z.RefinementCtx,
) => {
  effects.forEach((e) => {
    if (e.type === "barrier" && e.staticAssetPath === "") {
      addIssue(ctx, "BarrierTag needs a staticAssetPath");
    } else if (e.type === "clone" && e.rounds === 0) {
      addIssue(
        ctx,
        "CloneTag can only be set to 0 rounds, indicating a single clone creation",
      );
    }
  });
};

const SuperRefineAction = (data: ActionValidatorType, ctx: z.RefinementCtx) => {
  // Pick out various effect types
  const hasMove = data.effects.find((e) => e.type === "move");
  const hasClone = data.effects.find((e) => e.type === "clone");
  const hasSummon = data.effects.find((e) => e.type === "summon");
  const hasBarrier = data.effects.find((e) => e.type === "barrier");
  const hasDamage = data.effects.find((e) => e.type === "damage");
  const isAOE = data.method.includes("AOE");
  const isEmptyGround = data.target === "EMPTY_GROUND";
  // Run checks
  if (data.target === "SELF" && data.range && data.range > 0) {
    addIssue(ctx, "If target is SELF, range should be 0");
  }
  if (!isEmptyGround) {
    if (hasBarrier) {
      addIssue(ctx, "For barrier tag 'target' needs to be empty ground");
    }
    if (hasClone || hasSummon) {
      addIssue(ctx, "For clone/summon tag 'target' needs to be empty ground");
    }
    if (hasMove) {
      addIssue(ctx, "For move tag 'target' needs to be empty ground");
    }
  }
  if (hasDamage && hasMove && !isAOE) {
    addIssue(ctx, "For Attack+Move tag combo 'method' must AOE-type");
  }
};

/**
 * Jutsu Type. Used for validating a jutsu object is set up properly
 */
export const JutsuValidator = z
  .object({
    name: z.string(),
    image: z.string(),
    description: z.string(),
    battleDescription: z.string(),
    jutsuWeapon: z.enum(WeaponTypes),
    jutsuType: z.enum(JutsuTypes),
    jutsuRank: z.enum(LetterRanks),
    requiredRank: z.enum(UserRanks),
    method: z.enum(AttackMethods),
    target: z.enum(AttackTargets),
    range: z.coerce.number().int().min(0).max(5),
    hidden: z.coerce.number().int().min(0).max(1).optional(),
    healthCostPerc: z.coerce.number().min(0).max(100).optional(),
    chakraCostPerc: z.coerce.number().min(0).max(100).optional(),
    staminaCostPerc: z.coerce.number().min(0).max(100).optional(),
    actionCostPerc: z.coerce.number().int().min(10).max(100).optional(),
    cooldown: z.coerce.number().int().min(0).max(300),
    bloodlineId: z.string().nullable().optional(),
    villageId: z.string().nullable().optional(),
    effects: z.array(AllTags).superRefine(SuperRefineEffects),
  })
  .superRefine(SuperRefineAction);
export type ZodJutsuType = z.infer<typeof JutsuValidator>;

/**
 * Bloodline Type. Used for validating a bloodline object is set up properly
 */
export const BloodlineValidator = z.object({
  name: z.string(),
  image: z.string(),
  description: z.string(),
  rank: z.enum(LetterRanks),
  regenIncrease: z.coerce.number().int().min(0).max(100),
  village: z.string().optional(),
  hidden: z.coerce.number().int().min(0).max(1).optional(),
  effects: z.array(BloodlineTags).superRefine(SuperRefineEffects),
});
export type ZodBloodlineType = z.infer<typeof BloodlineValidator>;

/**
 * Item Type. Used for validating a item object is set up properly
 */
export const ItemValidator = z
  .object({
    name: z.string(),
    image: z.string(),
    description: z.string(),
    battleDescription: z.string().optional(),
    canStack: z.coerce.number().min(0).max(1).optional(),
    stackSize: z.coerce.number().int().min(1).max(100).optional(),
    destroyOnUse: z.coerce.number().min(0).max(1).optional(),
    chakraCostPerc: z.coerce.number().int().min(0).max(100).optional(),
    healthCostPerc: z.coerce.number().int().min(0).max(100).optional(),
    staminaCostPerc: z.coerce.number().int().min(0).max(100).optional(),
    actionCostPerc: z.coerce.number().int().min(1).max(100).optional(),
    hidden: z.coerce.number().int().min(0).max(1).optional(),
    cooldown: z.coerce.number().int().min(0).max(300),
    cost: z.coerce.number().int().min(1),
    range: z.coerce.number().int().min(0).max(10).optional(),
    method: z.enum(AttackMethods),
    target: z.enum(AttackTargets),
    itemType: z.enum(ItemTypes),
    weaponType: z.enum(WeaponTypes),
    rarity: z.enum(ItemRarities),
    slot: z.enum(ItemSlotTypes),
    effects: z.array(AllTags).superRefine(SuperRefineEffects),
  })
  .superRefine(SuperRefineAction);
export type ZodItemType = z.infer<typeof ItemValidator>;

/****************************** */
/*******  DMG SIMULATION  *******/
/****************************** */
const roundStat = (stat: number) => {
  return Math.round(stat * 100) / 100;
};
export const statSchema = z.object({
  ninjutsuOffence: z.coerce
    .number()
    .min(10)
    .max(10000000)
    .transform(roundStat)
    .default(10),
  taijutsuOffence: z.coerce
    .number()
    .min(10)
    .max(10000000)
    .transform(roundStat)
    .default(10),
  genjutsuOffence: z.coerce
    .number()
    .min(10)
    .max(10000000)
    .transform(roundStat)
    .default(10),
  bukijutsuOffence: z.coerce
    .number()
    .min(10)
    .max(10000000)
    .transform(roundStat)
    .default(10),
  ninjutsuDefence: z.coerce
    .number()
    .min(10)
    .max(10000000)
    .transform(roundStat)
    .default(10),
  taijutsuDefence: z.coerce
    .number()
    .min(10)
    .max(10000000)
    .transform(roundStat)
    .default(10),
  genjutsuDefence: z.coerce
    .number()
    .min(10)
    .max(10000000)
    .transform(roundStat)
    .default(10),
  bukijutsuDefence: z.coerce
    .number()
    .min(10)
    .max(10000000)
    .transform(roundStat)
    .default(10),
  strength: z.coerce.number().min(10).max(10000000).transform(roundStat).default(10),
  speed: z.coerce.number().min(10).max(10000000).transform(roundStat).default(10),
  intelligence: z.coerce
    .number()
    .min(10)
    .max(10000000)
    .transform(roundStat)
    .default(10),
  willpower: z.coerce.number().min(10).max(10000000).transform(roundStat).default(10),
});

export const actSchema = z.object({
  power: z.coerce.number().min(1).max(100).default(1),
  statTypes: z.array(z.enum(StatType)).default(["Ninjutsu"]),
  generalTypes: z.array(z.enum(GeneralType)).default(["Strength"]),
});
