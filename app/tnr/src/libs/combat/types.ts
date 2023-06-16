import { z } from "zod";
import { AttackMethods, AttackTargets, ItemRarities } from "../../../drizzle/schema";
import { ItemSlotTypes, ItemTypes, JutsuTypes } from "../../../drizzle/schema";
import { LetterRanks, UserRanks, WeaponTypes } from "../../../drizzle/schema";
import type { Jutsu, Item, Bloodline } from "../../../drizzle/schema";
import type { UserData, UserJutsu, UserItem, Village } from "../../../drizzle/schema";
import type { TerrainHex } from "../hexgrid";
import type { UserBattle } from "../../utils/UserContext";

/**
 * Which state is public / private on users
 */
export const publicState = [
  "userId",
  "villageId",
  "username",
  "gender",
  "avatar",
  "curHealth",
  "maxHealth",
  "longitude",
  "latitude",
  "location",
  "sector",
  "updatedAt",
  "eloPvp",
  "eloPve",
  "regeneration",
  "village",
  "fledBattle",
  "leftBattle",
  "isOriginal",
  "isAi",
  "controllerId",
] as const;

export const privateState = [
  "updatedAt",
  "curChakra",
  "maxChakra",
  "curStamina",
  "maxStamina",
  "ninjutsuOffence",
  "ninjutsuDefence",
  "genjutsuOffence",
  "genjutsuDefence",
  "taijutsuOffence",
  "taijutsuDefence",
  "bukijutsuOffence",
  "bukijutsuDefence",
  "highestOffence",
  "highestDefence",
  "strength",
  "intelligence",
  "willpower",
  "speed",
  "bloodline",
  "items",
  "jutsus",
] as const;

export const allState = [...publicState, ...privateState] as const;

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
  highestOffence: number;
  highestDefence: number;
  highestOffence_type: typeof StatNames[number];
  highestDefence_type: typeof StatNames[number];
  armor: number;
  hidden?: boolean;
  isOriginal: boolean;
  controllerId: string;
  leftBattle: boolean;
  fledBattle: boolean;
  hex?: TerrainHex;
  usedGenerals: typeof GeneralType[number][];
  usedStats: typeof StatNames[number][];
  usedActionIDs: string[];
};

/**
 * User state returned is masked to hide confidential information about other players
 */
export type ReturnedUserState = Pick<BattleUserState, typeof publicState[number]> &
  Partial<BattleUserState>;

/**
 * Result type for users when battle is ended
 */
export type CombatResult = {
  experience: number;
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
  effects: ZodAllTags[];
  data?: Jutsu | Item;
  level?: number;
  quantity?: number;
  hidden?: boolean;
};

export interface BattleState {
  battle?: UserBattle | null;
  result: CombatResult | null;
  isLoading: boolean;
}

/**
 * Schema & types for performing battle actions
 */
