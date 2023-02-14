import { PrismaClient } from "@prisma/client";

// Create a new Prisma client
const prisma = new PrismaClient();

// Seed the database
async function main() {
  // Default villages
  const villages = [
    { name: "Konoki", longitude: 35.0, latitude: 35.0 },
    { name: "Shroud", longitude: 40.0, latitude: 40.0 },
  ];
  for (const village of villages) {
    await prisma.village.upsert({
      where: { name: village.name },
      update: {},
      create: village,
    });
  }
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
