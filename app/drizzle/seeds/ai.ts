// import { DamageTag } from "../../src/libs/combat/types";
import { nanoid } from "nanoid";
import { userData, jutsu, userJutsu } from "../schema";
import { eq, inArray } from "drizzle-orm";
import { calcLevelRequirements } from "../../src/libs/profile";
import { calcHP, calcSP, calcCP } from "../../src/libs/profile";
import type { UserData } from "../schema";
import type { DrizzleClient } from "../../src/server/db";

type StatDistribution = {
  ninjutsuOffence: number;
  ninjutsuDefence: number;
  genjutsuOffence: number;
  genjutsuDefence: number;
  taijutsuOffence: number;
  taijutsuDefence: number;
  bukijutsuOffence: number;
  bukijutsuDefence: number;
  strength: number;
  intelligence: number;
  willpower: number;
  speed: number;
};

type AIdefinition = Partial<UserData> &
  Pick<UserData, "userId" | "gender" | "avatar" | "level" | "rank"> & {
    jutsus?: string[];
    statsDistribution?: StatDistribution;
  };

function ReadonlyMapWithStringKeys<K extends string, AIdefinition>(
  input: Iterable<[K, AIdefinition]>
): ReadonlyMap<K, AIdefinition> {
  return new Map(input);
}

/** Scale stats of user, and return total number of experience / stat points */
export function scaleUserStats(user: AIdefinition) {
  // Pools
  user["curHealth"] = calcHP(user.level);
  user["maxHealth"] = calcHP(user.level);
  user["curStamina"] = calcSP(user.level);
  user["maxStamina"] = calcSP(user.level);
  user["curChakra"] = calcCP(user.level);
  user["maxChakra"] = calcCP(user.level);
  // Stats
  const exp = calcLevelRequirements(user.level) - 500;
  user["experience"] = exp;
  const sum = [
    user.ninjutsuOffence ?? 0,
    user.ninjutsuDefence ?? 0,
    user.genjutsuOffence ?? 0,
    user.genjutsuDefence ?? 0,
    user.taijutsuOffence ?? 0,
    user.taijutsuDefence ?? 0,
    user.bukijutsuOffence ?? 0,
    user.bukijutsuDefence ?? 0,
    user.strength ?? 0,
    user.intelligence ?? 0,
    user.willpower ?? 0,
    user.speed ?? 0,
  ].reduce((a, b) => a + b, 0);
  const calcStat = (stat: keyof StatDistribution) => {
    return 10 + Math.floor((user[stat] ?? 0 / sum) * exp * 100) / 100;
  };
  user["ninjutsuOffence"] = calcStat("ninjutsuOffence");
  user["ninjutsuDefence"] = calcStat("ninjutsuDefence");
  user["genjutsuOffence"] = calcStat("genjutsuOffence");
  user["genjutsuDefence"] = calcStat("genjutsuDefence");
  user["taijutsuOffence"] = calcStat("taijutsuOffence");
  user["taijutsuDefence"] = calcStat("taijutsuDefence");
  user["bukijutsuOffence"] = calcStat("bukijutsuOffence");
  user["bukijutsuDefence"] = calcStat("bukijutsuDefence");
  user["strength"] = calcStat("strength");
  user["intelligence"] = calcStat("intelligence");
  user["willpower"] = calcStat("willpower");
  user["speed"] = calcStat("speed");
}

// Convenience stats distributions for AIs
const beastDistribution: StatDistribution = {
  ninjutsuOffence: 0,
  ninjutsuDefence: 1,
  genjutsuOffence: 0,
  genjutsuDefence: 1,
  taijutsuOffence: 1,
  taijutsuDefence: 1,
  bukijutsuOffence: 0,
  bukijutsuDefence: 1,
  strength: 1,
  intelligence: 1,
  willpower: 1,
  speed: 1,
};

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
      ...beastDistribution,
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
      ...beastDistribution,
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
      ...beastDistribution,
    },
  ],
  [
    "Snake",
    {
      userId: "cljsgjz5g000008mfe2pz6giz",
      gender: "unknown",
      avatar: "/ai/snake.webp",
      level: 4,
      rank: "NONE" as const,
      jutsus: ["Scratch"],
      ...beastDistribution,
    },
  ],
  [
    "Mad Cow",
    {
      userId: "cljsgnanu000408mfdj8l6j70",
      gender: "unknown",
      avatar: "/ai/mad_cow.webp",
      level: 5,
      rank: "NONE" as const,
      jutsus: ["Scratch"],
      ...beastDistribution,
    },
  ],
  [
    "Ninja Crab",
    {
      userId: "cljsgletn000208mfhz1y3ulw",
      gender: "unknown",
      avatar: "/ai/crab.webp",
      level: 6,
      rank: "NONE" as const,
      jutsus: ["Scratch"],
      ...beastDistribution,
    },
  ],
  [
    "Ice Wolf",
    {
      userId: "cljsgmfgx000308mf57ww89mz",
      gender: "unknown",
      avatar: "/ai/ice_wolf.webp",
      level: 7,
      rank: "NONE" as const,
      jutsus: ["Scratch"],
      ...beastDistribution,
    },
  ],
  [
    "Ninja Cat",
    {
      userId: "cljsgo2wn000508mf3w9ahrmu",
      gender: "unknown",
      avatar: "/ai/ninja_cat.webp",
      level: 8,
      rank: "NONE" as const,
      jutsus: ["Scratch"],
      ...beastDistribution,
    },
  ],
  [
    "Spider",
    {
      userId: "cljsgozfp000608mf2qvkbtjo",
      gender: "unknown",
      avatar: "/ai/spider1.webp",
      level: 9,
      rank: "NONE" as const,
      jutsus: ["Scratch"],
      ...beastDistribution,
    },
  ],
  [
    "Ninja Fox",
    {
      userId: "cljsgpl1a000708mf2y2k64k1",
      gender: "unknown",
      avatar: "/ai/ninja_fox.webp",
      level: 10,
      rank: "NONE" as const,
      jutsus: ["Scratch"],
      ...beastDistribution,
    },
  ],
  [
    "Mutated Spider",
    {
      userId: "cljwj43ij000008ml4c2xho09",
      gender: "unknown",
      avatar: "/ai/spider2.webp",
      level: 11,
      rank: "NONE" as const,
      jutsus: ["Poisonous Bite", "Poisonous Spit"],
      ...beastDistribution,
    },
  ],
]);
export type AvailableAI = typeof ais extends ReadonlyMap<infer K, any> ? K : never;

// Bookkeeping
let counter = 0;
const total = ais.size;

const upsertAI = async (client: DrizzleClient, name: string, ai: AIdefinition) => {
  // AI data
  const obj = await client.query.userData.findFirst({
    where: eq(userData.username, name),
  });
  if (!obj) {
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
    // Level-based pools
    scaleUserStats(ai);
    // Insert into database if not already exists
    delete ai.jutsus;
    delete ai.statsDistribution;
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
