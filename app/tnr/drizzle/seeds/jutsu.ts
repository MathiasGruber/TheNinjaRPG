import { nanoid } from "nanoid";
import { jutsu } from "../schema";
import { eq } from "drizzle-orm";
import { JutsuValidator } from "../../src/libs/combat/types";
import { CloneTag } from "../../src/libs/combat/types";
import { DamageTag } from "../../src/libs/combat/types";
import { BarrierTag } from "../../src/libs/combat/types";
import { StunTag } from "../../src/libs/combat/types";
import type { ZodJutsuType } from "../../src/libs/combat/types";
import type { DrizzleClient } from "../../src/server/db";

const jutsus: ZodJutsuType[] = [
  /******************** */
  /**  AI-Only Jutsus   */
  /******************** */
  {
    name: "Scratch",
    image: "/jutsus/scratch.png",
    description:
      "Used by beasts with sharp claws to scratch their opponents. This is a basic attack.",
    battleDescription: "%user uses its sharp claws to scratch %target",
    jutsuType: "AI" as const,
    jutsuRank: "D" as const,
    requiredRank: "STUDENT" as const,
    target: "OTHER_USER" as const,
    method: "SINGLE" as const,
    range: 1,
    cooldown: 30,
    effects: [
      DamageTag.parse({
        power: 1,
        powerPerLevel: 0.1,
        statTypes: ["Taijutsu", "Bukijutsu"],
        generalTypes: ["Strength", "Speed"],
        rounds: 0,
        appearAnimation: "hit",
      }),
    ],
  },
  /******************** */
  /**  D-Ranked Jutsus  */
  /******************** */
  {
    name: "Clone Technique",
    image: "/jutsus/clone_technique.png",
    description:
      "This jutsu creates a clone, which is then used as a distraction to attack from behind",
    battleDescription:
      "%user creates a clone of %user_reflexive. The clone is a perfect copy of %user, but %target_object strength is split between the two.",
    jutsuType: "NORMAL" as const,
    jutsuRank: "D" as const,
    requiredRank: "STUDENT" as const,
    target: "EMPTY_GROUND" as const,
    method: "SINGLE" as const,
    range: 1,
    cooldown: 30,
    chakraCostPerc: 20,
    effects: [
      CloneTag.parse({
        rounds: 0,
        power: 50,
        powerPerLevel: 1,
        statTypes: ["Ninjutsu", "Genjutsu"],
        generalTypes: ["Willpower", "Intelligence"],
        calculation: "percentage",
        appearAnimation: "smoke",
        disappearAnimation: "smoke",
      }),
    ],
  },
  {
    name: "Replacement Technique",
    image: "/jutsus/replacement_technique.png",
    description: "Basic Replacement used to escape or distract enemies.",
    battleDescription: "%user replaces %gender body with a random, nearby object.",
    jutsuType: "NORMAL" as const,
    jutsuRank: "D" as const,
    requiredRank: "STUDENT" as const,
    target: "CHARACTER" as const,
    method: "SINGLE" as const,
    range: 1,
    cooldown: 30,
    effects: [
      DamageTag.parse({
        rounds: 0,
        power: 1,
        statTypes: ["Ninjutsu"],
        generalTypes: ["Willpower", "Strength"],
      }),
    ],
  },
  {
    name: "Rock Barrier",
    image: "/jutsus/rock_barrier.png",
    description: "Form a battlefield barrier in the form of a pile of rocks.",
    battleDescription: "%user summons a rock barrier.",
    jutsuType: "NORMAL" as const,
    jutsuRank: "D" as const,
    requiredRank: "STUDENT" as const,
    target: "EMPTY_GROUND" as const,
    method: "SINGLE" as const,
    range: 1,
    cooldown: 30,
    effects: [
      BarrierTag.parse({
        rounds: 10,
        power: 2,
        originalPower: 2,
        direction: "defence",
        calculation: "static",
        staticAssetPath: "craftpix-377140/PNG/Objects_separately/Rock6_2.png",
        appearAnimation: "smoke",
        disappearAnimation: "smoke",
      }),
    ],
  },
  /******************** */
  /**  C-Ranked Jutsus  */
  /******************** */
  {
    name: "Soul Shackles",
    image: "/jutsus/soul_shackles.png",
    description: "This illusion catches your opponent in chains.",
    battleDescription:
      "%user stares at %target. Without a warning %target`s arms and legs are shackled in steel bindings. The shackles drag %target down onto the ground with insane power.",
    jutsuType: "NORMAL" as const,
    jutsuRank: "C" as const,
    requiredRank: "GENIN" as const,
    target: "CHARACTER" as const,
    method: "SINGLE" as const,
    range: 2,
    cooldown: 30,
    effects: [
      DamageTag.parse({
        rounds: 0,
        power: 1,
        statTypes: ["Genjutsu"],
        generalTypes: ["Intelligence", "Willpower"],
      }),
      StunTag.parse({
        rounds: 1,
        chance: 1,
      }),
    ],
  },
  {
    name: "Fireball",
    image: "/jutsus/fireball.png",
    description: "A basic fire jutsu capable of dealing damage to multiple users",
    battleDescription:
      "%user concentrates fire chakra just above the palm of %user_object hand, creating a blazing ball of fire. %user thrusts %user_object hand forward, throwing the explosive ball of flames towards %location.",
    jutsuType: "NORMAL" as const,
    jutsuRank: "C" as const,
    requiredRank: "GENIN" as const,
    target: "GROUND" as const,
    method: "AOE_CIRCLE_SPAWN" as const,
    range: 3,
    cooldown: 30,
    effects: [
      DamageTag.parse({
        rounds: 3,
        power: 1,
        statTypes: ["Ninjutsu"],
        generalTypes: ["Intelligence", "Willpower"],
        appearAnimation: "explosion",
        staticAnimation: "fire",
        disappearAnimation: "rising_smoke",
      }),
    ],
  },
  /******************** */
  /**  B-Ranked Jutsus  */
  /******************** */
  {
    name: "Sonic Slash",
    image: "/jutsus/sonic_slash.png",
    description:
      "This body straining technique sends out multiple shockwaves as the tip of your weapon breaks the sound barrier.",
    battleDescription:
      "%user forces chakra through %jutsuWeapon arms and slashes %jutsuWeapon with such speed and strength that multiple sonic waves are emitted from the blade, hitting %opponent with crushing force.",
    jutsuWeapon: "SWORD" as const,
    jutsuType: "NORMAL" as const,
    jutsuRank: "B" as const,
    requiredRank: "GENIN" as const,
    target: "CHARACTER" as const,
    method: "SINGLE" as const,
    range: 2,
    cooldown: 30,
    effects: [
      DamageTag.parse({
        rounds: 0,
        power: 1,
        statTypes: ["Genjutsu"],
        generalTypes: ["Intelligence", "Willpower"],
      }),
      StunTag.parse({
        rounds: 1,
        chance: 1,
      }),
    ],
  },
  /******************** */
  /**  S-Ranked Jutsus  */
  /******************** */
  {
    name: "Searing Intimidation",
    image: "/jutsus/searing_intimidation.png",
    description: "An intimidation technique reliant on fire.",
    battleDescription:
      "%user forces fire chakra into %jutsuWeapon face, causing %user's eyes to erupt in flames and %jutsuWeapon to glow an eerie red. %user stares down %opponent, flames escape from %jutsuWeapon as %user1 moves towards %opponentgender. Getting in close with %opponentgender before delivering a swift, strong jab to the abdomen. %user exhales, releasing a stream of fire from %jutsuWeapon as the strike hits.",
    jutsuWeapon: "FIST_WEAPON" as const,
    jutsuType: "NORMAL" as const,
    jutsuRank: "A" as const,
    requiredRank: "GENIN" as const,
    target: "CHARACTER" as const,
    method: "SINGLE" as const,
    range: 2,
    cooldown: 30,
    effects: [
      DamageTag.parse({
        rounds: 0,
        power: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Speed", "Strength"],
        elements: ["Fire"],
      }),
    ],
  },
];

// Bookkeeping
let counter = 0;
const total = jutsus.length;

const upsertJutsu = async (client: DrizzleClient, data: ZodJutsuType) => {
  // Validate jutsu
  const parsed = JutsuValidator.parse(data);
  // Database call
  const obj = await client.query.jutsu.findFirst({
    where: eq(jutsu.name, parsed.name),
  });
  if (obj) {
    await client.update(jutsu).set(parsed).where(eq(jutsu.name, parsed.name));
  } else {
    await client.insert(jutsu).values({
      id: nanoid(),
      ...parsed,
    });
  }
  // Progress
  counter++;
  process.stdout.moveCursor(0, -1);
  process.stdout.clearLine(1);
  console.log(`Syncing jutsu ${counter}/${total}`);
};

// Delete anything not in above list, and insert those missing
export const seedJutsus = async (client: DrizzleClient) => {
  console.log("\nSyncing jutsus...\n");
  const promises: Promise<void>[] = [];
  for (const entry of jutsus) {
    promises.push(upsertJutsu(client, entry));
  }
  await Promise.all(promises);
};
