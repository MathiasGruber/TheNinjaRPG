import { z } from "zod";
import { ENCOUNTER_MAX_WAVE_DELAY_ROUNDS } from "@/drizzle/constants";

/** Shared roster contract; activity progress and personal reward receipts live separately. */
export const coopRosterSchema = z.object({
  memberIds: z.array(z.string()),
  invitedIds: z.array(z.string()),
  readyIds: z.array(z.string()),
});
export const encounterWaveSchema = z.object({
  aiIds: z.array(z.string().min(1)).min(1),
  delayRounds: z.number().int().min(0).max(ENCOUNTER_MAX_WAVE_DELAY_ROUNDS).prefault(0),
});
export type CoopRoster = z.infer<typeof coopRosterSchema>;
export type EncounterWave = z.infer<typeof encounterWaveSchema>;
