import { z } from "zod";
import { UserRanks } from "@/drizzle/constants";
import { statFilters } from "@/libs/train";
import { LetterRanks } from "@/drizzle/constants";
import { StatTypes } from "@/drizzle/constants";
import { AttackMethods } from "@/drizzle/constants";
import { AttackTargets } from "@/drizzle/constants";

// Basic name/level search
export const searchJutsuSchema = z.object({
  name: z.string().min(0).max(256),
  requiredLevel: z.number().min(0).max(150).optional(),
});
export type SearchJutsuSchema = z.infer<typeof searchJutsuSchema>;

/**
 * Full filtering schema for jutsu,
 * including both "include" and "exclude" fields.
 */
export const jutsuFilteringSchema = z.object({
  // -----------------
  // "Include" fields
  // -----------------
  appear: z.string().optional(),
  bloodline: z.string().optional(),
  classification: z.enum(StatTypes).optional(),
  disappear: z.string().optional(),
  effect: z.array(z.string()).optional(),
  element: z.array(z.string()).optional(),
  method: z.enum(AttackMethods).optional(),
  name: z.string().min(0).max(256).optional(),
  rank: z.enum(UserRanks).optional(),
  requiredLevel: z.coerce.number().optional(),
  rarity: z.enum(LetterRanks).optional(),
  stat: z.array(z.enum(statFilters)).optional(),
  static: z.string().optional(),
  target: z.enum(AttackTargets).optional(),
  hidden: z.boolean().optional(),

  // ------------------------------
  // "Exclusion" fields
  // ------------------------------
  excludedJutsuTypes: z.array(z.string()).optional(),
  excludedClassifications: z.array(z.string()).optional(),
  excludedRarities: z.array(z.string()).optional(),
  excludedRanks: z.array(z.string()).optional(),
  excludedMethods: z.array(z.string()).optional(),
  excludedTargets: z.array(z.string()).optional(),
  excludedAppear: z.array(z.string()).optional(),
  excludedDisappear: z.array(z.string()).optional(),
  excludedStatic: z.array(z.string()).optional(),
  excludedElements: z.array(z.string()).optional(),
  excludedEffects: z.array(z.string()).optional(),
  excludedStats: z.array(z.string()).optional(),
});

export type JutsuFilteringSchema = z.infer<typeof jutsuFilteringSchema>;
