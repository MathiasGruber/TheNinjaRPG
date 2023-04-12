import { z } from "zod";

// enum Effect {
//     STUN // User is stunned
//     STUN_RESIST // User is immune to stun
//     FLEE_PREVENT // User cannot flee
//     DAMAGE // User takes damage every turn
//     HEAL // User heals every turn
//     ABSORB // User absorbs damage
//     REFLECT // User reflects damage
//     STAT_ADJUST // User has a stat adjustment
//     HEAL_ADJUST // The amount the user can heal is adjusted
//     ARMOR_ADJUST // Armor is adjusted
//     DAMAGE_TAKEN_ADJUST // Damage taken is adjusted
//     DAMAGE_GIVEN_ADJUST // Damage given is adjusted
//     STAMINA_COST_ADJUST // Stamina cost is adjusted
//     CHAKRA_COST_ADJUST // Chakra cost is adjusted
// }

const StunTag = z.object({
  type: z.literal("stun"),
  rounds: z.number().int().min(1).max(5),
  description: z.string().default("Stuns the target for a number of rounds").optional(),
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
  power: z.number().min(1),
  aoe: z.boolean().default(false).optional(),
  aoeRange: z.number().int().min(1).max(5).default(1).optional(),
  rounds: z.number().int().min(1).max(5).default(1).optional(),
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
  rank: z.string(),
  type: z.string(),
  element: z.string(),
  description: z.string(),
  effects: z.array(z.union([HealTag, DamageTag, StunTag])),
});
export type JutsuType = z.infer<typeof Jutsu>;
