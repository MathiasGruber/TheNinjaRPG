import {
  ELITE_JONIN_JUTSU_ADVANCED_XP_TO_LEVEL,
  ELITE_JONIN_JUTSU_LEVEL_CAP,
  ELITE_JONIN_JUTSU_XP_TO_LEVEL,
  JUTSU_TRAIN_LEVEL_CAP,
  JUTSU_XP_TO_LEVEL,
} from "@/drizzle/constants";
import type { Jutsu } from "@/drizzle/schema";

/**
 * Combat level cap for the technique's required rank, independently of its owner.
 * Training Grounds and incoming transfers enforce their own lower caps.
 */
export const getJutsuMaxLevel = (jutsu: ProgressionJutsu) =>
  jutsu.requiredRank === "ELITE JONIN"
    ? ELITE_JONIN_JUTSU_LEVEL_CAP
    : JUTSU_TRAIN_LEVEL_CAP;

/**
 * Combat XP needed to advance from the stored current level, not the target level.
 * Elite Jonin techniques switch to the higher threshold upon reaching the ordinary cap.
 * Callers must separately enforce getJutsuMaxLevel before granting progression.
 */
export const getJutsuXpToLevel = (jutsu: ProgressionJutsu, level: number) => {
  if (jutsu.requiredRank !== "ELITE JONIN") return JUTSU_XP_TO_LEVEL;
  return level < JUTSU_TRAIN_LEVEL_CAP
    ? ELITE_JONIN_JUTSU_XP_TO_LEVEL
    : ELITE_JONIN_JUTSU_ADVANCED_XP_TO_LEVEL;
};

type ProgressionJutsu = Pick<Jutsu, "requiredRank">;
