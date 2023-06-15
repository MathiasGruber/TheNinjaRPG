import { UserRank } from "@prisma/client";
import { AttackTarget, AttackMethod } from "@prisma/client";
import { DamageTag } from "../../src/libs/combat/types";
import type { PrismaClient, UserData } from "@prisma/client";

type AIdefinition = Partial<UserData> &
  Pick<UserData, "userId" | "gender" | "avatar" | "level" | "rank"> & {
    jutsus: string[];
  };

function ReadonlyMapWithStringKeys<K extends string, AIdefinition>(
  input: Iterable<[K, AIdefinition]>
): ReadonlyMap<K, AIdefinition> {
  return new Map(input);
}

export const ais = ReadonlyMapWithStringKeys([
  [
    "Sad Puppy",
    {
      userId: "clik9wpb0000009l606opg0zj",
      gender: "unknown",
      avatar: "/ai/sad_puppy.webp",
      level: 1,
      rank: UserRank.NONE,
      jutsus: ["Scratch"],
    },
  ],
  [
    "Angry Cat",
    {
      userId: "cli93opw7000008lj2ut5fqlq",
      gender: "unknown",
      avatar: "/ai/angry_cat.webp",
      level: 2,
      rank: UserRank.NONE,
      jutsus: ["Scratch"],
    },
  ],
  [
    "Wild Boar",
    {
      userId: "clik9wzuy000109l650ds0x6x",
      gender: "unknown",
      avatar: "/ai/wild_boar.webp",
      level: 3,
      rank: UserRank.NONE,
      jutsus: ["Scratch"],
    },
  ],
]);
export type AvailableAI = typeof ais extends ReadonlyMap<infer K, any> ? K : never;

// Bookkeeping
let counter = 0;
const total = ais.size;

const upsertAI = async (prisma: PrismaClient, name: string, ai: AIdefinition) => {
  const obj = await prisma.userData.upsert({
    where: {
      username: name,
    },
    update: { ...ai, jutsus: {} },
    create: { ...ai, username: name, isAi: true, jutsus: {} },
  });
  const jutsus = await prisma.jutsu.findMany({
    where: { name: { in: ai.jutsus } },
  });

  await prisma.userJutsu.deleteMany({
    where: { userId: ai.userId },
  });
  await prisma.userJutsu.createMany({
    data: jutsus.map((jutsu) => ({
      userId: ai.userId,
      jutsuId: jutsu.id,
      level: ai.level,
      equipped: true,
    })),
  });
  // Progress
  counter++;
  process.stdout.moveCursor(0, -1);
  process.stdout.clearLine(1);
  console.log(`Syncing AI ${counter}/${total}`);
  return obj;
};

// Delete anything not in above list, and insert those missing
export const seedAI = async (prisma: PrismaClient) => {
  console.log("\nSyncing AIs...\n");
  const promises: Promise<UserData>[] = [];
  ais.forEach((ai, username) => {
    promises.push(upsertAI(prisma, username, ai));
  });

  await Promise.all(promises);
};
