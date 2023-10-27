import { bloodline } from "../schema";
import { sql } from "drizzle-orm";
import { promises as fs } from "fs";
import type { DrizzleClient } from "@/server/db";

// Delete anything not in above list, and insert those missing
export const seedBloodlines = async (client: DrizzleClient) => {
  const file = await fs.readFile(process.cwd() + "/data/bloodline.sql", "utf8");
  console.log("\nClearing old bloodlines...");
  await client.delete(bloodline);
  console.log("Syncing bloodlines...");
  await client.execute(sql.raw(`${file}`));
};
