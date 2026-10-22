import { z } from "zod";

export const mediaHistoryQuerySchema = z.object({
  relationId: z.string().nullish(),
  limit: z.number().int().min(1).max(100).nullish(),
  // Descending history pages resume at the first record omitted by the previous page.
  cursor: z.number().int().positive().nullish(),
});
