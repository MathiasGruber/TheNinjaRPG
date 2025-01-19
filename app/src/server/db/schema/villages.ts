import { mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const villages = mysqlTable("villages", {
  id: varchar("id", { length: 255 }).primaryKey(),
  // ... other village fields
});
