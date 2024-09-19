import { quest } from "@/drizzle/schema";
import { sql } from "drizzle-orm";
import { promises as fs } from "fs";
import type { DrizzleClient } from "@/server/db";

// Delete anything not in above list, and insert those missing
export const seedQuests = async (client: DrizzleClient) => {
  const file = await fs.readFile(process.cwd() + "/data/quests.sql", "utf8");
  console.log("\nClearing old quests...");
  await client.delete(quest);
  console.log("Syncing quests...");
  await client.execute(sql.raw(`${file}`));
};
