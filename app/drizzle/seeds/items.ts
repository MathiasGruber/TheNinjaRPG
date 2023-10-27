import { item } from "../schema";
import { sql } from "drizzle-orm";
import { promises as fs } from "fs";
import type { DrizzleClient } from "@/server/db";

// Delete anything not in above list, and insert those missing
export const seedItems = async (client: DrizzleClient) => {
  const file = await fs.readFile(process.cwd() + "/data/item.sql", "utf8");
  console.log("\nClearing old items...");
  await client.delete(item);
  console.log("Syncing items...");
  await client.execute(sql.raw(`${file}`));
};
