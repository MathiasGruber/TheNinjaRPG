import { z } from "zod";
import { AttackMethods, AttackTargets, ItemRarities } from "../../../drizzle/constants";
import { ItemSlotTypes, ItemTypes, JutsuTypes } from "../../../drizzle/constants";
import { LetterRanks, UserRanks, WeaponTypes } from "../../../drizzle/constants";
import { Element } from "./constants";
import { StatType, GeneralType, PoolType } from "./constants";
import type { publicState } from "./constants";
import type { StatNames } from "./constants";
import type { Jutsu, Item, Bloodline } from "../../../drizzle/schema";
import type { UserData, UserJutsu, UserItem, Village } from "../../../drizzle/schema";
import type { TerrainHex } from "../hexgrid";
import type { BattleType } from "../../../drizzle/schema";

/**
 * BattleUserState is the data stored in the battle entry about a given user
 */
export type BattleUserState = UserData & {
  jutsus: (UserJutsu & {
    jutsu: Jutsu;
  })[];
  items: (UserItem & {
    item: Item;
  })[];
  bloodline?: Bloodline | null;
  village?: Village | null;
  highestOffence: typeof StatNames[number];
  highestDefence: typeof StatNames[number];
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
  usedGenerals: typeof GeneralType[number][];
  usedStats: typeof StatNames[number][];
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
export type ReturnedUserState = Pick<BattleUserState, typeof publicState[number]> &
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
  friendsLeft: number;
  targetsLeft: number;
};

export type CombatAction = {
  id: string;
  name: string;
  image: string;
  battleDescription: string;
  type: "basic" | "jutsu" | "item";
  target: typeof AttackTargets[number];
  method: typeof AttackMethods[number];
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
export enum AnimationNames {
  hit = "hit",
  smoke = "smoke",
  fire = "fire",
  heal = "heal",
  explosion = "explosion",
  rising_smoke = "rising_smoke",
}

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
  staticAssetPath: z.string().optional(),
  staticAnimation: z.nativeEnum(AnimationNames).optional(),
  appearAnimation: z.nativeEnum(AnimationNames).optional(),
  disappearAnimation: z.nativeEnum(AnimationNames).optional(),
  // Timing controls
  rounds: z.number().int().min(0).max(20).optional(),
  timeTracker: z.record(z.string(), z.number()).optional(),
  // Power controls. Has different meanings depending on calculation
  power: z.number().min(-100).max(100).default(1),
  powerPerLevel: z.number().min(-1).max(1).default(0),
  // Used for indicating offensive / defensive effect
  direction: z.enum(["offence", "defence"]).default("offence"),
  // Attack target, if different from the default
  target: z.enum(BaseTagTargets).optional().default("INHERIT"),
  // Enable / disables applying to friendlies. Default is to apply to all users
  friendlyFire: z.enum(["ALL", "FRIENDLY", "ENEMIES"]).optional(),
};

const PowerAttributes = {
  power: z.number().min(-100).max(100).default(1),
  powerPerLevel: z.number().min(-1).max(1).default(0),
};

const PositivePowerAttributes = {
  power: z.number().min(1).max(100).default(1),
  powerPerLevel: z.number().min(0).max(1).default(0),
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
  elements: z.array(z.enum(Element)).optional(),
};

/******************** */
/*******  TAGS  *******/
/******************** */
export const AbsorbTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: type("absorb"),
  calculation: z.enum(["percentage"]).default("percentage"),
  direction: type("defence"),
  description: msg("Absorb damage taken & convert to health, chakra or stamina"),
  elementalOnly: z.number().int().min(0).max(1).default(0),
  elements: z.array(z.enum(Element)).optional(),
  poolsAffected: z.array(z.enum(PoolType)).default(["Health"]),
  target: z.enum(BaseTagTargets).optional().default("SELF"),
});

export const AdjustArmorTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PowerAttributes,
  type: type("armoradjust"),
  description: msg("Adjust armor rating of target"),
  calculation: z.enum(["static"]).default("static"),
});

