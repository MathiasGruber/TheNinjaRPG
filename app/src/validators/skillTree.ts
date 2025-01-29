import { z } from "zod";

export const skillTreeTierSchema = z.object({
  tier: z.number().min(1).max(3),
  cost: z.number().min(1).max(5),
  boost: z.number(),
  name: z.string(),
  type: z.enum([
    "NINJUTSU_DAMAGE",
    "TAIJUTSU_DAMAGE",
    "BUKIJUTSU_DAMAGE",
    "GENJUTSU_DAMAGE",
    "ALL_DEFENSE",
    "REGEN",
    "ELEMENTAL_DAMAGE",
    "ELEMENTAL_DEFENSE",
    "MOVEMENT_RANGE",
    "HEALING",
    "ELEMENT_SLOT",
    "STUN_RESISTANCE",
    "ABSORB",
    "REFLECT",
    "LIFE_STEAL",
    "SEAL_PREVENT",
  ]),
  isSpecial: z.boolean().default(false),
});

export const skillTreeSchema = z.object({
  userId: z.string(),
  points: z.number().min(0).max(25), // 20 base + 5 from prestige
  resetCount: z.number().min(0),
  selectedSkills: z.array(skillTreeTierSchema),
});

export type SkillTreeTier = z.infer<typeof skillTreeTierSchema>;
export type SkillTree = z.infer<typeof skillTreeSchema>;
