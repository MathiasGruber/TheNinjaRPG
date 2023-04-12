import { type JutsuType } from "../../src/libs/combat/types";
import { type Prisma, UserRank } from "@prisma/client/edge";
import { AttackTarget } from "@prisma/client/edge";
import { Element } from "@prisma/client/edge";
import { LetterRank } from "@prisma/client/edge";
import { AttackType } from "@prisma/client/edge";

import { type PrismaClient } from "@prisma/client/edge";

export const seedJutsus = async (prisma: PrismaClient) => {
  const jutsus: JutsuType[] = [
    {
      name: "Rasengan",
      description:
        "A powerful wind technique that can be used to inflict massive damage",
      type: AttackType.NINJUTSU,
      level: LetterRank.S,
      requiredRank: UserRank.CHUNIN,
      element1: Element.WIND,
      element2: Element.NONE,
      element3: Element.NONE,
      target: AttackTarget.OPPONENT,
      range: 1,
      cost: 10,
      cooldown: 30,
      effects: [
        { type: "stun", rounds: 3 },
        { type: "damage", calculation: "static", power: 1, rounds: 1 },
        { type: "heal", calculation: "percentage", power: 1, rounds: 1 },
      ],
    },
  ];

  for (const jutsu of jutsus) {
    await prisma.jutsu.upsert({
      where: {
        name: jutsu.name,
      },
      update: {},
      create: { ...jutsu, effects: jutsu.effects as unknown as Prisma.JsonArray },
    });
  }
};