export const AdjustDamageGivenTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PowerAttributes,
  type: type("damagegivenadjust"),
  description: msg("Adjust damage given by target"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const AdjustDamageTakenTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PowerAttributes,
  type: type("damagetakenadjust"),
  description: msg("Adjust damage taken of target"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const AdjustHealGivenTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PowerAttributes,
  type: type("healadjust"),
  description: msg("Adjust how much target can heal others"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const AdjustPoolCostTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PowerAttributes,
  ...PoolAttributes,
  type: type("poolcostadjust"),
  description: msg("Adjust cost of taking actions"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const AdjustStatTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PowerAttributes,
  type: type("statadjust"),
  description: msg("Adjust stats of target"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const BarrierTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: type("barrier"),
  description: msg("Creates a barrier which offers cover"),
  originalPower: z.number().int().min(1).default(1),
  calculation: z.enum(["formula", "static", "percentage"]).default("formula"),
});

export type BarrierTagType = z.infer<typeof BarrierTag>;

export const ClearTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("clear"),
  description: msg("Clears all effects from the target"),
  calculation: z.enum(["static"]).default("static"),
});

export const CloneTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("clone"),
  description: msg(
    "Create a temporary clone to fight alongside you for a given number of rounds."
  ),
  calculation: z.enum(["percentage"]).default("percentage"),
});

export const DamageTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: type("damage"),
  description: msg("Deals damage to target"),
  calculation: z.enum(["formula", "static", "percentage"]).default("formula"),
  residualModifier: z.number().min(0).max(1).default(1).optional(),
});

export type DamageTagType = z.infer<typeof DamageTag>;

export const FleeTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("flee"),
  description: msg("Flee the battle"),
  calculation: z.enum(["static"]).default("static"),
});

export const FleePreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("fleeprevent"),
  description: msg("Prevents fleeing"),
  calculation: z.enum(["static"]).default("static"),
});

export const HealTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: type("heal"),
  description: msg("Heals the target"),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const MoveTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("move"),
  description: msg("Move on the battlefield"),
  calculation: z.enum(["static"]).default("static"),
});

export type MoveTagType = z.infer<typeof MoveTag>;

export const OneHitKillTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("onehitkill"),
  description: msg("Instantly kills the target"),
  calculation: z.enum(["static"]).default("static"),
});

export const OneHitKillPreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("onehitkillprevent"),
  description: msg("Prevents instant kill effects"),
  calculation: z.enum(["static"]).default("static"),
});

export const ReflectTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: type("reflect"),
  description: msg("Reflect damage taken"),
  elementalOnly: z.boolean().default(false).optional(),
  calculation: z.enum(["static", "percentage"]).default("percentage"),
});

export const RobPreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("robprevent"),
  description: msg("Prevents robbing of the target"),
  calculation: z.enum(["static"]).default("static"),
});

export const RobTag = z.object({
  ...BaseAttributes,
  ...IncludeStats,
  ...PositivePowerAttributes,
  type: type("rob"),
  description: msg("Robs money from the target"),
  calculation: z.enum(["formula", "static", "percentage"]).default("formula"),
});

export const SealPreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("sealprevent"),
  description: msg("Prevents bloodline from being sealed"),
  calculation: z.enum(["static"]).default("static"),
});

export const SealTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("seal"),
  description: msg("Seals the target's bloodline effects"),
  calculation: z.enum(["static"]).default("static"),
});

export const StunPreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("stunprevent"),
  description: msg("Prevents being stunned"),
  calculation: z.enum(["static"]).default("static"),
});

export const StunTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("stun"),
  description: msg("Stuns the target"),
  calculation: z.enum(["static"]).default("static"),
});

export const SummonPreventTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("summonprevent"),
  description: msg("Prevents summoning"),
  calculation: z.enum(["static"]).default("static"),
});

export const SummonTag = z.object({
  ...BaseAttributes,
  ...PositivePowerAttributes,
  type: type("summon"),
  description: msg(
    "Summon an ally for a certain number of rounds. Its stats are scaled to same total as the summoner, modified by the power of the jutsu as a percentage."
  ),
  rounds: z.number().int().min(2).max(20).default(2),
  aiId: z.string().default(""),
  aiHp: z.number().min(100).max(100000).default(100),
  calculation: z.enum(["percentage"]).default("percentage"),
});

export const VisualTag = z.object({
  ...BaseAttributes,
  type: type("visual"),
  description: msg("A battlefield visual effect"),
  calculation: z.enum(["static"]).default("static"),
});

