import { z } from "zod";
import { LOG_TYPES } from "@/drizzle/constants";

export const actionLogSchema = z.object({
  search: z.string().optional(),
  logtype: z.enum(LOG_TYPES),
});

export type ActionLogSchema = z.infer<typeof actionLogSchema>;
