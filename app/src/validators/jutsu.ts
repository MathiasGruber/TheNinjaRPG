import { z } from "zod";
import { animationNames } from "@/libs/combat/types";
import { UserRanks } from "@/drizzle/constants";
import { statFilters } from "@/libs/train";
import { LetterRanks } from "@/drizzle/constants";
import { StatTypes } from "@/drizzle/constants";
import { AttackMethods } from "@/drizzle/constants";
import { AttackTargets } from "@/drizzle/constants";

export const searchJutsuSchema = z.object({
  name: z.string().min(0).max(256),
  requiredLevel: z.number().min(0).max(150).optional(),
});

export type SearchJutsuSchema = z.infer<typeof searchJutsuSchema>;

export const jutsuFilteringSchema = z.object({
  appear: z.enum(animationNames).optional(),
  bloodline: z.string().optional(),
  classification: z.enum(StatTypes).optional(),
  disappear: z.enum(animationNames).optional(),
  effect: z.array(z.string()).optional(),
  element: z.array(z.string()).optional(),
  method: z.enum(AttackMethods).optional(),
  name: z.string().min(0).max(256).optional(),
  rank: z.enum(UserRanks).optional(),
  requiredLevel: z.coerce.number().min(0).max(150).optional(),
  rarity: z.enum(LetterRanks).optional(),
  stat: z.array(z.enum(statFilters)).optional(),
  static: z.enum(animationNames).optional(),
  target: z.enum(AttackTargets).optional(),
  hidden: z.boolean().optional(),
});

export type JutsuFilteringSchema = z.infer<typeof jutsuFilteringSchema>;
