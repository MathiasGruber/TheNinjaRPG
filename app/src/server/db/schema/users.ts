import { mysqlTable, varchar, bigint } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  occupation: varchar("occupation", { length: 50 }),
  medical_ninja_exp: bigint("medical_ninja_exp", { mode: "number" }).default(0),
  // ... other user fields
});
