import { PrismaClient } from "@prisma/client/edge";
import { seedVillages } from "./seeds/village";
import { seedForum } from "./seeds/forum";
import { seedJutsus } from "./seeds/jutsu";

// Create a new Prisma client
const prisma = new PrismaClient();

// Seed the database
async function main() {
  await seedJutsus(prisma);
  await seedVillages(prisma);
  await seedForum(prisma);
}

// Run the seeding & close databse connection
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
