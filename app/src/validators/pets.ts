import { z } from "zod";
import {
  AI_PROFILE_MAX_RULES,
  PET_MAX_ABILITY_SLOTS,
  PetSpawnPositions,
} from "@/drizzle/constants";
import {
  PET_AURAS,
  PET_CHARACTERISTICS,
  PET_PALETTES,
  PET_SPECIES,
} from "@/libs/pets/catalogue";
import { AiRule } from "@/validators/ai";
import { baseServerResponse } from "@/validators/base";
import { createStatSchema } from "@/validators/combat";

export const petSelectionSchema = z.object({ petId: z.string().min(1).max(191) });
export const petAcquisitionResponseSchema = baseServerResponse.extend({
  petId: z.string().optional(),
});
export const feedPetSchema = petSelectionSchema.extend({
  userItemId: z.string().min(1).max(191),
  expectedQuantity: z.number().int().positive(),
});
export const updatePetAbilitiesSchema = petSelectionSchema.extend({
  jutsuIds: z.array(z.string().min(1).max(191)).max(PET_MAX_ABILITY_SLOTS),
  skillIds: z.array(z.string().min(1).max(191)).max(PET_MAX_ABILITY_SLOTS),
});

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
    petId: petSelectionSchema.shape.petId,
    name: petNameSchema.optional(),
    battleEnabled: z.boolean().optional(),
    spawnPosition: z.enum(PetSpawnPositions).optional(),
  })
  .refine((input) => Object.keys(input).length > 1, "Choose a setting to update.");

/** Reuse the player allocation form's six combat stats; pets do not earn discipline masteries. */
export const assignPetExperienceSchema = createStatSchema(0, 0).schema.extend(
  petSelectionSchema.shape,
);

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
  "shield",
  "increasestat",
  "decreasestat",
  "increasedamagegiven",
  "decreasedamagegiven",
  "increasedamagetaken",
  "decreasedamagetaken",
  "cleanse",
  "clear",
  "move",
] as const;

export const updatePetAiSchema = z
  .object({
    petId: petSelectionSchema.shape.petId,
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
          message: "Choose a supported pet AI action.",
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
