import { z } from "zod";
import { OBJECTIVE_WAR_DEFAULTS, WAR_ALLY_OFFER_MIN } from "@/drizzle/constants";

export const createAllianceOfferSchema = (maxTokens: number) =>
  z.object({
    amount: z.coerce.number().int().positive().min(WAR_ALLY_OFFER_MIN).max(maxTokens),
  });

export type AllianceOfferSchemaInput = z.input<
  ReturnType<typeof createAllianceOfferSchema>
>;
export type AllianceOfferSchema = z.infer<ReturnType<typeof createAllianceOfferSchema>>;

/** Frozen recipients and delivery receipts for a completed war. */
export type WarSettlement = {
  villageIds: string[];
  winningVillageIds: string[];
  warIds: string[];
  notificationContent: string;
  /** Epoch milliseconds captured by the terminal write; absent on older receipts. */
  cleanupCutoff?: number;
  boostsDelivered: boolean;
  structuresDelivered: boolean;
  notified: boolean;
};

export const declareVillageWarSchema = z.object({
  targetVillageId: z.string(),
  targetStructureRoute: z.string(),
  userVillageId: z.string(),
});

export const raidOptionsSchema = z.object({
  userVillageId: z.string(),
  targetVillageId: z.string(),
});

const positiveRule = z.number().int().min(1).max(100000000);
const roleRule = z.number().int().min(0).max(10000);
export const warRulesSchema = z.object({
  enabled: z.boolean(),
  townhallHp: positiveRule,
  shrineHp: positiveRule.max(30000),
  declarationCost: positiveRule,
  noticeHours: positiveRule.max(168),
  durationDays: positiveRule.max(30),
  dailyDecay: roleRule,
  guardianDamage: roleRule,
  objectiveDamage: roleRule,
  campDamage: roleRule,
  regularDamage: roleRule,
  regularRecovery: roleRule,
  anbuDamage: roleRule,
  anbuRecovery: roleRule,
  assassinDamage: roleRule,
  assassinRecovery: roleRule,
  elderDamage: roleRule,
  elderRecovery: roleRule,
  coleaderDamage: roleRule,
  coleaderRecovery: roleRule,
  leaderDamage: roleRule,
  leaderRecovery: roleRule,
});
export type WarRules = z.infer<typeof warRulesSchema>;
export const defaultWarRules: WarRules = { ...OBJECTIVE_WAR_DEFAULTS };
export type WarObjectiveState = {
  sector: number;
  villageId: string;
  hp: number;
  maxHp: number;
  isReserve: boolean;
  destroyed: boolean;
};
export type ObjectiveWarState = {
  objectives: WarObjectiveState[];
  attackerEspionage: number;
  defenderEspionage: number;
};
export type WarMissionAttempt = {
  id: string;
  warId: string;
  questId: string;
  objectiveId: string;
  sideVillageId: string;
  villageId: string;
  sector: number;
  task: "espionage" | "sabotage";
  value: number;
  endsAt: string;
};
export const warIdSchema = z.object({ warId: z.string().min(1) });
export const startWarMissionSchema = warIdSchema.extend({
  questId: z.string().min(1),
  objectiveId: z.string().min(1),
});
export const completeWarMissionSchema = z.object({ attemptId: z.string().min(1) });
export const warCampSchema = z.object({ campId: z.string().min(1) });
