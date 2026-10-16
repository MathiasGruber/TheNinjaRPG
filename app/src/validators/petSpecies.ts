import { z } from "zod";
import { PetRarities } from "@/drizzle/constants";
import { idSchema } from "@/validators/misc";

/** Staff-authored visual identity and availability; species never grant combat stats. */
export const PetSpeciesValidator = z.object({
  name: z.string().trim().min(1).max(191),
  description: z.string().trim().min(1).max(1000),
  rarity: z.enum(PetRarities),
  isActive: z.boolean(),
});

/** IDs remain immutable when staff edit species content or retire an offering. */
export const updatePetSpeciesSchema = idSchema.extend({ data: PetSpeciesValidator });

export type ZodPetSpeciesType = z.infer<typeof PetSpeciesValidator>;
