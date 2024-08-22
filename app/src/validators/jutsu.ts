import { z } from "zod";
import { animationNames } from "@/libs/combat/types";
import { UserRanks } from "@/drizzle/constants";
import { statFilters } from "@/libs/train";
import { LetterRanks } from "@/drizzle/constants";
import { StatTypes } from "@/drizzle/constants";

export const searchNameSchema = z.object({
  name: z.string().min(0).max(256),
});

export type SearchNameSchema = z.infer<typeof searchNameSchema>;

export const jutsuFilteringSchema = z.object({
  name: z.string().min(0).max(256).optional(),
  bloodline: z.string().optional(),
  rank: z.enum(UserRanks).optional(),
  rarity: z.enum(LetterRanks).optional(),
  appear: z.enum(animationNames).optional(),
  disappear: z.enum(animationNames).optional(),
  static: z.enum(animationNames).optional(),
  classification: z.enum(StatTypes).optional(),
  element: z.array(z.string()).optional(),
  stat: z.array(z.enum(statFilters)).optional(),
  effect: z.array(z.string()).optional(),
});

export type JutsuFilteringSchema = z.infer<typeof jutsuFilteringSchema>;
