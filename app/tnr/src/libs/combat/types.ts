import { z } from "zod";
import type { Jutsu, Item, Bloodline } from "@prisma/client";
import { UserRank } from "@prisma/client";
import { AttackTarget } from "@prisma/client";
import { LetterRank } from "@prisma/client";
import { JutsuType } from "@prisma/client";
import { ItemType } from "@prisma/client";
import { WeaponType } from "@prisma/client";
import { ItemRarity } from "@prisma/client";
import { ItemSlotType } from "@prisma/client";
import type { Village } from "@prisma/client";
import type { UserData, UserJutsu, UserItem, AttackMethod } from "@prisma/client";
import type { TerrainHex } from "../travel/types";
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
  "cur_health",
  "max_health",
  "longitude",
  "latitude",
  "location",
  "sector",
  "updatedAt",
  "elo_pvp",
  "elo_pve",
  "regeneration",
  "village",
  "is_original",
  "controllerId",
  "disappearAnimation",
] as const;

export const privateState = [
  "updatedAt",
  "cur_chakra",
  "max_chakra",
  "cur_stamina",
  "max_stamina",
  "ninjutsu_offence",
  "ninjutsu_defence",
  "genjutsu_offence",
  "genjutsu_defence",
  "taijutsu_offence",
  "taijutsu_defence",
  "bukijutsu_offence",
  "bukijutsu_defence",
  "highest_offence",
  "highest_defence",
  "strength",
  "intelligence",
  "willpower",
  "speed",
  "bloodline",
  "items",
  "jutsus",
] as const;

export const allState = [...publicState, ...privateState] as const;

export type BattleUserState = UserData & {
  jutsus: (UserJutsu & {
    jutsu: Jutsu;
  })[];
  items: (UserItem & {
    item: Item;
  })[];
  bloodline?: Bloodline | null;
  village?: Village | null;
  highest_offence?: number;
  highest_defence?: number;
  is_original: boolean;
  disappearAnimation?: (typeof AnimationNames)[number];
  controllerId: string;
};

export type ReturnedUserState = Pick<BattleUserState, (typeof publicState)[number]> &
  Partial<BattleUserState> & {
    hex?: TerrainHex;
    leftBattle?: boolean;
  };

/**
 * User data for drawn users on the battle page
 * TODO: Do we need this type? isn't it just a subset of the other one?
 */
export interface DrawnCombatUser {
  userId: string;
  villageId?: string | null;
  village?: Village | null;
  username: string;
  updatedAt: Date;
  cur_health: number;
  max_health: number;
  cur_stamina?: number;
  max_stamina?: number;
  cur_chakra?: number;
  max_chakra?: number;
  avatar: string | null;
  longitude: number;
  latitude: number;
  hidden?: boolean;
  is_original: boolean;
  disappearAnimation?: (typeof AnimationNames)[number];
  controllerId: string;
}

export type CombatResult = {
  experience: number;
  elo_pvp: number;
  elo_pve: number;
  cur_health: number;
  cur_stamina: number;
  cur_chakra: number;
  strength: number;
  intelligence: number;
  willpower: number;
  speed: number;
  ninjutsu_offence: number;
  ninjutsu_defence: number;
  genjutsu_offence: number;
  genjutsu_defence: number;
  taijutsu_offence: number;
  taijutsu_defence: number;
  bukijutsu_offence: number;
  bukijutsu_defence: number;
  friendsLeft: number;
  targetsLeft: number;
};

export type CombatAction = {
  id: string;
  name: string;
  image: string;
  battleDescription: string;
  type: "basic" | "jutsu" | "item";
  target: AttackTarget;
  method: AttackMethod;
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
 * Enum types
 */
const Element = ["Fire", "Water", "Wind", "Earth", "Lightning", "None"] as const;
const StatType = ["Highest", "Ninjutsu", "Genjutsu", "Taijutsu", "Bukijutsu"] as const;
const GeneralType = ["Strength", "Intelligence", "Willpower", "Speed"] as const;
const PoolType = ["Health", "Chakra", "Stamina"] as const;

/**
 * Animations
 */
export const Animations = new Map<string, { frames: number; speed: number }>();
Animations.set("hit", { frames: 4, speed: 50 });
Animations.set("smoke", { frames: 9, speed: 50 });
export const AnimationNames = ["hit", "smoke"] as const;

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
 * %user - the name of the one who is affected by the effect
 * %target - the name of the one who is affected by the effect
 * %usergender - he/she
 * %targetgender - he/she
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
  timing: z.enum(["immidiately", "next round"]).default("immidiately"),
  staticAssetPath: z.string().optional(),
  staticAnimation: z.enum(AnimationNames).optional(),
  appearAnimation: z.enum(AnimationNames).optional(),
  disappearAnimation: z.enum(AnimationNames).optional(),
});

