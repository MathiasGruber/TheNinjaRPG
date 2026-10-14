import { item } from "@/drizzle/schema";
import { sql } from "drizzle-orm";
import { promises as fs } from "fs";
import type { DrizzleClient } from "@/server/db";

/** Reloads the Item catalogue from its checked-in SQL content dump. */
export const seedItems = async (client: DrizzleClient) => {
  const file = await fs.readFile(process.cwd() + "/data/item.sql", "utf8");
  console.log("\nClearing old items...");
  await client.delete(item);
  console.log("Syncing items...");
  for (const statement of file.split(");")) {
    if (statement.trim()) {
      await client.execute(sql.raw(`${statement.trim()});`));
    }
  }
};
