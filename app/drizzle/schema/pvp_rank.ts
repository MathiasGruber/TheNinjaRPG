import { integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rankEnum = pgEnum("rank", ["Wood", "Adept", "Master", "Legend", "Sannin"]);

export const pvpRankTable = pgTable("pvp_rank", {
  userId: text("user_id").primaryKey(),
  rank: rankEnum("rank").default("Wood").notNull(),
  lp: integer("lp").default(150).notNull(),
  winStreak: integer("win_streak").default(0).notNull(),
  lastMatchDate: timestamp("last_match_date").defaultNow(),
  isQueued: integer("is_queued").default(0).notNull(),
});

export const pvpLoadoutTable = pgTable("pvp_loadout", {
  userId: text("user_id").primaryKey(),
  jutsu: text("jutsu").array().$type<string[]>(),
  weapons: text("weapons").array().$type<string[]>(),
  consumables: text("consumables").array().$type<string[]>(),
});