const MultipleRounds = z.object({
  rounds: z.number().int().min(1).max(20).optional(),
});

const PoolAttributes = z.object({
  poolsAffected: z.array(z.enum(PoolType)).default(["Health"]).optional(),
});

const StatsBasedStrength = z.object({
  // Power has the following meaning depending on calculation
  // static: directly equates to the amount returned
  // percentage: power is returned as a percentage
  // formula: power is used in battle formula to calculate return value
  power: z.number().min(1).default(1),
  powerPerLevel: z.number().min(0).default(0),
  direction: z.enum(["offensive", "defensive"]).default("offensive"),
  calculation: z.enum(["formula", "static", "percentage"]).default("formula"),
  statTypes: z.array(z.enum(StatType)).optional(),
  generalTypes: z.array(z.enum(GeneralType)).optional(),
  elements: z.array(z.enum(Element)).optional(),
});

const StaticBasedOnly = z.object({
  calculation: z.enum(["static"]).default("static"),
});

const DisableFormula = z.object({
  calculation: z.enum(["static", "percentage"]).default("static"),
});

const ChanceBased = z.object({
  chance: z.number().int().min(1).max(100).default(0).optional(),
  chancePerLevel: z.number().int().min(0).max(100).default(0).optional(),
});

/******************** */
/*******  TAGS  *******/
/******************** */
export const AbsorbTag = z
  .object({
    type: type("absorb"),
    description: msg("Absorb damage taken"),
    elementalOnly: z.boolean().default(false).optional(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const AdjustArmorTag = z
  .object({
    type: type("armoradjust"),
    description: msg("Adjust armor rating of target"),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength)
  .merge(StaticBasedOnly);

export const AdjustDamageGivenTag = z
  .object({
    type: type("damagegivenadjust"),
    description: msg("Adjust damage given by target"),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const AdjustDamageTakenTag = z
  .object({
    type: type("damagetakenadjust"),
    description: msg("Adjust damage taken of target"),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const AdjustHealTag = z
  .object({
    type: type("healadjust"),
    description: msg("Adjust healing ability of target"),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const AdjustPoolCostTag = z
  .object({
    type: type("poolcostadjust"),
    description: msg("Adjust cost of using jutsu"),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const AdjustStatTag = z
  .object({
    type: type("statadjust"),
    description: msg("Adjust stats of target"),
    affectedStats: z.array(z.enum(StatType)).optional(),
    affectedGenerals: z.array(z.enum(GeneralType)).optional(),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const BarrierTag = z
  .object({
    type: type("barrier"),
    description: msg("Creates a barrier which offers cover"),
    originalPower: z.number().int().min(1).default(1),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);
export type BarrierTagType = z.infer<typeof BarrierTag>;

export const ClearTag = z
  .object({
    type: type("clear"),
    description: msg("Clears all effects from the target"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const CloneTag = z
  .object({
    type: type("clone"),
    description: msg("Create a temporary clone to fight alongside you"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength)
  .refine((data) => data.calculation === "percentage", {
    message: "CloneTag requires calculation to be percentage",
  })
  .refine((data) => data.rounds === 1, {
    message: "CloneTag can only be set to 1 round, creating 1 clone",
  });

export const DamageTag = z
  .object({
    type: type("damage"),
    description: msg("Deals damage to target"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);
export type DamageTagType = z.infer<typeof DamageTag>;

export const FleeTag = z
  .object({
    type: type("flee"),
    description: msg("Flee the battle"),
  })
  .merge(BaseAttributes)
  .merge(ChanceBased);

export const FleePreventTag = z
  .object({
    type: type("fleeprevent"),
    description: msg("Prevents fleeing"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const HealTag = z
  .object({
    type: type("heal"),
    description: msg("Heals the target"),
  })
  .merge(BaseAttributes)
  .merge(PoolAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const MoveTag = z
  .object({
    type: type("move"),
    description: msg("Move on the battlefield"),
  })
  .merge(BaseAttributes)
  .merge(ChanceBased);
export type MoveTagType = z.infer<typeof MoveTag>;

export const OneHitKillTag = z
  .object({
    type: type("onehitkill"),
    description: msg("Instantly kills the target"),
  })
  .merge(BaseAttributes)
  .merge(ChanceBased);

export const OneHitKillPreventTag = z
  .object({
    type: type("onehitkillprevent"),
    description: msg("Prevents instant kill effects"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const ReflectTag = z
  .object({
    type: type("reflect"),
    description: msg("Reflect damage taken"),
    elementalOnly: z.boolean().default(false).optional(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const RobPreventTag = z
  .object({
    type: type("robprevent"),
    description: msg("Prevents robbing of the target"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const RobTag = z
  .object({
    type: type("rob"),
    description: msg("Robs money from the target"),
  })
  .merge(BaseAttributes)
  .merge(StatsBasedStrength);

export const SealPreventTag = z
  .object({
    type: type("sealprevent"),
    description: msg("Prevents bloodline from being sealed"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const SealTag = z
  .object({
    type: type("seal"),
    description: msg("Seals the target's bloodline effects"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const StunPreventTag = z
  .object({
    type: type("stunprevent"),
    description: msg("Prevents being stunned"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const StunTag = z
  .object({
    type: type("stun"),
    description: msg("Stuns the target"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const SummonPreventTag = z
  .object({
    type: type("summonprevent"),
    description: msg("Prevents summoning"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const SummonTag = z
  .object({
    type: type("summon"),
    description: msg("Summon an ally"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const VisualTag = z
  .object({
    type: type("visual"),
    description: msg("A battlefield visual effect"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds);

/******************** */
/** UNIONS OF TAGS   **/
/******************** */
const AllTags = z.union([
  AbsorbTag.default({}),
  AdjustArmorTag.default({}),
  AdjustDamageGivenTag.default({}),
  AdjustDamageTakenTag.default({}),
  AdjustHealTag.default({}),
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
  targetType?: "user" | "barrier";
  highest_offence?: number;
  highest_defence?: number;
  ninjutsu_offence?: number;
  ninjutsu_defence?: number;
  genjutsu_offence?: number;
  genjutsu_defence?: number;
  taijutsu_offence?: number;
  taijutsu_defence?: number;
  bukijutsu_offence?: number;
  bukijutsu_defence?: number;
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
};

export type ActionEffect = {
  txt: string;
  color: "red" | "green" | "blue";
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
    jutsuWeapon: z.nativeEnum(WeaponType).optional(),
    jutsuType: z.nativeEnum(JutsuType),
    jutsuRank: z.nativeEnum(LetterRank),
    requiredRank: z.nativeEnum(UserRank),
    target: z.nativeEnum(AttackTarget),
    range: z.number().int().min(0).max(5),
    healthCostPerc: z.number().min(0).max(100).optional(),
    chakraCostPerc: z.number().min(0).max(100).optional(),
    staminaCostPerc: z.number().min(0).max(100).optional(),
    actionCostPerc: z.number().int().min(1).max(100).optional(),
    cooldown: z.number().int().min(1).max(300),
    effects: z.array(AllTags),
  })
  .refine(
    (data) => {
      return (
        !data.effects.find((e) => e.type === "barrier") ||
        data.target === AttackTarget.EMPTY_GROUND
      );
    },
    { message: "Barriers can only be used on empty ground" }
  )
  .refine(
    (data) => {
      return (
        !data.effects.find((e) => e.type === "clone") ||
        data.target === AttackTarget.EMPTY_GROUND
      );
    },
    { message: "Clones can only be used on empty ground" }
  );
export type ZodJutsuType = z.infer<typeof JutsuValidator>;

/**
 * Bloodline Type. Used for validating a bloodline object is set up properly
 */
const BloodlineValidator = z.object({
  name: z.string(),
  image: z.string(),
  description: z.string(),
  rank: z.nativeEnum(LetterRank),
  regenIncrease: z.number().int().min(1).max(100),
  village: z.string(),
  effects: z.array(
    z.union([
      AbsorbTag.omit({ rounds: true }).default({}),
      AdjustArmorTag.omit({ rounds: true }).default({}),
      AdjustDamageGivenTag.omit({ rounds: true }).default({}),
      AdjustDamageTakenTag.omit({ rounds: true }).default({}),
      AdjustHealTag.omit({ rounds: true }).default({}),
      AdjustPoolCostTag.omit({ rounds: true }).default({}),
      AdjustStatTag.omit({ rounds: true }).default({}),
      DamageTag.omit({ rounds: true }).default({}),
      HealTag.omit({ rounds: true }).default({}),
      ReflectTag.omit({ rounds: true }).default({}),
      RobPreventTag.omit({ rounds: true }).default({}),
      SealPreventTag.omit({ rounds: true }).default({}),
      StunPreventTag.omit({ rounds: true }).default({}),
    ])
  ),
});
export type ZodBloodlineType = z.infer<typeof BloodlineValidator>;

/**
 * Item Type. Used for validating a item object is set up properly
 */
const ItemValidator = z.object({
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
  target: z.nativeEnum(AttackTarget),
  itemType: z.nativeEnum(ItemType),
  weaponType: z.nativeEnum(WeaponType).optional(),
  rarity: z.nativeEnum(ItemRarity),
  slot: z.nativeEnum(ItemSlotType),
  effects: z.array(AllTags),
});
export type ZodItemType = z.infer<typeof ItemValidator>;
