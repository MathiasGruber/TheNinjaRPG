import { z } from "zod";
import { ENCOUNTER_MAX_WAVE_DELAY_ROUNDS } from "@/drizzle/constants";

/** Shared roster contract; activity progress and personal reward receipts live separately. */
export const coopRosterSchema = z.object({
  memberIds: z.array(z.string()),
  invitedIds: z.array(z.string()),
  readyIds: z.array(z.string()),
});
/** Enemy template occurrences and the minimum rounds elapsed since the previous wave began. */
export const encounterWaveSchema = z.object({
  aiIds: z.array(z.string().min(1)).min(1),
  delayRounds: z.number().int().min(0).max(ENCOUNTER_MAX_WAVE_DELAY_ROUNDS).prefault(0),
});
/** Shared member, invitation and readiness IDs; activity adapters enforce their policy. */
export type CoopRoster = z.infer<typeof coopRosterSchema>;
/** Authored wave consumed by server initiation, preserving repeated enemy template IDs. */
export type EncounterWave = z.infer<typeof encounterWaveSchema>;
