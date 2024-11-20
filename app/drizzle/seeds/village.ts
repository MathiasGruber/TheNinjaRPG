import { sql } from "drizzle-orm";
import { promises as fs } from "fs";
import type { DrizzleClient } from "@/server/db";

export const seedVillages = async (client: DrizzleClient) => {
  const promises: Promise<void>[] = [];
  console.log("\nSyncing villages...");
  const villageData = await fs.readFile(process.cwd() + "/data/villages.sql", "utf8");
  for (const statement of villageData.split(";")) {
    if (statement.trim()) {
      await client.execute(sql.raw(`${statement.trim()};`));
    }
  }

  // Process all the stuff
  await Promise.all(promises).then(() => {
    console.log("Done syncing villages!");
  });
};
