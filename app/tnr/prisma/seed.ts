import { PrismaClient } from "@prisma/client/edge";
import { UserStatus } from "@prisma/client/edge";

// Create a new Prisma client
const prisma = new PrismaClient();

// Seed the database
async function main() {
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
    const elderUser = await prisma.user.upsert({
      where: {
        email: village.name + "@tnr.com",
      },
      update: {},
      create: {
        email: village.name + "@tnr.com",
      },
    });
    await prisma.userData.upsert({
      where: {
        userId: elderUser.id,
      },
      update: {},
      create: {
        userId: elderUser.id,
        gender: elders[i]?.gender as string,
        username: elders[i]?.name as string,
        villageId: villageData.id,
        rank: "Elder GPT",
        status: UserStatus.AWAKE,
      },
    });
    elders[i]?.attributes.map(async (attribute) => {
      await prisma.userAttribute.upsert({
        where: {
          attribute_userId: {
            userId: elderUser.id,
            attribute: attribute,
          },
        },
        update: {},
        create: {
          userId: elderUser.id,
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
        createdById: elderUser.id,
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
  // Forum setup
  const boards = [
    {
      name: "News",
      summary:
        "Keep an eye out for announcements, contests, and important updates here.",
      group: "Main Broadcast:General boards for TNR",
    },
    {
      name: "Questions & Answers",
      summary:
        "Check here if you have a question about the game or are in need of information. ",
      group: "Main Broadcast:General boards for TNR",
    },
    {
      name: "Shinobi University",
      summary:
        "Seichi's center for learning, it is the location of the Shinobi Academy for all villages, the Esakanki Medical Hospital and the Special Training Facility. Dubbed as 'TSU' by many, it the first step for any aspiring villager to become a Shinobi, and the first stage for any Shinobi to reach higher, more prestigious levels.",
      group: "Text-Based RPG:Village Boards",
    },
    {
      name: "Fire Country",
      summary:
        "Covering the west of Seichi, open plains and dense forests span across this nation. The land is scarred with craters thanks to the recent disasters. While the country remains warm for most of the year, the north experiences constant snow and the south enjoys an equal amount of rain during winter. With little land for agriculture, the nation relies on trading and manufacturing for sustenance.",
      group: "Text-Based RPG:Village Boards",
    },
    {
      name: "Wind Country",
      summary:
        "Except for the occasional cliffs that seem to jut out of nowhere, the land is almost flat with either tall grass or deeply carved canyons. The endless green plains are especially beautiful to watch during summer. Towards the west, the plains turn into hills with denser forests. The land is much cooler on the east where the country welcomes cool winds from its neighbor, the Snow country. The scent of smoke hangs in almost every region of the nation.",
      group: "Text-Based RPG:Village Boards",
    },
    {
      name: "Frost Country",
      summary:
        "On the central north of Seichi, this country is covered by almost nothing but snow-capped mountains and jagged frozen wastelands. Home to the highest peak, Mount Tenken, the nation is generally at a higher elevation than the others. The otherwise barren valleys are filled with beautiful wildflowers during summer. The freezing temperatures makes traversing these steep mountains dangerous even to those who are skilled.",
      group: "Text-Based RPG:Village Boards",
    },
    {
      name: "Water Country",
      summary:
        "The Water country is a group of connected islands present at the south-west corner of the continent. With bamboo jungles, waterfalls, and bays, this tropical rainforest is home to many natural hot springs and active volcanoes. The land is shrouded by a dense fog that is formed due to thick plumes of steam from the volcanic mountains spilling into the surrounding ocean under cooler temperatures. The islands receive regular rain and experience a long wet season.",
      group: "Text-Based RPG:Village Boards",
    },
    {
      name: "Sun Country",
      summary:
        "Spanning over more than half the eastern side of Seichi, the Sun country is mostly a sandy desert with mountain ranges across the north and west. The country’s primary water resources are oases. White-sanded beaches with crystal clear water rim the eastern coast, where the land is fertile enough for cultivation. One large river runs towards the eastern coast from the center, cutting through the rocks to form a canyon of rushing rapids.",
      group: "Text-Based RPG:Village Boards",
    },
    {
      name: "The Chat Threads",
      summary:
        "Chat threads are not for everyone, side effects may include ringing ears, a worn out keyboard and sleep deprivation, consult your doctor before use.",
      group: "The Chat Lounge:Fun boards for TNR",
    },
  ];
  for (const board of boards) {
    await prisma.forumBoard.upsert({
      where: {
        name: board.name,
      },
      update: {},
      create: board,
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