// All the possible tags
export const tagTypes = [
  "absorb",
  "armoradjust",
  "damagegivenadjust",
  "damagetakenadjust",
  "healadjust",
  "poolcostadjust",
  "statadjust",
  "barrier",
  "clear",
  "clone",
  "damage",
  "flee",
  "fleeprevent",
  "heal",
  "move",
  "onehitkill",
  "onehitkillprevent",
  "reflect",
  "rob",
  "robprevent",
  "seal",
  "sealprevent",
  "stun",
  "stunprevent",
  "summon",
  "summonprevent",
] as const;

export const bloodlineTypes = [
  "absorb",
  "armoradjust",
  "damagegivenadjust",
  "damagetakenadjust",
  "healadjust",
  "poolcostadjust",
  "statadjust",
  "damage",
  "fleeprevent",
  "heal",
  "reflect",
  "robprevent",
  "sealprevent",
  "stunprevent",
] as const;

/** Based on type name, get the zod schema for validation of that tag */
export const getTagSchema = (type: string) => {
  switch (type) {
    case "absorb":
      return AbsorbTag;
    case "armoradjust":
      return AdjustArmorTag;
    case "damagegivenadjust":
      return AdjustDamageGivenTag;
    case "damagetakenadjust":
      return AdjustDamageTakenTag;
    case "healadjust":
      return AdjustHealGivenTag;
    case "poolcostadjust":
      return AdjustPoolCostTag;
    case "statadjust":
      return AdjustStatTag;
    case "barrier":
      return BarrierTag;
    case "clear":
      return ClearTag;
    case "clone":
      return CloneTag;
    case "damage":
      return DamageTag;
    case "flee":
      return FleeTag;
    case "fleeprevent":
      return FleePreventTag;
    case "heal":
      return HealTag;
    case "move":
      return MoveTag;
    case "onehitkill":
      return OneHitKillTag;
    case "onehitkillprevent":
      return OneHitKillPreventTag;
    case "reflect":
      return ReflectTag;
    case "rob":
      return RobTag;
    case "robprevent":
      return RobPreventTag;
    case "seal":
      return SealTag;
    case "sealprevent":
      return SealPreventTag;
    case "stun":
      return StunTag;
    case "stunprevent":
      return StunPreventTag;
    case "summon":
      return SummonTag;
    case "summonprevent":
      return SummonPreventTag;
  }
  throw new Error(`Unknown tag type ${type}`);
};

/******************** */
/** UNIONS OF TAGS   **/
/******************** */
const AllTags = z.union([
  AbsorbTag.default({}),
  AdjustArmorTag.default({}),
  AdjustDamageGivenTag.default({}),
  AdjustDamageTakenTag.default({}),
  AdjustHealGivenTag.default({}),
  AdjustPoolCostTag.default({}),
  AdjustStatTag.default({}),
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
]);
export type ZodAllTags = z.infer<typeof AllTags>;

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
  highestOffence?: typeof StatNames[number];
  highestDefence?: typeof StatNames[number];
  longitude: number;
  latitude: number;
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
  target: typeof AttackTargets[number];
  method: typeof AttackMethods[number];
  range?: number;
  effects: ZodAllTags[];
};

const addIssue = (ctx: z.RefinementCtx, message: string) => {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
  });
};

