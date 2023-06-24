// import { DamageTag } from "../../src/libs/combat/types";
import { nanoid } from "nanoid";
import { userData, jutsu, userJutsu } from "../schema";
import { eq, inArray } from "drizzle-orm";
import type { UserData } from "../schema";
import type { DrizzleClient } from "../../src/server/db";

type AIdefinition = Partial<UserData> &
  Pick<UserData, "userId" | "gender" | "avatar" | "level" | "rank"> & {
    jutsus?: string[];
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
      rank: "NONE" as const,
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
      rank: "NONE" as const,
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
      rank: "NONE" as const,
      jutsus: ["Scratch"],
    },
  ],
]);
export type AvailableAI = typeof ais extends ReadonlyMap<infer K, any> ? K : never;

// Bookkeeping
let counter = 0;
const total = ais.size;

const upsertAI = async (client: DrizzleClient, name: string, ai: AIdefinition) => {
  // Jutsus
  await client.delete(userJutsu).where(eq(userJutsu.userId, ai.userId));
  if (ai.jutsus) {
    const jutsus = await client.query.jutsu.findMany({
      where: inArray(jutsu.name, ai.jutsus),
    });
    await client.insert(userJutsu).values(
      jutsus.map((jutsu) => ({
        id: nanoid(),
        userId: ai.userId,
        jutsuId: jutsu.id,
        level: ai.level,
        equipped: 1,
      }))
    );
  }
  // User data
  const obj = await client.query.userData.findFirst({
    where: eq(userData.username, name),
  });
  delete ai.jutsus;
  if (obj) {
    await client.update(userData).set(ai).where(eq(userData.username, name));
  } else {
    await client.insert(userData).values({ ...ai, username: name, isAi: 1 });
  }
  // Progress
  counter++;
  process.stdout.moveCursor(0, -1);
  process.stdout.clearLine(1);
  console.log(`Syncing AI ${counter}/${total}`);
};

// Delete anything not in above list, and insert those missing
export const seedAI = async (client: DrizzleClient) => {
  console.log("\nSyncing AIs...\n");
  const promises: Promise<void>[] = [];
  ais.forEach((ai, username) => {
    promises.push(upsertAI(client, username, ai));
  });

  await Promise.all(promises);
};
