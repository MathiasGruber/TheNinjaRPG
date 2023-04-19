import { z } from "zod";
import { type Battle, type UserData } from "@prisma/client";
import { UserRank } from "@prisma/client/edge";
import { AttackTarget } from "@prisma/client/edge";
import { LetterRank } from "@prisma/client/edge";
import { JutsuType } from "@prisma/client/edge";
import { ItemType } from "@prisma/client/edge";
import { WeaponType } from "@prisma/client/edge";
import { ItemRarity } from "@prisma/client/edge";
import { ItemSlot } from "@prisma/client/edge";

/**
 * Which state is public / private on users
 */
export const publicState = [
  "userId",
  "username",
  "gender",
  "avatar",
  "cur_health",
  "max_health",
  "longitude",
  "latitude",
  "location",
  "sector",
] as const;
export const privateState = [
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
 * User data for drawn users on the battle page
 */
export interface DrawnCombatUser {
  userId: string;
  username: string;
  cur_health: number;
  max_health: number;
  cur_stamina?: number;
  max_stamina?: number;
  cur_chakra?: number;
  max_chakra?: number;
  avatar: string | null;
  longitude: number;
  latitude: number;
}

/**
 * Enum types
 */
const Element = ["Fire", "Water", "Wind", "Earth", "Lightning", "None"] as const;
const StatType = ["Highest", "Ninjutsu", "Genjutsu", "Taijutsu", "Bukijutsu"] as const;
const GeneralType = ["Strength", "Intelligence", "Willpower", "Speed"] as const;
const PoolType = ["Health", "Chakra", "Stamina"] as const;

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
 */

/******************** */
/**  BASE ATTRIBUTES  */
/******************** */
const BaseAttributes = z.object({
  timing: z.enum(["immidiately", "next round"]).default("immidiately"),
});

const MultipleRounds = z.object({
  minRounds: z.number().int().min(1).max(5).default(1).optional(),
  maxRounds: z.number().int().min(1).max(5).default(1).optional(),
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
  powerPerLevel: z.number().min(0).default(1),
  calculation: z.enum(["formula", "static", "percentage"]).default("formula"),
  statTypes: z.array(z.enum(StatType)).optional(),
  generalTypes: z.array(z.enum(GeneralType)).optional(),
  elements: z.array(z.enum(Element)).optional(),
});

const ChanceBased = z.object({
  chance: z.number().int().min(1).max(100).default(0).optional(),
  chancePerLevel: z.number().int().min(0).max(100).default(0).optional(),
});

const CanBeAOE = z.object({
  aoe: z.boolean().default(false).optional(),
  aoeRange: z.number().int().min(1).max(5).default(1).optional(),
});

/******************** */
/*******  TAGS  *******/
/******************** */
export const AbsorbTag = z
  .object({
    type: type("absorb"),
    description: msg("Absorb damage taken"),
    battleEffect: msg("%target absorbs %amount of the damage"),
    elementalOnly: z.boolean().default(false).optional(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const AdjustArmorTag = z
  .object({
    type: type("armoradjust"),
    description: msg("Adjust armor rating of target"),
    battleEffect: msg("%target armor rating is %changetype by %amount"),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const AdjustDamageGivenTag = z
  .object({
    type: type("damagegivenadjust"),
    description: msg("Adjust damage given by target"),
    battleEffect: msg("Damage given by %target is %changetype for %rounds rounds"),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const AdjustDamageTakenTag = z
  .object({
    type: type("damagetakenadjust"),
    description: msg("Adjust damage taken of target"),
    battleEffect: msg("Damage sustained by %target is %changetype for %rounds rounds"),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const AdjustHealTag = z
  .object({
    type: type("healadjust"),
    description: msg("Adjust healing ability of target"),
    battleEffect: msg("%target healing ability is %changetype by %amount"),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const AdjustPoolCostTag = z
  .object({
    type: type("poolcostadjust"),
    description: msg("Adjust cost of using jutsu"),
    battleEffect: msg(
      "The %affected cost for %target using jutsu is %changetype by %amount"
    ),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const AdjustStatTag = z
  .object({
    type: type("statadjust"),
    description: msg("Adjust stats of target"),
    battleEffect: msg("%target's %affected are %changetype by %amount"),
    affectedStats: z.array(z.enum(StatType)).optional(),
    affectedGenerals: z.array(z.enum(GeneralType)).optional(),
    adjustUp: z.boolean().default(true),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const ClearTag = z
  .object({
    type: type("clear"),
    description: msg("Clears all effects from the target"),
    battleEffect: msg("%target is now clear of all effects"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const DamageTag = z
  .object({
    type: type("damage"),
    description: msg("Deals damage to target"),
    battleEffect: msg("%target takes %amount damage"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength)
  .merge(CanBeAOE);

export const FleeTag = z
  .object({
    type: type("flee"),
    description: msg("Flee the battle"),
    battleEffect: msg("%target flees the battle"),
  })
  .merge(BaseAttributes)
  .merge(ChanceBased);

export const FleePreventTag = z
  .object({
    type: type("fleeprevent"),
    description: msg("Prevents fleeing"),
    battleEffect: msg("%target is cannot be stunned for %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased)
  .merge(CanBeAOE);

export const HealTag = z
  .object({
    type: type("heal"),
    description: msg("Heals the target"),
    battleEffect: msg("%target heals $amount %affected"),
  })
  .merge(BaseAttributes)
  .merge(PoolAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength)
  .merge(CanBeAOE);

export const OneHitKillTag = z
  .object({
    type: type("onehitkill"),
    description: msg("Instantly kills the target"),
    battleEffect: msg("%target is killed"),
  })
  .merge(BaseAttributes)
  .merge(ChanceBased);

export const OneHitKillPreventTag = z
  .object({
    type: type("onehitkillprevent"),
    description: msg("Prevents instant kill effects"),
    battleEffect: msg(
      "%target is now immune to instant kill effects for %rounds rounds"
    ),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const ReflectTag = z
  .object({
    type: type("reflect"),
    description: msg("Reflect damage taken"),
    battleEffect: msg("%target reflects %amount of the damage to %attacker"),
    elementalOnly: z.boolean().default(false).optional(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

export const RobPreventTag = z
  .object({
    type: type("robprevent"),
    description: msg("Prevents robbing of the target"),
    battleEffect: msg("%target can not be robbed for %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const RobTag = z
  .object({
    type: type("rob"),
    description: msg("Robs money from the target"),
    battleEffect: msg("%user steals %amount ryo from %target"),
  })
  .merge(BaseAttributes)
  .merge(StatsBasedStrength);

export const SealPreventTag = z
  .object({
    type: type("sealprevent"),
    description: msg("Prevents bloodline from being sealed"),
    battleEffect: msg("%target's bloodline cannot be sealed for %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased)
  .merge(CanBeAOE);

export const SealTag = z
  .object({
    type: type("seal"),
    description: msg("Seals the target's bloodline effects"),
    battleEffect: msg("%target's bloodline is sealed for the following %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased)
  .merge(CanBeAOE);

export const StunPreventTag = z
  .object({
    type: type("stunprevent"),
    description: msg("Prevents being stunned"),
    battleEffect: msg("%target cannot be stunned for %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased)
  .merge(CanBeAOE);

export const StunTag = z
  .object({
    type: type("stun"),
    description: msg("Stuns the target"),
    battleEffect: msg("%target is stunned for the following %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased)
  .merge(CanBeAOE);

export const SummonPreventTag = z
  .object({
    type: type("summonprevent"),
    description: msg("Prevents summoning"),
    battleEffect: msg("%target is now prevented from summoning for %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

export const SummonTag = z
  .object({
    type: type("summon"),
    description: msg("Summon an ally"),
    battleEffect: msg("%user summons %target to the battlefield"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

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
  ClearTag.default({}),
  DamageTag.default({}),
  FleeTag.default({}),
  FleePreventTag.default({}),
  HealTag.default({}),
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
]);
export type ZodAllTags = z.infer<typeof AllTags>;

/**
 * Jutsu Type. Used for validating a jutsu object is set up properly
 */
const Jutsu = z.object({
  name: z.string(),
  image: z.string(),
  description: z.string(),
  battleDescription: z.string(),
  jutsuWeapon: z.nativeEnum(WeaponType).optional(),
  jutsuType: z.nativeEnum(JutsuType),
  jutsuRank: z.nativeEnum(LetterRank),
  requiredRank: z.nativeEnum(UserRank),
  target: z.nativeEnum(AttackTarget),
  range: z.number().int().min(1).max(5),
  healthCostPerc: z.number().min(0).max(100).optional(),
  chakraCostPerc: z.number().min(0).max(100).optional(),
  staminaCostPerc: z.number().min(0).max(100).optional(),
  cooldown: z.number().int().min(1).max(300),
  effects: z.array(AllTags),
});
export type ZodJutsuType = z.infer<typeof Jutsu>;

/**
 * Bloodline Type. Used for validating a bloodline object is set up properly
 */
const Bloodline = z.object({
  name: z.string(),
  image: z.string(),
  description: z.string(),
  rarity: z.nativeEnum(LetterRank),
  regenIncrease: z.number().int().min(1).max(100),
  village: z.string(),
  effects: z.array(
    z.union([
      AbsorbTag.omit({ minRounds: true, maxRounds: true }).default({}),
      AdjustArmorTag.omit({ minRounds: true, maxRounds: true }).default({}),
      AdjustDamageGivenTag.omit({ minRounds: true, maxRounds: true }).default({}),
      AdjustDamageTakenTag.omit({ minRounds: true, maxRounds: true }).default({}),
      AdjustHealTag.omit({ minRounds: true, maxRounds: true }).default({}),
      AdjustPoolCostTag.omit({ minRounds: true, maxRounds: true }).default({}),
      AdjustStatTag.omit({ minRounds: true, maxRounds: true }).default({}),
      DamageTag.omit({ minRounds: true, maxRounds: true }).default({}),
      HealTag.omit({ minRounds: true, maxRounds: true }).default({}),
      ReflectTag.omit({ minRounds: true, maxRounds: true }).default({}),
      RobPreventTag.omit({ minRounds: true, maxRounds: true }).default({}),
      SealPreventTag.omit({ minRounds: true, maxRounds: true }).default({}),
      StunPreventTag.omit({ minRounds: true, maxRounds: true }).default({}),
    ])
  ),
});
export type ZodBloodlineType = z.infer<typeof Bloodline>;

/**
 * Item Type. Used for validating a item object is set up properly
 */
const Item = z.object({
  name: z.string(),
  image: z.string(),
  description: z.string(),
  canStack: z.boolean().optional(),
  stackSize: z.number().int().min(1).max(100).optional(),
  destroyOnUse: z.boolean().optional(),
  chakraCostPerc: z.number().int().min(1).max(100).optional(),
  staminaCostPerc: z.number().int().min(1).max(100).optional(),
  target: z.nativeEnum(AttackTarget),
  type: z.nativeEnum(ItemType),
  weaponType: z.nativeEnum(WeaponType).optional(),
  rarity: z.nativeEnum(ItemRarity),
  slot: z.nativeEnum(ItemSlot),
  effects: z.array(AllTags),
});
export type ZodItemType = z.infer<typeof Item>;
