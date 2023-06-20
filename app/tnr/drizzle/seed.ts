import "dotenv/config";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import { connect } from "@planetscale/database";
import { seedVillages } from "./seeds/village";
import { seedForum } from "./seeds/forum";
import { seedJutsus } from "./seeds/jutsu";
import { seedBloodlines } from "./seeds/bloodline";
import { seedItems } from "./seeds/items";
import { seedAI } from "./seeds/ai";
import * as schema from "./schema";

// Create a new database client
const client = drizzle(
  connect({
    host: process.env["DATABASE_HOST"],
    username: process.env["DATABASE_USERNAME"],
    password: process.env["DATABASE_PASSWORD"],
  }),
  { schema } //, logger: true
);

// Seed the database
async function main() {
  await seedJutsus(client);
  await seedBloodlines(client);
  await seedItems(client);
  await seedVillages(client);
  await seedForum(client);
  await seedAI(client);
}

// Run the seeding & close databse connection
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
