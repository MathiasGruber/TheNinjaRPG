import {
  ELITE_JONIN_JUTSU_ADVANCED_XP_TO_LEVEL,
  ELITE_JONIN_JUTSU_LEVEL_CAP,
  ELITE_JONIN_JUTSU_XP_TO_LEVEL,
  JUTSU_TRAIN_LEVEL_CAP,
  JUTSU_XP_TO_LEVEL,
} from "@/drizzle/constants";
import type { Jutsu } from "@/drizzle/schema";

type ProgressionJutsu = Pick<Jutsu, "requiredRank">;

/** Progression follows the technique's required rank, independently of its owner. */
export const getJutsuMaxLevel = (jutsu: ProgressionJutsu) =>
  jutsu.requiredRank === "ELITE JONIN"
    ? ELITE_JONIN_JUTSU_LEVEL_CAP
    : JUTSU_TRAIN_LEVEL_CAP;

export const getJutsuXpToLevel = (jutsu: ProgressionJutsu, level: number) => {
  if (jutsu.requiredRank !== "ELITE JONIN") return JUTSU_XP_TO_LEVEL;
  return level < JUTSU_TRAIN_LEVEL_CAP
    ? ELITE_JONIN_JUTSU_XP_TO_LEVEL
    : ELITE_JONIN_JUTSU_ADVANCED_XP_TO_LEVEL;
};
