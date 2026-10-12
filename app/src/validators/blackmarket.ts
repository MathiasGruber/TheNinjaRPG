import { z } from "zod";

/** Selects a stored innate slot; the mutation checks whether it can be rerolled. */
export const rerollElementSchema = z.object({
  elementType: z.enum(["primary", "secondary"]),
});
