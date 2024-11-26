import { z } from "zod";

// Define the DailyReset schema
export const dailyResetSchema = z.object({
  id: z.string().uuid().optional(), // Optional for creation, required for identification
  resetType: z.enum(["daily-bank", "daily-counters", "daily-pvp", "daily-quest"]),
  scheduledDate: z.string().datetime({ offset: true }),
  executedDate: z.string().datetime({ offset: true }).nullable(),
  status: z.enum(["pending", "completed", "failed"]).default("pending"),
  lastChecked: z.string().datetime({ offset: true }).optional(),
  errorLog: z.string().optional(),
  isManualOverride: z.boolean().default(false),
  retryCount: z.number().nonnegative().default(0),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

export type DailyResetSchema = z.infer<typeof dailyResetSchema>;

// Define a schema for creating a new reset entry
export const dailyResetCreateSchema = dailyResetSchema.omit({
  id: true,
  executedDate: true,
  createdAt: true,
  updatedAt: true,
});

// Define a schema for updating an existing reset entry
export const dailyResetUpdateSchema = dailyResetSchema.partial().extend({
  id: z.string().uuid(),
});

export type DailyResetCreateSchema = z.infer<typeof dailyResetCreateSchema>;
export type DailyResetUpdateSchema = z.infer<typeof dailyResetUpdateSchema>;
