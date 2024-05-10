import { nanoid } from "nanoid";
import { village, villageStructure, conversation } from "@/drizzle/schema";
import { userData, userAttribute } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { DrizzleClient } from "@/server/db";

// Default villages
const villages = [
  { name: "Konoki", sector: 105, hexColor: "#206625" },
  { name: "Shroud", sector: 4, hexColor: "#3232a8" },
  { name: "Silence", sector: 297, hexColor: "#0a0a0a" },
  { name: "Current", sector: 300, hexColor: "#606160" },
  // { name: "Horizon", sector: 66, hexColor: "#9e4819" },
  { name: "Glacier", sector: 116, hexColor: "#50A6C5" },
  { name: "Shine", sector: 89, hexColor: "#ffd966" },
  { name: "Syndicate", sector: 484, isOutlawFaction: true, hexColor: "#ffd966" },
];
// Elders
const elders = [
  { username: "Haruto", gender: "Male", attributes: ["wrinkles", "gray hair"] },
  { username: "Hisame", gender: "Male", attributes: ["wrinkles", "gray hair"] },
  { username: "Raion", gender: "Male", attributes: ["wrinkles", "gray hair"] },
  { username: "Ryouichi", gender: "Male", attributes: ["wrinkles", "gray hair"] },
  { username: "Junko", gender: "Female", attributes: ["wrinkles", "gray hair"] },
  { username: "Kimiko", gender: "Female", attributes: ["wrinkles", "gray hair"] },
  { username: "Yukiko", gender: "Female", attributes: ["wrinkles", "gray hair"] },
  { username: "Hanso", gender: "Male", attributes: ["wrinkles", "gray hair"] },
];
// Buildings
const buildings = [
  {
    name: "Home",
    route: "/home",
    image: "/buildings/Home.webp",
    level: 1,
    longitude: 4,
    latitude: 10,
    hasPage: 1,
    sleepRegenPerLvl: 2,
  },
  {
    name: "Training Grounds",
    route: "/traininggrounds",
    image: "/buildings/Training.webp",
    level: 1,
    longitude: 4,
    latitude: 5,
    hasPage: 1,
    trainBoostPerLvl: 1,
  },
  {
    name: "Clan Hall",
    route: "/clanhall",
    image: "/buildings/Clan.webp",
    level: 0,
    longitude: 8,
    latitude: 4,
    hasPage: 1,
    clansPerLvl: 1,
    villageDefencePerLvl: 1,
  },
  {
    name: "Town Hall",
    route: "/townhall",
    image: "/buildings/TownHall.webp",
    level: 1,
    longitude: 10,
    latitude: 7,
    hasPage: 1,
    structureDiscountPerLvl: 1,
  },
  {
    name: "Battle Arena",
    route: "/battlearena",
    image: "/buildings/Arena.webp",
    level: 1,
    longitude: 7,
    latitude: 6,
    hasPage: 1,
    arenaRewardPerLvl: 5,
  },
  {
    name: "Mission Hall",
    route: "/missionhall",
    image: "/buildings/Missions.webp",
    level: 1,
    longitude: 11,
    latitude: 10,
    hasPage: 1,
    regenIncreasePerLvl: 1,
  },
  {
    name: "Bank",
    route: "/bank",
    image: "/buildings/Bank.webp",
    level: 1,
    longitude: 15,
    latitude: 10,
    hasPage: 1,
    bankInterestPerLvl: 1,
  },
  {
    name: "Item shop",
    route: "/itemshop",
    image: "/buildings/Shop.webp",
    level: 1,
    longitude: 13,
    latitude: 11,
    hasPage: 1,
    itemDiscountPerLvl: 5,
  },
  {
    name: "Hospital",
    route: "/hospital",
    image: "/buildings/Hospital.webp",
    level: 1,
    longitude: 12,
    latitude: 8,
    hasPage: 1,
    hospitalSpeedupPerLvl: 2,
  },
  {
    name: "ANBU",
    route: "/anbu",
    image: "/buildings/ANBU.webp",
    level: 0,
    longitude: 9,
    latitude: 5,
    hasPage: 1,
    anbuSquadsPerLvl: 1,
    villageDefencePerLvl: 1,
  },
  // { name: "Casino", image: "/buildings/Casino.webp", level: 0 },
  {
    name: "Ramen Shop",
    route: "/ramenshop",
    image: "/buildings/RamenShop.webp",
    level: 1,
    longitude: 3,
    latitude: 8,
    hasPage: 1,
    ramenDiscountPerLvl: 5,
  },
  {
    name: "Black Market",
    route: "/blackmarket",
    image: "/buildings/BlackMarket.webp",
    level: 0,
    longitude: 14,
    latitude: 3,
    hasPage: 1,
    blackDiscountPerLvl: 5,
    maxLevel: 1,
  },
  {
    name: "Protectors",
    route: "",
    image: "/buildings/AI.webp",
    level: 1,
    hasPage: 0,
    villageDefencePerLvl: 2,
    patrolsPerLvl: 1,
  },
  {
    name: "Walls",
    route: "",
    image: "/buildings/Walls.webp",
    level: 1,
    hasPage: 0,
    villageDefencePerLvl: 5,
  },
] as const;
export type StructureName = (typeof buildings)[number]["name"];
export type StructureRoute = (typeof buildings)[number]["route"];

