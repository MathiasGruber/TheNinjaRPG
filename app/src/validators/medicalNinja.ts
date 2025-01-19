import { z } from "zod";
import type {
  MedicalNinjaSquad,
  MedicalNinjaLevel,
  MedicalNinjaRank,
  HealingAction,
} from "~/types/medicalNinja";

export const medicalNinjaSquadSchema = z.object({
  id: z.string(),
  name: z.string().min(3).max(50),
  description: z.string().max(500).optional(),
  leader_id: z.string(),
  village_id: z.string(),
  members: z.array(z.string()),
  created_at: z.date(),
  updated_at: z.date(),
}) satisfies z.ZodType<MedicalNinjaSquad>;

export const createMedicalNinjaSquadSchema = medicalNinjaSquadSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const joinMedicalNinjaSquadSchema = z.object({
  squad_id: z.string(),
});

export const leaveMedicalNinjaSquadSchema = z.object({
  squad_id: z.string(),
});

export const medicalNinjaLevelSchema = z.object({
  level: z.enum(["Trainee", "Medic", "Senior Medic", "Master Medic", "Legendary Medical Nin"]) satisfies z.ZodType<MedicalNinjaRank>,
  exp: z.number(),
  exp_required: z.number(),
}) satisfies z.ZodType<MedicalNinjaLevel>;

export const healingActionSchema = z.object({
  target_id: z.string(),
  amount: z.number(),
  type: z.enum(["health", "chakra", "stamina"]),
}) satisfies z.ZodType<HealingAction>;

export type CreateMedicalNinjaSquad = z.infer<typeof createMedicalNinjaSquadSchema>;
