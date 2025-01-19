export type MedicalNinjaRank =
  | "Trainee"
  | "Medic"
  | "Senior Medic"
  | "Master Medic"
  | "Legendary Medical Nin";

export interface MedicalNinjaSquad {
  id: string;
  name: string;
  description?: string;
  leader_id: string;
  village_id: string;
  members: string[];
  created_at: Date;
  updated_at: Date;
}

export interface MedicalNinjaLevel {
  level: MedicalNinjaRank;
  exp: number;
  exp_required: number;
}

export interface HealingAction {
  target_id: string;
  amount: number;
  type: "health" | "chakra" | "stamina";
}
