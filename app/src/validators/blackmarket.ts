import { z } from "zod";

export const rerollElementSchema = z.object({
  elementType: z.enum(["primary", "secondary"]),
});
