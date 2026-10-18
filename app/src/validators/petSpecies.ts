import { z } from "zod";
import {
  PET_ABILITY_SLOTS_BY_RARITY,
  PET_MAX_ABILITY_SLOTS,
  PetRarities,
  PetRoles,
  PetSkillTargets,
} from "@/drizzle/constants";
import {
  AllTags,
  SuperRefineEffects,
  SuperRefinePassiveEffects,
} from "@/validators/combat";
import { idSchema } from "@/validators/misc";
import { petAiProfileSchema } from "@/validators/pets";

/** Authored species identity, acquisition rarity and owner-editable starting behavior. */
export const PetSpeciesValidator = z
  .object({
    name: z.string().trim().min(1).max(191),
    description: z.string().trim().min(1).max(1000),
    rarity: z.enum(PetRarities),
    role: z.enum(PetRoles).default("ASSAULT"),
    isActive: z.boolean(),
    defaultJutsuIds: z
      .array(z.string().min(1).max(191))
      .max(PET_MAX_ABILITY_SLOTS)
      .default([]),
    aiRules: petAiProfileSchema.shape.rules.default([]),
    includeDefaultRules: petAiProfileSchema.shape.includeDefaultRules.default(true),
    effects: z
      .array(AllTags)
      .superRefine(SuperRefineEffects)
      .superRefine(SuperRefinePassiveEffects)
      .superRefine((effects, ctx) => {
        // Innate skills have no empty battlefield cell to target with a barrier.
        effects.forEach((effect, index) => {
          if (effect.type === "barrier") {
            ctx.addIssue({
              code: "custom",
              path: [index, "type"],
              message: "Barrier tags require an empty-ground combat action.",
            });
          }
        });
      })
      .default([]),
    skillTarget: z.enum(PetSkillTargets).default("SELF"),
  })
  .superRefine((species, ctx) => {
    if (new Set(species.defaultJutsuIds).size !== species.defaultJutsuIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultJutsuIds"],
        message: "Choose each default pet jutsu only once.",
      });
    }
    if (species.defaultJutsuIds.length > PET_ABILITY_SLOTS_BY_RARITY[species.rarity]) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultJutsuIds"],
        message: "The default loadout exceeds this rarity's jutsu slots.",
      });
    }
  });

/** IDs remain immutable when staff edit species content or retire an offering. */
export const updatePetSpeciesSchema = idSchema.extend({ data: PetSpeciesValidator });

export type ZodPetSpeciesType = z.infer<typeof PetSpeciesValidator>;
export type ZodPetSpeciesInput = z.input<typeof PetSpeciesValidator>;
