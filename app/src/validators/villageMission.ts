import { z } from "zod";
import { VILLAGE_MISSION_TASKS } from "@/drizzle/constants";

export const villageMissionActionSchema = z.object({
  villageId: z.string().min(1),
  missionId: z.string().min(1).optional(),
});

export const villageMissionCancelSchema = villageMissionActionSchema.extend({
  missionId: z.string().min(1),
});

export const villageMissionObjectiveSchema = z.object({
  id: z.string().min(1),
  task: z.enum(VILLAGE_MISSION_TASKS),
  description: z.string(),
  value: z.number().int().positive(),
});

export const villageMissionSchema = z.object({
  id: z.string(),
  questId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  rewardTokens: z.number().int().positive(),
  objectives: z.array(villageMissionObjectiveSchema).min(1),
  baseline: z.record(z.string(), z.number()),
  rerolled: z.boolean(),
  startedAt: z.string(),
});
export type VillageMission = z.infer<typeof villageMissionSchema>;

/** Village missions use simultaneous shared counters and one village-token payout. */
export const villageMissionContentError = (
  content: {
    objectives: unknown[];
    reward: { reward_tokens?: number };
    rewardMode?: string;
  },
  consecutiveObjectives: boolean,
) => {
  if (consecutiveObjectives) return "Village mission objectives must be simultaneous";
  if (content.rewardMode === "choose")
    return "Village missions cannot use reward choices";
  if (
    !Number.isSafeInteger(content.reward.reward_tokens) ||
    (content.reward.reward_tokens ?? 0) <= 0
  ) {
    return "Village missions require a positive whole-number token reward";
  }
  if (
    !z.array(villageMissionObjectiveSchema).min(1).safeParse(content.objectives).success
  ) {
    return "Village missions support PvP kills, Siege Operation, Combined Mission Effort, and D–A mission totals with positive whole-number targets";
  }
  const objectives = content.objectives as Array<{
    id: string;
    nextObjectiveId?: string;
    attackers?: unknown[];
  }>;
  if (new Set(objectives.map((o) => o.id)).size !== objectives.length)
    return "Objective IDs must be unique";
  if (objectives.some((o) => o.nextObjectiveId || o.attackers?.length))
    return "Village missions cannot branch or spawn attackers";
  return null;
};

export const villageMaintenancePaymentSchema = z.object({
  villageId: z.string().min(1),
});
export const structureUpgradeSchema = z.object({
  structureId: z.string().min(1),
  villageId: z.string().min(1),
  clanId: z.string().nullish(),
});
