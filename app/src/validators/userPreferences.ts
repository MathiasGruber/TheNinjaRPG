import { z } from "zod";

export const offenseTypes = ["ninjutsu", "genjutsu", "taijutsu", "bukijutsu"] as const;
export const generalTypes = ["strength", "intelligence", "willpower", "speed"] as const;

export const updateUserPreferencesSchema = z.object({
  highestOffense: z.enum(offenseTypes).nullable(),
  highestGeneral1: z.enum(generalTypes).nullable(),
  highestGeneral2: z.enum(generalTypes).nullable(),
});

export type UpdateUserPreferencesSchema = z.infer<typeof updateUserPreferencesSchema>;