export const performActionSchema = z.object({
  battleId: z.string().cuid(),
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
  absorb?: number;
};

/**
 * Enum types
 */
const Element = ["Fire", "Water", "Wind", "Earth", "Lightning", "None"] as const;
const StatType = ["Highest", "Ninjutsu", "Genjutsu", "Taijutsu", "Bukijutsu"] as const;
const GeneralType = ["Strength", "Intelligence", "Willpower", "Speed"] as const;
const PoolType = ["Health", "Chakra", "Stamina"] as const;
export const StatNames = [
  "ninjutsuOffence",
  "ninjutsuDefence",
  "genjutsuOffence",
  "genjutsuDefence",
  "taijutsuOffence",
  "taijutsuDefence",
  "bukijutsuOffence",
  "bukijutsuDefence",
] as const;

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
export const AnimationNames = [
  "hit",
  "smoke",
  "fire",
  "heal",
  "explosion",
  "rising_smoke",
] as const;

/**
 * Static Visuals
 */
export const Statics = new Map<string, { frames: number; speed: number }>();
Statics.set("hit", { frames: 4, speed: 50 });
Statics.set("smoke", { frames: 9, speed: 50 });
export const StaticNames = ["hit", "smoke"] as const;

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

const BaseAttributes = z.object({
  // Visual controls
  staticAssetPath: z.string().optional(),
  staticAnimation: z.enum(AnimationNames).optional(),
  appearAnimation: z.enum(AnimationNames).optional(),
  disappearAnimation: z.enum(AnimationNames).optional(),
  // Timing controls
  rounds: z.number().int().min(0).max(20).optional(),
  timeTracker: z.record(z.string(), z.number()).optional(),
  // Power controls. Has different meanings depending on calculation
  power: z.number().min(1).default(1),
  powerPerLevel: z.number().min(0).default(0),
  // Used for indicating offensive / defensive effect
  direction: z.enum(["offence", "defence"]).default("offence"),
});

const PoolAttributes = z.object({
  poolsAffected: z.array(z.enum(PoolType)).default(["Health"]).optional(),
});

const IncludeStats = z.object({
  // Power has the following meaning depending on calculation
  // static: directly equates to the amount returned
  // percentage: power is returned as a percentage
  // formula: power is used in stats-based formula to calculate return value
  statTypes: z.array(z.enum(StatType)).optional(),
  generalTypes: z.array(z.enum(GeneralType)).optional(),
  elements: z.array(z.enum(Element)).optional(),
});

/******************** */
/*******  TAGS  *******/
/******************** */
export const AbsorbTag = z
  .object({
    type: type("absorb"),
    direction: type("defence"),
    description: msg("Absorb damage taken"),
    elementalOnly: z.boolean().default(false).optional(),
    calculation: z.enum(["percentage"]).default("percentage"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats);

export const AdjustArmorTag = z
  .object({
    type: type("armoradjust"),
    description: msg("Adjust armor rating of target"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats);

export const AdjustDamageGivenTag = z
  .object({
    type: type("damagegivenadjust"),
    description: msg("Adjust damage given by target"),
    calculation: z.enum(["static", "percentage"]).default("percentage"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats);

export const AdjustDamageTakenTag = z
  .object({
    type: type("damagetakenadjust"),
    description: msg("Adjust damage taken of target"),
    calculation: z.enum(["static", "percentage"]).default("percentage"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats);

export const AdjustHealGivenTag = z
  .object({
    type: type("healadjust"),
    description: msg("Adjust how much target can heal others"),
    calculation: z.enum(["static", "percentage"]).default("percentage"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats);

export const AdjustPoolCostTag = z
  .object({
    type: type("poolcostadjust"),
    description: msg("Adjust cost of taking actions"),
    calculation: z.enum(["static", "percentage"]).default("percentage"),
  })
  .merge(BaseAttributes)
  .merge(PoolAttributes)
  .merge(IncludeStats);

export const AdjustStatTag = z
  .object({
    type: type("statadjust"),
    description: msg("Adjust stats of target"),
    calculation: z.enum(["static", "percentage"]).default("percentage"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats);

export const BarrierTag = z
  .object({
    type: type("barrier"),
    description: msg("Creates a barrier which offers cover"),
    originalPower: z.number().int().min(1).default(1),
    calculation: z.enum(["formula", "static", "percentage"]).default("formula"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats);
export type BarrierTagType = z.infer<typeof BarrierTag>;

export const ClearTag = z
  .object({
    type: type("clear"),
    description: msg("Clears all effects from the target"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const CloneTag = z
  .object({
    type: type("clone"),
    description: msg("Create a temporary clone to fight alongside you"),
    calculation: z.enum(["percentage"]).default("percentage"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats)
  .refine((data) => data.rounds === 0, {
    message: "CloneTag can only be set to 0 rounds, indicating a single clone creation",
  });

export const DamageTag = z
  .object({
    type: type("damage"),
    description: msg("Deals damage to target"),
    calculation: z.enum(["formula", "static", "percentage"]).default("formula"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats);
export type DamageTagType = z.infer<typeof DamageTag>;

export const FleeTag = z
  .object({
    type: type("flee"),
    description: msg("Flee the battle"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const FleePreventTag = z
  .object({
    type: type("fleeprevent"),
    description: msg("Prevents fleeing"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const HealTag = z
  .object({
    type: type("heal"),
    description: msg("Heals the target"),
    calculation: z.enum(["static", "percentage"]).default("percentage"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats);

export const MoveTag = z
  .object({
    type: type("move"),
    description: msg("Move on the battlefield"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);
export type MoveTagType = z.infer<typeof MoveTag>;

export const OneHitKillTag = z
  .object({
    type: type("onehitkill"),
    description: msg("Instantly kills the target"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const OneHitKillPreventTag = z
  .object({
    type: type("onehitkillprevent"),
    description: msg("Prevents instant kill effects"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const ReflectTag = z
  .object({
    type: type("reflect"),
    description: msg("Reflect damage taken"),
    elementalOnly: z.boolean().default(false).optional(),
    calculation: z.enum(["static", "percentage"]).default("percentage"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats);

export const RobPreventTag = z
  .object({
    type: type("robprevent"),
    description: msg("Prevents robbing of the target"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const RobTag = z
  .object({
    type: type("rob"),
    description: msg("Robs money from the target"),
    calculation: z.enum(["formula", "static", "percentage"]).default("formula"),
  })
  .merge(BaseAttributes)
  .merge(IncludeStats);

export const SealPreventTag = z
  .object({
    type: type("sealprevent"),
    description: msg("Prevents bloodline from being sealed"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const SealTag = z
  .object({
    type: type("seal"),
    description: msg("Seals the target's bloodline effects"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const StunPreventTag = z
  .object({
    type: type("stunprevent"),
    description: msg("Prevents being stunned"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const StunTag = z
  .object({
    type: type("stun"),
    description: msg("Stuns the target"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const SummonPreventTag = z
  .object({
    type: type("summonprevent"),
    description: msg("Prevents summoning"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const SummonTag = z
  .object({
    type: type("summon"),
    description: msg("Summon an ally"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

export const VisualTag = z
  .object({
    type: type("visual"),
    description: msg("A battlefield visual effect"),
    calculation: z.enum(["static"]).default("static"),
  })
  .merge(BaseAttributes);

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
  createdAt: number;
  targetType?: "user" | "barrier";
  highestOffence?: number;
  highestDefence?: number;
  ninjutsuOffence?: number;
  ninjutsuDefence?: number;
  genjutsuOffence?: number;
  genjutsuDefence?: number;
  taijutsuOffence?: number;
  taijutsuDefence?: number;
  bukijutsuOffence?: number;
  bukijutsuDefence?: number;
  strength?: number;
  intelligence?: number;
  willpower?: number;
  speed?: number;
  power?: number;
};

export type GroundEffect = BattleEffect & {
  longitude: number;
  latitude: number;
};

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
    if (e.type === "clear" && e.rounds !== 0) {
      addIssue(ctx, "ClearTag can only be set to 0 rounds");
    } else if (e.type === "absorb" && e.direction === "offence") {
      addIssue(ctx, "AbsorbTag should be set to defence");
    } else if (e.type === "armoradjust") {
      if (
        (e.direction === "offence" && e.power > 0) ||
        (e.direction === "defence" && e.power < 0)
      )
        addIssue(ctx, "ArmorTag power & direction mismatch");
    } else if (e.type === "barrier" && e.direction === "offence") {
      addIssue(ctx, "BarrierTag power & direction mismatch");
    }
  });
};

const SuperRefineAction = (data: ActionValidatorType, ctx: z.RefinementCtx) => {
  if (data.target !== "EMPTY_GROUND") {
    if (data.effects.find((e) => e.type === "barrier")) {
      addIssue(ctx, "Barriers need empty ground");
    }
    if (data.effects.find((e) => e.type === "clone")) {
      addIssue(ctx, "Clone need empty ground");
    }
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
    healthCostPerc: z.number().min(0).max(100).optional(),
    chakraCostPerc: z.number().min(0).max(100).optional(),
    staminaCostPerc: z.number().min(0).max(100).optional(),
    actionCostPerc: z.number().int().min(1).max(100).optional(),
    cooldown: z.number().int().min(1).max(300),
    effects: z.array(AllTags).superRefine(SuperRefineEffects),
  })
  .superRefine(SuperRefineAction);
export type ZodJutsuType = z.infer<typeof JutsuValidator>;

/**
 * Bloodline Type. Used for validating a bloodline object is set up properly
 */
const BloodlineValidator = z.object({
  name: z.string(),
  image: z.string(),
  description: z.string(),
  rank: z.enum(LetterRanks),
  regenIncrease: z.number().int().min(1).max(100),
  village: z.string(),
  effects: z
    .array(
      z.union([
        AbsorbTag.omit({ rounds: true }).default({}),
        AdjustArmorTag.omit({ rounds: true }).default({}),
        AdjustDamageGivenTag.omit({ rounds: true }).default({}),
        AdjustDamageTakenTag.omit({ rounds: true }).default({}),
        AdjustHealGivenTag.omit({ rounds: true }).default({}),
        AdjustPoolCostTag.omit({ rounds: true }).default({}),
        AdjustStatTag.omit({ rounds: true }).default({}),
        DamageTag.omit({ rounds: true }).default({}),
        HealTag.omit({ rounds: true }).default({}),
        ReflectTag.omit({ rounds: true }).default({}),
        RobPreventTag.omit({ rounds: true }).default({}),
        SealPreventTag.omit({ rounds: true }).default({}),
        StunPreventTag.omit({ rounds: true }).default({}),
      ])
    )
    .superRefine(SuperRefineEffects),
});
export type ZodBloodlineType = z.infer<typeof BloodlineValidator>;

/**
 * Item Type. Used for validating a item object is set up properly
 */
const ItemValidator = z
  .object({
    name: z.string(),
    image: z.string(),
    description: z.string(),
    canStack: z.boolean().optional(),
    stackSize: z.number().int().min(1).max(100).optional(),
    destroyOnUse: z.boolean().optional(),
    chakraCostPerc: z.number().int().min(1).max(100).optional(),
    staminaCostPerc: z.number().int().min(1).max(100).optional(),
    actionCostPerc: z.number().int().min(1).max(100).optional(),
    cost: z.number().int().min(1),
    range: z.number().int().min(0).max(10).optional(),
    target: z.enum(AttackTargets),
    itemType: z.enum(ItemTypes),
    weaponType: z.enum(WeaponTypes).optional(),
    rarity: z.enum(ItemRarities),
    slot: z.enum(ItemSlotTypes),
    effects: z.array(AllTags).superRefine(SuperRefineEffects),
  })
  .superRefine(SuperRefineAction);
export type ZodItemType = z.infer<typeof ItemValidator>;
