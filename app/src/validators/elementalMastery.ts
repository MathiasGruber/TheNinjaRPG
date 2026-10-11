import { z } from "zod";
import { BasicElementName } from "@/drizzle/constants";

export const selectTrainedElementSchema = z.object({
  element: z.enum(BasicElementName).nullable(),
});
