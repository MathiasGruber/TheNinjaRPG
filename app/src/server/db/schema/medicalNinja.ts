import { mysqlTable, varchar, text, timestamp } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { villages } from "./villages";

export type MedicalNinjaRank =
  | "Trainee"
  | "Medic"
  | "Senior Medic"
  | "Master Medic"
  | "Legendary Medical Nin";

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

export const medicalNinjaSquads = mysqlTable("medical_ninja_squads", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  description: text("description"),
  leader_id: varchar("leader_id", { length: 255 })
    .notNull()
    .references(() => users.id),
  village_id: varchar("village_id", { length: 255 })
    .notNull()
    .references(() => villages.id),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const medicalNinjaSquadMembers = mysqlTable("medical_ninja_squad_members", {
  squad_id: varchar("squad_id", { length: 255 })
    .notNull()
    .references(() => medicalNinjaSquads.id, { onDelete: "cascade" }),
  user_id: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  joined_at: timestamp("joined_at").notNull().defaultNow(),
});
