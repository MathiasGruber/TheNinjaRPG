import { z } from "zod";
import { UserRank } from "@prisma/client/edge";
import { AttackTarget } from "@prisma/client/edge";
import { LetterRank } from "@prisma/client/edge";
import { JutsuType } from "@prisma/client/edge";
import { ItemType } from "@prisma/client/edge";
import { WeaponType } from "@prisma/client/edge";
import { ItemRarity } from "@prisma/client/edge";
import { ItemSlot } from "@prisma/client/edge";

const Element = ["Fire", "Water", "Wind", "Earth", "Lightning", "None"] as const;
const StatType = ["Highest", "Ninjutsu", "Genjutsu", "Taijutsu", "Bukijutsu"] as const;
const GeneralType = ["Strength", "Intelligence", "Willpower", "Speed"] as const;
const PoolType = ["Health", "Chakra", "Stamina"] as const;

/**
 * Convenience method for a string with a default value
 */
const msg = (defaultString: string) => {
  return z.string().default(defaultString).optional();
};

/**
 * Battle Descriptions use the following variables:
 * %user - the name of the one who is affected by the effect
 * %target - the name of the one who is affected by the effect
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
  timing: z.enum(["now", "next"]),
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
  power: z.number().min(1),
  calculation: z.enum(["formula", "static", "percentage"]),
  statTypes: z.array(z.enum(StatType)).optional(),
  generalTypes: z.array(z.enum(GeneralType)).optional(),
  elements: z.array(z.enum(Element)).optional(),
});

const ChanceBased = z.object({
  chance: z.number().int().min(1).max(100).default(0).optional(),
});

const CanBeAOE = z.object({
  aoe: z.boolean().default(false).optional(),
  aoeRange: z.number().int().min(1).max(5).default(1).optional(),
});

/******************** */
/*******  TAGS  *******/
/******************** */
const AbsorbTag = z
  .object({
    type: z.literal("absorb"),
    description: msg("Absorb damage taken"),
    battleEffect: msg("%target absorbs %amount of the damage"),
    elementalOnly: z.boolean().default(false).optional(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

const AdjustArmorTag = z
  .object({
    type: z.literal("armoradjust"),
    description: msg("Adjust armor rating of target"),
    battleEffect: msg("%target armor rating is %changetype by %amount"),
    adjustUp: z.boolean(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

const AdjustDamageGivenTag = z
  .object({
    type: z.literal("damangegivenadjust"),
    description: msg("Adjust damage given by target"),
    battleEffect: msg("Damage given by %target is %changetype for %rounds rounds"),
    adjustUp: z.boolean(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

const AdjustDamageTakenTag = z
  .object({
    type: z.literal("damangetakenadjust"),
    description: msg("Adjust damage taken of target"),
    battleEffect: msg("Damage sustained by %target is %changetype for %rounds rounds"),
    adjustUp: z.boolean(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

const AdjustHealTag = z
  .object({
    type: z.literal("healadjust"),
    description: msg("Adjust healing ability of target"),
    battleEffect: msg("%target healing ability is %changetype by %amount"),
    adjustUp: z.boolean(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

const AdjustPoolCostTag = z
  .object({
    type: z.literal("poolcostadjust"),
    description: msg("Adjust cost of using jutsu"),
    battleEffect: msg(
      "The %affected cost for %target using jutsu is %changetype by %amount"
    ),
    adjustUp: z.boolean(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

const AdjustStatTag = z
  .object({
    type: z.literal("statadjust"),
    description: msg("Adjust stats of target"),
    battleEffect: msg("%target's %affected are %changetype by %amount"),
    affectedStats: z.array(z.enum(StatType)).optional(),
    affectedGenerals: z.array(z.enum(GeneralType)).optional(),
    adjustUp: z.boolean(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

const ClearTag = z
  .object({
    type: z.literal("clear"),
    description: msg("Clears all effects from the target"),
    battleEffect: msg("%target is now clear of all effects"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

const DamageTag = z
  .object({
    type: z.literal("damage"),
    description: msg("Deals damage to target"),
    battleEffect: msg("%target takes %amount damage"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength)
  .merge(CanBeAOE);

const FleeTag = z
  .object({
    type: z.literal("flee"),
    description: msg("Flee the battle"),
    battleEffect: msg("%target flees the battle"),
  })
  .merge(BaseAttributes)
  .merge(ChanceBased);

const FleePreventTag = z
  .object({
    type: z.literal("fleeprevent"),
    description: msg("Prevents fleeing"),
    battleEffect: msg("%target is cannot be stunned for %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased)
  .merge(CanBeAOE);

const HealTag = z
  .object({
    type: z.literal("heal"),
    description: msg("Heals the target"),
    battleEffect: msg("%target heals $amount %affected"),
  })
  .merge(BaseAttributes)
  .merge(PoolAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength)
  .merge(CanBeAOE);

const OneHitKillTag = z
  .object({
    type: z.literal("onehitkill"),
    description: msg("Instantly kills the target"),
    battleEffect: msg("%target is killed"),
  })
  .merge(BaseAttributes)
  .merge(ChanceBased);

const OneHitKillPreventTag = z
  .object({
    type: z.literal("onehitkillprevent"),
    description: msg("Prevents instant kill effects"),
    battleEffect: msg(
      "%target is now immune to instant kill effects for %rounds rounds"
    ),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

const ReflectTag = z
  .object({
    type: z.literal("reflect"),
    description: msg("Reflect damage taken"),
    battleEffect: msg("%target reflects %amount of the damage to %attacker"),
    elementalOnly: z.boolean().default(false).optional(),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(StatsBasedStrength);

const RobPreventTag = z
  .object({
    type: z.literal("robprevent"),
    description: msg("Prevents robbing of the target"),
    battleEffect: msg("%target can not be robbed for %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

const RobTag = z
  .object({
    type: z.literal("rob"),
    description: msg("Robs money from the target"),
    battleEffect: msg("%user steals %amount ryo from %target"),
  })
  .merge(BaseAttributes)
  .merge(StatsBasedStrength);

const SealPreventTag = z
  .object({
    type: z.literal("sealprevent"),
    description: msg("Prevents bloodline from being sealed"),
    battleEffect: msg("%target's bloodline cannot be sealed for %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased)
  .merge(CanBeAOE);

const SealTag = z
  .object({
    type: z.literal("seal"),
    description: msg("Seals the target's bloodline effects"),
    battleEffect: msg("%target's bloodline is sealed for the following %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased)
  .merge(CanBeAOE);

const StunPreventTag = z
  .object({
    type: z.literal("stunprevent"),
    description: msg("Prevents being stunned"),
    battleEffect: msg("%target cannot be stunned for %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased)
  .merge(CanBeAOE);

const StunTag = z
  .object({
    type: z.literal("stun"),
    description: msg("Stuns the target"),
    battleEffect: msg("%target is stunned for the following %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased)
  .merge(CanBeAOE);

const SummonPreventTag = z
  .object({
    type: z.literal("summonprevent"),
    description: msg("Prevents summoning"),
    battleEffect: msg("%target is now prevented from summoning for %rounds rounds"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

const SummonTag = z
  .object({
    type: z.literal("summon"),
    description: msg("Summon an ally"),
    battleEffect: msg("%user summons %target to the battlefield"),
  })
  .merge(BaseAttributes)
  .merge(MultipleRounds)
  .merge(ChanceBased);

const AllTags = z.union([
  AbsorbTag,
  AdjustArmorTag,
  AdjustDamageGivenTag,
  AdjustDamageTakenTag,
  AdjustHealTag,
  AdjustPoolCostTag,
  AdjustStatTag,
  ClearTag,
  DamageTag,
  FleeTag,
  FleePreventTag,
  HealTag,
  OneHitKillPreventTag,
  OneHitKillTag,
  ReflectTag,
  RobPreventTag,
  RobTag,
  SealPreventTag,
  SealTag,
  StunPreventTag,
  StunTag,
  SummonPreventTag,
  SummonTag,
]);

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
      AbsorbTag.omit({ minRounds: true, maxRounds: true }),
      AdjustArmorTag.omit({ minRounds: true, maxRounds: true }),
      AdjustDamageGivenTag.omit({ minRounds: true, maxRounds: true }),
      AdjustDamageTakenTag.omit({ minRounds: true, maxRounds: true }),
      AdjustHealTag.omit({ minRounds: true, maxRounds: true }),
      AdjustPoolCostTag.omit({ minRounds: true, maxRounds: true }),
      AdjustStatTag.omit({ minRounds: true, maxRounds: true }),
      DamageTag.omit({ minRounds: true, maxRounds: true }),
      HealTag.omit({ minRounds: true, maxRounds: true }),
      ReflectTag.omit({ minRounds: true, maxRounds: true }),
      RobPreventTag.omit({ minRounds: true, maxRounds: true }),
      SealPreventTag.omit({ minRounds: true, maxRounds: true }),
      StunPreventTag.omit({ minRounds: true, maxRounds: true }),
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
