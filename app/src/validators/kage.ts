import { z } from "zod";
import { KAGE_DEFENSE_MIN_DAYS, KAGE_DEFENSE_WINDOW_HOURS } from "@/drizzle/constants";

export const kageVillageSchema = z.object({ villageId: z.string().min(1) });
export const kageWindowSchema = z.object({
  day: z.number().int().min(0).max(6),
  hour: z
    .number()
    .int()
    .min(0)
    .max(24 - KAGE_DEFENSE_WINDOW_HOURS),
});
export const kageScheduleSchema = kageVillageSchema.extend({
  windows: z
    .array(kageWindowSchema)
    .min(KAGE_DEFENSE_MIN_DAYS)
    .max(7)
    .refine(
      (windows) => new Set(windows.map((w) => w.day)).size === windows.length,
      "Choose different days for each defense window",
    ),
});
export const kageMatchSchema = z.object({ id: z.string().min(1) });
export const kageAiSchema = kageMatchSchema.extend({ consent: z.boolean() });
export const kageJoinSchema = kageVillageSchema.extend({
  aiRequested: z.boolean().default(false),
});
export const kageRemovalSchema = kageVillageSchema.extend({
  reason: z.string().trim().min(10).max(1000),
});
export const kageVoteSchema = z.object({
  voteId: z.string().min(1),
  vote: z.enum(["YES", "NO"]),
});
export const kageNominationSchema = kageVillageSchema.extend({
  voteId: z.string().min(1).optional(),
  userId: z.string().min(1),
});
export const kageBattleResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  battleId: z.string().optional(),
});

export type KageWindow = z.infer<typeof kageWindowSchema>;
export type KageDefenseSchedule = {
  kageId: string;
  tenure: string;
  windows: KageWindow[];
  publishedAt: string | null;
  setupDueAt?: string;
  missedStarts: number;
  paused: boolean;
  observedAt: string;
  vacancy?: { removedUserId: string; reason: string };
};
