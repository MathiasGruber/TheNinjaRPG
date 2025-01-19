import { mysqlTable, varchar, bigint } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  occupation: varchar("occupation", { length: 50 }),
  medical_ninja_exp: bigint("medical_ninja_exp", { mode: "number" }).default(0),
  rank: varchar("rank", { length: 50 }).notNull(),
  villageId: varchar("village_id", { length: 255 }).notNull(),
  curHealth: bigint("cur_health", { mode: "number" }).notNull(),
  maxHealth: bigint("max_health", { mode: "number" }).notNull(),
  curChakra: bigint("cur_chakra", { mode: "number" }).notNull(),
  maxChakra: bigint("max_chakra", { mode: "number" }).notNull(),
  curStamina: bigint("cur_stamina", { mode: "number" }).notNull(),
  maxStamina: bigint("max_stamina", { mode: "number" }).notNull(),
  // ... other user fields
});

export type UserData = {
  id: string;
  userId: string;
  occupation: string | null;
  medical_ninja_exp: number;
  rank: string;
  villageId: string;
  curHealth: number;
  maxHealth: number;
  curChakra: number;
  maxChakra: number;
  curStamina: number;
  maxStamina: number;
  // ... other fields
};
