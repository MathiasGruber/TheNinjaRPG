import { type PrismaClient } from "@prisma/client/edge";
import { UserStatus } from "@prisma/client/edge";
import { UserRank } from "@prisma/client/edge";
import { createId } from "@paralleldrive/cuid2";

export const seedVillages = async (prisma: PrismaClient) => {
  // Default villages
  const villages = [
    { name: "Konoki", sector: 105 },
    { name: "Shroud", sector: 74 },
    { name: "Silence", sector: 297 },
    { name: "Current", sector: 4 },
    { name: "Horizon", sector: 66 },
    { name: "Samui", sector: 116 },
    { name: "Shine", sector: 90 },
  ];
  // Elders
  const elders = [
    { name: "Haruto", gender: "Male", attributes: ["wrinkles", "gray hair"] },
    { name: "Hisame", gender: "Male", attributes: ["wrinkles", "gray hair"] },
    { name: "Raion", gender: "Male", attributes: ["wrinkles", "gray hair"] },
    { name: "Ryouichi", gender: "Male", attributes: ["wrinkles", "gray hair"] },
    { name: "Junko", gender: "Female", attributes: ["wrinkles", "gray hair"] },
    { name: "Kimiko", gender: "Female", attributes: ["wrinkles", "gray hair"] },
    { name: "Yukiko", gender: "Female", attributes: ["wrinkles", "gray hair"] },
  ];
  // Buildings
  const buildings = [
    { name: "Home", image: "/buildings/Home.webp" },
    { name: "Training Grounds", image: "/buildings/Training.webp" },
    { name: "Clan Hall", image: "/buildings/Clan.webp" },
    { name: "Alliance Hall", image: "/buildings/Alliance.webp" },
    { name: "Battle Arena", image: "/buildings/Arena.webp" },
    { name: "Mission Hall", image: "/buildings/Missions.webp" },
    { name: "Bank", image: "/buildings/Bank.webp" },
    { name: "Item shop", image: "/buildings/Shop.webp" },
    { name: "Hospital", image: "/buildings/Hospital.webp" },
    { name: "ANBU", image: "/buildings/ANBU.webp" },
    { name: "Casino", image: "/buildings/Casino.webp" },
    { name: "Black Market", image: "/buildings/BlackMarket.webp" },
  ];
  villages.map(async (village, i) => {
    // Create Village
    const villageData = await prisma.village.upsert({
      where: {
        name: village.name,
      },
      update: village,
      create: village,
    });
    // Buildings
    buildings.map(async (building) => {
      await prisma.villageStructure.upsert({
        where: {
          name_villageId: {
            name: building.name,
            villageId: villageData.id,
          },
        },
        update: building,
        create: { ...building, villageId: villageData.id },
      });
    });
    // Village elders
    const elderId = createId();
    await prisma.userData.upsert({
      where: {
        userId: elderId,
      },
      update: {},
      create: {
        userId: elderId,
        gender: elders[i]?.gender as string,
        username: elders[i]?.name as string,
        villageId: villageData.id,
        rank: UserRank.ELDER,
        isAI: true,
        status: UserStatus.AWAKE,
      },
    });
    elders[i]?.attributes.map(async (attribute) => {
      await prisma.userAttribute.upsert({
        where: {
          attribute_userId: {
            userId: elderId,
            attribute: attribute,
          },
        },
        update: {},
        create: {
          userId: elderId,
          attribute,
        },
      });
    });
    // Village conversation
    await prisma.conversation.upsert({
      where: {
        title: village.name,
      },
      update: {},
      create: {
        title: village.name,
        createdById: elderId,
      },
    });
  });
  // Global conversation
  await prisma.conversation.upsert({
    where: {
      title: "Global",
    },
    update: {},
    create: {
      title: "Global",
    },
  });
};
