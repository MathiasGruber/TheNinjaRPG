import { z } from "zod";

export const searchNameSchema = z.object({
  name: z.string().min(0).max(256),
});

export type SearchNameSchema = z.infer<typeof searchNameSchema>;
