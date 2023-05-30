import type { PrismaClient, UserData } from "@prisma/client";
import { UserRank } from "@prisma/client";

type AIdefinition = Partial<UserData> & Pick<UserData, "userId" | "gender" | "avatar" | "level" | "rank">;

function ReadonlyMapWithStringKeys<K extends string, AIdefinition>(
  input: Iterable<[K, AIdefinition]>
): ReadonlyMap<K, AIdefinition> {
  return new Map(input);
}

export const ais = ReadonlyMapWithStringKeys([
  [
    "Angry Cat",
    {
      userId: "cli93opw7000008lj2ut5fqlq",
      gender: "unknown",
      avatar: "/ai/angry_cat.webp",
      level: 1,
      rank: UserRank.NONE,
    },
  ],
]);
export type AvailableAI = typeof ais extends ReadonlyMap<infer K, any> ? K : never;

// Bookkeeping
let counter = 0;
const total = ais.size;

const upsertAI = async (prisma: PrismaClient, name: string, ai: AIdefinition) => {
  // Database call
  const obj = await prisma.userData.upsert({
    where: {
      username: name,
    },
    update: { ...ai },
    create: { ...ai, username: name, isAI: true },
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
