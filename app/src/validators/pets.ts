import { z } from "zod";
import { AI_PROFILE_MAX_RULES, PetSpawnPositions } from "@/drizzle/constants";
import {
  PET_AURAS,
  PET_CHARACTERISTICS,
  PET_PALETTES,
  PET_SPECIES,
} from "@/libs/pets/catalogue";
import { AiRule } from "@/validators/ai";
import { createStatSchema } from "@/validators/combat";

export const petNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine(
    (name) => !/[\p{Cc}\p{Cf}]/u.test(name),
    "Pet names cannot contain control characters.",
  );

export const acquirePetSchema = z.object({
  name: petNameSchema,
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  speciesIndex: z
    .number()
    .int()
    .min(0)
    .max(PET_SPECIES.length - 1),
  paletteIndex: z
    .number()
    .int()
    .min(0)
    .max(PET_PALETTES.length - 1),
  characteristicIndex: z
    .number()
    .int()
    .min(0)
    .max(PET_CHARACTERISTICS.length - 1),
  auraIndex: z
    .number()
    .int()
    .min(0)
    .max(PET_AURAS.length - 1),
});

export const updatePetSchema = z
  .object({
    name: petNameSchema.optional(),
    battleEnabled: z.boolean().optional(),
    spawnPosition: z.enum(PetSpawnPositions).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Choose a setting to update.");

/** Reuse the player allocation form's six combat stats; pets do not earn discipline masteries. */
export const assignPetExperienceSchema = createStatSchema(0, 0).schema;

/** Visual quality is separate from the generated image's content-safety verdict. */
export const petAppearanceQualitySchema = z.object({
  singleAnimal: z.boolean(),
  anatomyCorrect: z.boolean(),
  speciesMatches: z.boolean(),
  completeBody: z.boolean(),
  noGroundOrScene: z.boolean(),
  identityPreserved: z.boolean(),
  reason: z.string().min(1).max(600),
});

export const PET_AI_ACTION_TYPES = [
  "move_towards_opponent",
  "end_turn",
  "use_highest_power_action",
] as const;
export const PET_AI_EFFECT_TYPES = [
  "damage",
  "heal",
  "increasedamagegiven",
  "decreasedamagetaken",
  "cleanse",
  "clear",
  "move",
] as const;

export const updatePetAiSchema = z
  .object({
    rules: z.array(AiRule).max(AI_PROFILE_MAX_RULES),
    includeDefaultRules: z.boolean(),
  })
  .superRefine(({ rules }, ctx) => {
    rules.forEach((rule, index) => {
      const action = rule.action;
      if (!PET_AI_ACTION_TYPES.some((type) => type === action.type)) {
        ctx.addIssue({
          code: "custom",
          path: ["rules", index, "action"],
          message: "Pets can use basic battle actions only.",
        });
      }
      if (
        action.type === "use_highest_power_action" &&
        !PET_AI_EFFECT_TYPES.some((effect) => effect === action.effect)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["rules", index, "action", "effect"],
          message: "Choose an effect available to pets.",
        });
      }
    });
  });
