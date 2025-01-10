import { sql } from "drizzle-orm";
import { promises as fs } from "fs";
import type { DrizzleClient } from "@/server/db";

export const seedAssets = async (client: DrizzleClient) => {
  const promises: Promise<void>[] = [];
  console.log("\nSyncing assets...");
  const assetData = await fs.readFile(process.cwd() + "/data/assets.sql", "utf8");
  for (const statement of assetData.split(";")) {
    if (statement.trim()) {
      await client.execute(sql.raw(`${statement.trim()};`));
    }
  }

  // Process all the stuff
  await Promise.all(promises).then(() => {
    console.log("Done syncing assets!");
  });
};
