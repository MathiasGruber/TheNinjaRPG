import { type ZodJutsuType } from "../../src/libs/combat/types";
import { type Prisma, UserRank } from "@prisma/client";
import { type PrismaClient } from "@prisma/client";
import { AttackTarget } from "@prisma/client";
import { LetterRank } from "@prisma/client";
import { JutsuType } from "@prisma/client";
import { WeaponType } from "@prisma/client";

import { CloneTag } from "../../src/libs/combat/types";
import { DamageTag } from "../../src/libs/combat/types";
import { BarrierTag } from "../../src/libs/combat/types";
import { StunTag } from "../../src/libs/combat/types";

const jutsus: ZodJutsuType[] = [
  /******************** */
  /**  D-Ranked Jutsus  */
  /******************** */
  {
    name: "Clone Technique",
    image: "/jutsus/clone_technique.png",
    description:
      "This jutsu creates a clone, which is then used as a distraction to attack from behind",
    battleDescription:
      "%user creates a clone of %genderself. The clone is a perfect copy of %user, but %gender strength is split between the two.",
    jutsuType: JutsuType.NORMAL,
    jutsuRank: LetterRank.D,
    requiredRank: UserRank.STUDENT,
    target: AttackTarget.EMPTY_GROUND,
    range: 1,
    cooldown: 30,
    chakraCostPerc: 20,
    effects: [
      CloneTag.parse({
        rounds: 1,
        power: 50,
        powerPerLevel: 1,
        statTypes: ["Ninjutsu", "Genjutsu"],
        generalTypes: ["Willpower", "Intelligence"],
        calculation: "percentage",
      }),
    ],
  },
  {
    name: "Replacement Technique",
    image: "/jutsus/replacement_technique.png",
    description: "Basic Replacement used to escape or distract enemies.",
    battleDescription: "%user replaces %gender body with a random, nearby object.",
    jutsuType: JutsuType.NORMAL,
    jutsuRank: LetterRank.D,
    requiredRank: UserRank.STUDENT,
    target: AttackTarget.CHARACTER,
    range: 1,
    cooldown: 30,
    effects: [
      DamageTag.parse({
        rounds: 1,
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
    jutsuType: JutsuType.NORMAL,
    jutsuRank: LetterRank.D,
    requiredRank: UserRank.STUDENT,
    target: AttackTarget.GROUND,
    range: 1,
    cooldown: 30,
    effects: [
      BarrierTag.parse({
        rounds: 10,
        power: 2,
        originalPower: 2,
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
      "%user stares at %opponent. Without a warning %opponent`s arms and legs are shackled in steel bindings. The shackles drag %opponent down onto the ground with insane power.",
    jutsuType: JutsuType.NORMAL,
    jutsuRank: LetterRank.C,
    requiredRank: UserRank.GENIN,
    target: AttackTarget.CHARACTER,
    range: 2,
    cooldown: 30,
    effects: [
      DamageTag.parse({
        rounds: 1,
        power: 1,
        statTypes: ["Genjutsu"],
        generalTypes: ["Intelligence", "Willpower"],
      }),
      StunTag.parse({
        rounds: 1,
        timing: "next round",
        chance: 1,
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
    jutsuWeapon: WeaponType.SWORD,
    jutsuType: JutsuType.NORMAL,
    jutsuRank: LetterRank.B,
    requiredRank: UserRank.GENIN,
    target: AttackTarget.CHARACTER,
    range: 2,
    cooldown: 30,
    effects: [
      DamageTag.parse({
        rounds: 1,
        power: 1,
        statTypes: ["Genjutsu"],
        generalTypes: ["Intelligence", "Willpower"],
      }),
      StunTag.parse({
        rounds: 1,
        timing: "next round",
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
    jutsuWeapon: WeaponType.FIST_WEAPON,
    jutsuType: JutsuType.NORMAL,
    jutsuRank: LetterRank.A,
    requiredRank: UserRank.GENIN,
    target: AttackTarget.CHARACTER,
    range: 2,
    cooldown: 30,
    effects: [
      DamageTag.parse({
        rounds: 1,
        power: 1,
        statTypes: ["Taijutsu"],
        generalTypes: ["Speed", "Strength"],
        elements: ["Fire"],
      }),
    ],
  },
];

// Delete anything not in above list, and insert those missing
export const seedJutsus = async (prisma: PrismaClient) => {
  for (const jutsu of jutsus) {
    await prisma.jutsu.upsert({
      where: {
        name: jutsu.name,
      },
      update: { ...jutsu, effects: jutsu.effects as unknown as Prisma.JsonArray },
      create: { ...jutsu, effects: jutsu.effects as unknown as Prisma.JsonArray },
    });
  }
};