export const seedVillages = async (client: DrizzleClient) => {
  const promises: Promise<void>[] = [];
  console.log("\nSyncing villages...");

  const createVillage = async (
    villageData: (typeof villages)[number],
    elderData: (typeof elders)[number] | undefined,
  ) => {
    // Get elder ID
    let elderId = nanoid();
    const curElder = await client.query.userData.findFirst({
      where: eq(userData.username, elderData?.username ?? ""),
    });
    if (curElder) {
      elderId = curElder.userId;
    }
    // Create Village
    let villageId = nanoid();
    const curVillage = await client.query.village.findFirst({
      where: eq(village.name, villageData.name),
    });
    if (curVillage) {
      await client
        .update(village)
        .set(villageData)
        .where(eq(village.name, villageData.name));
      villageId = curVillage.id;
    } else {
      await client
        .insert(village)
        .values({ id: villageId, ...villageData, kageId: elderId });
    }
    // Buildings
    void buildings.map(async (building) => {
      const curBuilding = await client.query.villageStructure.findFirst({
        where: and(
          eq(villageStructure.name, building.name),
          eq(villageStructure.villageId, villageId),
        ),
      });
      if (curBuilding) {
        await client
          .update(villageStructure)
          .set(building)
          .where(
            and(
              eq(villageStructure.name, building.name),
              eq(villageStructure.villageId, villageId),
            ),
          );
      } else {
        await client
          .insert(villageStructure)
          .values({ id: nanoid(), ...building, villageId: villageId });
      }
    });
    // Village elder
    if (elderData) {
      if (!curElder) {
        await client.insert(userData).values({
          userId: elderId,
          villageId: villageId,
          rank: "ELDER",
          isAi: 1,
          status: "AWAKE",
          username: elderData.username,
          gender: elderData.gender,
        });
      } else {
        await client
          .update(userData)
          .set({ villageId })
          .where(eq(userData.userId, elderId));
      }
      const elderVillage = await client.query.village.findFirst({
        where: eq(village.name, villageData.name),
      });
      if (!elderVillage?.kageId) {
        await client
          .update(village)
          .set({ kageId: elderId })
          .where(eq(village.name, villageData.name));
      }
      await client.delete(userAttribute).where(eq(userAttribute.userId, elderId));
      void elderData.attributes.map(async (attribute) => {
        await client.insert(userAttribute).values({
          id: nanoid(),
          userId: elderId,
          attribute,
        });
      });
    }
    // Village conversation
    const curConversation = await client.query.conversation.findFirst({
      where: eq(conversation.title, villageData.name),
    });
    if (!curConversation) {
      await client.insert(conversation).values({
        id: nanoid(),
        title: villageData.name,
      });
    }
  };

  villages.map((data, i) => promises.push(createVillage(data, elders[i])));

  // Global conversation
  const curGlobalConversation = await client.query.conversation.findFirst({
    where: eq(conversation.title, "Global"),
  });
  if (!curGlobalConversation) {
    await client.insert(conversation).values({
      id: nanoid(),
      title: "Global",
    });
  }

  // Process all the stuff
  await Promise.all(promises).then(() => {
    console.log("Done syncing villages!");
  });
};
