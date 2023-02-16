import { PrismaClient } from "@prisma/client";

// Create a new Prisma client
const prisma = new PrismaClient();

// Seed the database
async function main() {
  // Default villages
  const villages = [
    { name: "Konoki", longitude: 35.0, latitude: 35.0, sector: 105 },
    { name: "Shroud", longitude: 40.0, latitude: 40.0, sector: 90 },
    { name: "Silence", longitude: 40.0, latitude: 40.0, sector: 80 },
    { name: "Current", longitude: 40.0, latitude: 40.0, sector: 105 },
    { name: "Horizon", longitude: 40.0, latitude: 40.0, sector: 105 },
    { name: "Samui", longitude: 40.0, latitude: 40.0, sector: 105 },
    { name: "Shine", longitude: 40.0, latitude: 40.0, sector: 105 },
  ];
  for (const village of villages) {
    await prisma.village.upsert({
      where: {
        name: village.name,
      },
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
