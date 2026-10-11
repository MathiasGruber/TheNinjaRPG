import { z } from "zod";
import { BasicElementName, ELEMENTAL_MASTERY_CAP } from "@/drizzle/constants";

export const investElementalExperienceSchema = z.object({
  element: z.enum(BasicElementName),
  amount: z.number().int().positive().max(ELEMENTAL_MASTERY_CAP),
});
export const selectTrainedElementSchema = z.object({
  element: z.enum(BasicElementName).nullable(),
});