const SuperRefineEffects = (effects: ZodAllTags[], ctx: z.RefinementCtx) => {
  effects.forEach((e) => {
    if (e.type === "absorb" && e.direction === "offence") {
      addIssue(ctx, "AbsorbTag should be set to defence");
    } else if (e.type === "armoradjust") {
      if (
        (e.direction === "offence" && e.power > 0) ||
        (e.direction === "defence" && e.power < 0)
      )
        addIssue(ctx, "ArmorTag power & direction mismatch");
    } else if (e.type === "barrier" && e.direction === "offence") {
      addIssue(ctx, "BarrierTag power & direction mismatch");
    } else if (e.type === "clone" && e.rounds === 0) {
      addIssue(
        ctx,
        "CloneTag can only be set to 0 rounds, indicating a single clone creation"
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
    jutsuWeapon: z.enum(WeaponTypes).optional(),
    jutsuType: z.enum(JutsuTypes),
    jutsuRank: z.enum(LetterRanks),
    requiredRank: z.enum(UserRanks),
    method: z.enum(AttackMethods),
    target: z.enum(AttackTargets),
    range: z.number().int().min(0).max(5),
    hidden: z.number().int().min(0).max(1).optional(),
    healthCostPerc: z.number().min(0).max(100).optional(),
    chakraCostPerc: z.number().min(0).max(100).optional(),
    staminaCostPerc: z.number().min(0).max(100).optional(),
    actionCostPerc: z.number().int().min(10).max(100).optional(),
    cooldown: z.number().int().min(0).max(300),
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
  regenIncrease: z.number().int().min(1).max(100),
  village: z.string(),
  hidden: z.number().int().min(0).max(1).optional(),
  effects: z
    .array(
      z.union([
        AbsorbTag.omit({ rounds: true, friendlyFire: true }).default({}),
        AdjustArmorTag.omit({ rounds: true, friendlyFire: true }).default({}),
        AdjustDamageGivenTag.omit({ rounds: true, friendlyFire: true }).default({}),
        AdjustDamageTakenTag.omit({ rounds: true, friendlyFire: true }).default({}),
        AdjustHealGivenTag.omit({ rounds: true, friendlyFire: true }).default({}),
        AdjustPoolCostTag.omit({ rounds: true, friendlyFire: true }).default({}),
        AdjustStatTag.omit({ rounds: true, friendlyFire: true }).default({}),
        DamageTag.omit({ rounds: true, friendlyFire: true }).default({}),
        HealTag.omit({ rounds: true, friendlyFire: true }).default({}),
        ReflectTag.omit({ rounds: true, friendlyFire: true }).default({}),
        RobPreventTag.omit({ rounds: true, friendlyFire: true }).default({}),
        SealPreventTag.omit({ rounds: true, friendlyFire: true }).default({}),
        StunPreventTag.omit({ rounds: true, friendlyFire: true }).default({}),
      ])
    )
    .superRefine(SuperRefineEffects),
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
    canStack: z.number().min(0).max(1).optional(),
    stackSize: z.number().int().min(1).max(100).optional(),
    destroyOnUse: z.number().min(0).max(1).optional(),
    chakraCostPerc: z.number().int().min(0).max(100).optional(),
    healthCostPerc: z.number().int().min(0).max(100).optional(),
    staminaCostPerc: z.number().int().min(0).max(100).optional(),
    actionCostPerc: z.number().int().min(1).max(100).optional(),
    hidden: z.number().int().min(0).max(1).optional(),
    cooldown: z.number().int().min(0).max(300),
    cost: z.number().int().min(1),
    range: z.number().int().min(0).max(10).optional(),
    method: z.enum(AttackMethods),
    target: z.enum(AttackTargets),
    itemType: z.enum(ItemTypes),
    weaponType: z.enum(WeaponTypes).optional(),
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
  ninjutsuOffence: z.number().min(10).max(10000000).transform(roundStat).default(10),
  taijutsuOffence: z.number().min(10).max(10000000).transform(roundStat).default(10),
  genjutsuOffence: z.number().min(10).max(10000000).transform(roundStat).default(10),
  bukijutsuOffence: z.number().min(10).max(10000000).transform(roundStat).default(10),
  ninjutsuDefence: z.number().min(10).max(10000000).transform(roundStat).default(10),
  taijutsuDefence: z.number().min(10).max(10000000).transform(roundStat).default(10),
  genjutsuDefence: z.number().min(10).max(10000000).transform(roundStat).default(10),
  bukijutsuDefence: z.number().min(10).max(10000000).transform(roundStat).default(10),
  strength: z.number().min(10).max(10000000).transform(roundStat).default(10),
  speed: z.number().min(10).max(10000000).transform(roundStat).default(10),
  intelligence: z.number().min(10).max(10000000).transform(roundStat).default(10),
  willpower: z.number().min(10).max(10000000).transform(roundStat).default(10),
});

export const actSchema = z.object({
  power: z.number().min(1).max(100).default(1),
  statTypes: z.array(z.enum(StatType)).default(["Ninjutsu"]),
  generalTypes: z.array(z.enum(GeneralType)).default(["Strength"]),
});
