import { jutsu } from "../schema";
import { sql } from "drizzle-orm";
import { promises as fs } from "fs";
import type { DrizzleClient } from "@/server/db";

// Delete anything not in above list, and insert those missing
export const seedJutsus = async (client: DrizzleClient) => {
  const file = await fs.readFile(process.cwd() + "/data/jutsu.sql", "utf8");
  console.log("\nClearing old jutsus...");
  await client.delete(jutsu);
  console.log("Syncing jutsus...");
  await client.execute(sql.raw(`${file}`));
};
