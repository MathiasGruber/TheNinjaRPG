import "dotenv/config";
import { drizzleDB } from "../src/server/db";
import { seedVillages } from "./seeds/village";
import { seedForum } from "./seeds/forum";
// import { seedJutsus } from "./seeds/jutsu";
// import { seedBloodlines } from "./seeds/bloodline";
// import { seedItems } from "./seeds/items";
// import { seedAI } from "./seeds/ai";

// Seed the database
async function main() {
  //await seedJutsus(drizzleDB);
  //await seedBloodlines(drizzleDB);
  //await seedItems(drizzleDB);
  //await seedAI(drizzleDB);
  await seedVillages(drizzleDB);
  await seedForum(drizzleDB);
}

// Run the seeding & close databse connection
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
