import { z } from "zod";
import { UserRank } from "@prisma/client/edge";
import { AttackTarget } from "@prisma/client/edge";
import { LetterRank } from "@prisma/client/edge";
import { JutsuType } from "@prisma/client/edge";
import { WeaponType } from "@prisma/client/edge";

const Element = ["Fire", "Water", "Wind", "Earth", "Lightning", "None"] as const;
const StatType = ["Highest", "Ninjutsu", "Genjutsu", "Taijutsu", "Bukijutsu"] as const;
const GeneralType = ["Strength", "Intelligence", "Willpower", "Speed"] as const;

// For bloodlines: constant effect
// For wearables: constant effect
// All other: round effect
// enum Effect {
//     STUN // Stun target, 1-5 rounds, following round
//     STUN_RESIST // Target becomes immune to stun, 1-5 rounds, immediately
//     FLEE // User attempts flee, 1 round, immediately
//     FLEE_PREVENT // Target is prevented from fleering, 1-5 rounds, following round
//     DAMAGE // Deal damage to target, 1-5 rounds, immediately
//     HEAL // Heal target HP, SP or CP, 1-5 rounds, immediately
//     ABSORB // Target absorbs damage, 1-5 rounds, immediately
//     REFLECT // Target reflects damage, 1-5 rounds, immediately
//     STAT_ADJUST // Adjust stat of target, 1-5 rounds, following round
//     HEAL_ADJUST // Adjust amount target can heal, 1-5 rounds, following round
//     ARMOR_ADJUST // Adjust armor, 1-5 rounds, following round
//     DAMAGE_TAKEN_ADJUST // Adjust Damage taken, 1-5 rounds, following round
//     DAMAGE_GIVEN_ADJUST // Adjust Damage given, 1-5 rounds, following round
//     STAMINA_COST_ADJUST // Adjust stamina cost, 1-5 rounds, following round
//     CHAKRA_COST_ADJUST // Adjust chakra cost, 1-5 rounds, following round
//     SEAL // Seal targets bloodline effects, 1-5 rounds, following round
//     SEAL_PREVENT // Target becomes immune to seal, 1-5 rounds, immediately. (useful for the event team)
//     CLEAR // Clear targets status effects, following round
//     ROB // Rob targets money, immediately
//     ROB_PREVENT  // Target becomes immune to robbery, 1-5 rounds, immediately.
//     SUM // Summons a creature, immediately
//     REGEN // Regenerates HP, SP or CP, 1-5 rounds, following round
//     ONEHITKILL // Takes down the opponent in 1 hit. (useful for the event team)
//     ONEHITKILL_CLEAR // Clears ONEHITKILL effect, immediately. (useful for the event team)
// }

const StunTag = z.object({
  type: z.literal("stun"),
  description: z.string().default("Stuns the target for a number of rounds").optional(),
  minRounds: z.number().int().min(1).max(5).default(1).optional(),
  maxRounds: z.number().int().min(1).max(5).default(1).optional(),
  chance: z.number().int().min(1).max(100).default(0).optional(),
  battleEffect: z
    .function()
    .args(z.object({ username: z.string(), rounds: z.number() }))
    .returns(z.string())
    .default((info) => {
      return `${info.username} is stunned for the following ${info.rounds} rounds`;
    })
    .optional(),
});

const DamageTag = z.object({
  type: z.literal("damage"),
  calculation: z.enum(["static", "percentage"]),
  elements: z.array(z.enum(Element)).optional(),
  statTypes: z.array(z.enum(StatType)).optional(),
  generalTypes: z.array(z.enum(GeneralType)).optional(),
  power: z.number().min(1),
  aoe: z.boolean().default(false).optional(),
  aoeRange: z.number().int().min(1).max(5).default(1).optional(),
  minRounds: z.number().int().min(1).max(5).default(1).optional(),
  maxRounds: z.number().int().min(1).max(5).default(1).optional(),
  description: z.string().default("Deals damage to target").optional(),
  battleEffect: z
    .function()
    .args(z.object({ username: z.string(), damage: z.number() }))
    .returns(z.string())
    .default((info) => {
      return `${info.username} takes ${info.damage} damage`;
    })
    .optional(),
});

const HealTag = z.object({
  type: z.literal("heal"),
  calculation: z.enum(["static", "percentage"]),
  power: z.number().min(1),
  aoe: z.boolean().default(false).optional(),
  aoeRange: z.number().int().min(1).max(5).default(1).optional(),
  rounds: z.number().int().min(1).max(5).default(1).optional(),
  description: z.string().default("Heals the target").optional(),
  battleEffect: z
    .function()
    .args(z.object({ username: z.string(), target: z.string(), heal: z.number() }))
    .returns(z.string())
    .default((info) => {
      return `${info.username} heals ${info.target} for ${info.heal} HP`;
    })
    .optional(),
});

const Jutsu = z.object({
  name: z.string(),
  image: z.string(),
  description: z.string(),
  battleDescription: z.string(),
  jutsuWeapon: z.nativeEnum(WeaponType).optional(),
  jutsuType: z.nativeEnum(JutsuType),
  level: z.nativeEnum(LetterRank),
  requiredRank: z.nativeEnum(UserRank),
  target: z.nativeEnum(AttackTarget),
  range: z.number().int().min(1).max(5),
  cost: z.number().int().min(1).max(100),
  cooldown: z.number().int().min(1).max(300),
  effects: z.array(z.union([HealTag, DamageTag, StunTag])),
});
export type ZodJutsuType = z.infer<typeof Jutsu>;

const Bloodline = z.object({
  name: z.string(),
  image: z.string(),
  description: z.string(),
  rarity: z.nativeEnum(LetterRank),
  regenIncrease: z.number().int().min(1).max(100),
  village: z.string(),
  effects: z.array(z.union([HealTag, DamageTag, StunTag])),
});
export type ZodBloodlineType = z.infer<typeof Bloodline>;
