import { relations } from "drizzle-orm";
import { boolean, integer, json, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { SkillTreeTier } from "~/validators/skillTree";

export const userData = pgTable("user_data", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  level: integer("level").notNull().default(1),
  rank: integer("rank").notNull().default(0),
  prestige: integer("prestige").notNull().default(0),
  reputation: integer("reputation").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const skillTree = pgTable("skill_tree", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  points: integer("points").notNull().default(0),
  resetCount: integer("reset_count").notNull().default(0),
  selectedSkills: json("selected_skills").$type<SkillTreeTier[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const skillTreeRelations = relations(skillTree, ({ one }) => ({
  user: one(userData, {
    fields: [skillTree.userId],
    references: [userData.userId],
  }),
}));
