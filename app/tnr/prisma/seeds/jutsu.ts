import { type JutsuType } from "../../src/libs/combat/types";

const jutsus: JutsuType[] = [
  {
    name: "Rasengan",
    rank: "Genin",
    type: "Ninjutsu",
    element: "Wind",
    description: "A powerful wind technique that can be used to inflict massive damage",
    effects: [
      { type: "stun", rounds: 3 },
      { type: "damage", calculation: "static", power: 1, rounds: 1 },
      { type: "heal", calculation: "percentage", power: 1, rounds: 1 },
    ],
  },
];
