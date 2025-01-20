import { relations } from "drizzle-orm";
import { int, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { villages } from "./villages";
import type { InferModel } from "drizzle-orm";

export type MedicalNinja = InferModel<typeof medicalNinjas>;
export type MedicalNinjaSquad = InferModel<typeof medicalNinjaSquads>;
export type MedicalNinjaSquadMember = InferModel<typeof medicalNinjaSquadMembers>;

export const medicalNinjaRanks = {
  TRAINEE: "trainee",
  APPRENTICE: "apprentice",
  SKILLED: "skilled",
  EXPERT: "expert",
  MASTER: "master",
  LEGENDARY: "legendary",
} as const;

export const medicalNinjas = mysqlTable("medical_ninjas", {
  userId: varchar("user_id", { length: 255 }).primaryKey().references(() => users.id),
  rank: mysqlEnum("rank", Object.values(medicalNinjaRanks)).notNull().default(medicalNinjaRanks.TRAINEE),
  experience: int("experience").notNull().default(0),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const medicalNinjaSquads = mysqlTable("medical_ninja_squads", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  villageId: varchar("village_id", { length: 255 }).notNull().references(() => villages.id),
  leaderId: varchar("leader_id", { length: 255 }).references(() => users.id),
  coLeaderId: varchar("co_leader_id", { length: 255 }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const medicalNinjaSquadMembers = mysqlTable("medical_ninja_squad_members", {
  squadId: varchar("squad_id", { length: 255 }).notNull().references(() => medicalNinjaSquads.id),
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const medicalNinjasRelations = relations(medicalNinjas, ({ one }) => ({
  user: one(users, {
    fields: [medicalNinjas.userId],
    references: [users.id],
  }),
}));

export const medicalNinjaSquadsRelations = relations(medicalNinjaSquads, ({ one, many }) => ({
  village: one(villages, {
    fields: [medicalNinjaSquads.villageId],
    references: [villages.id],
  }),
  leader: one(users, {
    fields: [medicalNinjaSquads.leaderId],
    references: [users.id],
  }),
  coLeader: one(users, {
    fields: [medicalNinjaSquads.coLeaderId],
    references: [users.id],
  }),
  members: many(medicalNinjaSquadMembers),
}));

export const medicalNinjaSquadMembersRelations = relations(medicalNinjaSquadMembers, ({ one }) => ({
  squad: one(medicalNinjaSquads, {
    fields: [medicalNinjaSquadMembers.squadId],
    references: [medicalNinjaSquads.id],
  }),
  user: one(users, {
    fields: [medicalNinjaSquadMembers.userId],
    references: [users.id],
  }),
}));
