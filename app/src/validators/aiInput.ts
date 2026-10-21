import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { ElementNames } from "@/drizzle/constants";
import { userData } from "@/drizzle/schema";
import {
  AllTags,
  SuperRefineEffects,
  SuperRefinePassiveEffects,
} from "@/validators/combat";

export const insertAiSchema = createInsertSchema(userData)
  .omit({
    warMission: true,
    bracketImmunityPausedAt: true,
    homeFurnitureRevision: true,
    occupationSignupAt: true,
    masteryTrainingStartedAt: true,
    currentlyTrainingMastery: true,
    elementalTrainingStartedAt: true,
    currentlyTrainingElement: true,
    deletionAt: true,
    travelFinishAt: true,
    questData: true,
    occupation: true,
    stealthActivatedAt: true,
    stealthCooldownAt: true,
    lastSensoryAt: true,
    covertTrainingType: true,
    covertTrainingStartedAt: true,
    covertTrainingMinutes: true,
  })
  .extend(
    z.object({
      jutsus: z.array(z.string()).optional(),
      items: z
        .array(
          z.object({
            ids: z.array(z.string()).prefault([]),
            number: z.coerce.number(),
          }),
        )
        .optional(),
      primaryElement: z.enum([...ElementNames, ""]).nullish(),
      secondaryElement: z.enum([...ElementNames, ""]).nullish(),
      level: z.coerce.number().min(1).max(200),
      regeneration: z.coerce.number().min(1).max(100),
      offence: z.coerce.number().min(10),
      defence: z.coerce.number().min(10),
      ninjutsuMastery: z.coerce.number().min(10),
      genjutsuMastery: z.coerce.number().min(10),
      taijutsuMastery: z.coerce.number().min(10),
      bukijutsuMastery: z.coerce.number().min(10),
      bloodlineMastery: z.coerce.number().min(10),
      sageMastery: z.coerce.number().min(10),
      statsMultiplier: z.coerce.number().min(1).max(50),
      poolsMultiplier: z.coerce.number().min(1).max(50),
      strength: z.coerce.number().min(10),
      intelligence: z.coerce.number().min(10),
      willpower: z.coerce.number().min(10),
      speed: z.coerce.number().min(10),
      isSummon: z.coerce.boolean(),
      effects: z
        .array(AllTags)
        .superRefine(SuperRefineEffects)
        .superRefine(SuperRefinePassiveEffects),
    }).shape,
  );
export type InsertAiSchema = z.infer<typeof insertAiSchema>;
export type InsertAiSchemaInput = z.input<typeof insertAiSchema>;
