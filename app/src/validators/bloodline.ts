import { z } from "zod";
import { statFilters } from "@/libs/train";
import { LetterRanks } from "@/drizzle/constants";
import { StatTypes } from "@/drizzle/constants";

export const bloodlineFilteringSchema = z.object({
  name: z.string().min(0).max(256).optional(),
  classification: z.enum(StatTypes).optional(),
  village: z.string().optional(),
  stat: z.array(z.enum(statFilters)).optional(),
  effect: z.array(z.string()).optional(),
  rank: z.enum(LetterRanks).optional(),
  element: z.array(z.string()).optional(),
  hidden: z.boolean().optional(),
});

export type BloodlineFilteringSchema = z.infer<typeof bloodlineFilteringSchema>;
