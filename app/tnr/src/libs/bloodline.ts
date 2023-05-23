import { LetterRank } from "@prisma/client";

export const ROLL_CHANCE = {
  [LetterRank.S]: 0.005,
  [LetterRank.A]: 0.01,
  [LetterRank.B]: 0.02,
  [LetterRank.C]: 0.04,
  [LetterRank.D]: 0.08,
} as const;

export const BLOODLINE_COST = {
  [LetterRank.S]: 400,
  [LetterRank.A]: 200,
  [LetterRank.B]: 100,
  [LetterRank.C]: 50,
  [LetterRank.D]: 25,
} as const;

export const REMOVAL_COST = 5;
