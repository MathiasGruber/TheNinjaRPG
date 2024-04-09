import { secondsPassed, secondsFromNow } from "@/utils/time";
import { ANBU_HOSPITAL_DISCOUNT_PERC } from "@/drizzle/constants";
import type { UserData } from "@/drizzle/schema";

/**
 * Calculates the cost of healing for a user.
 * @param user - The user data.
 * @returns The cost of healing.
 */
export const calcHealCost = (user: UserData) => {
  let cost = (user.maxHealth - user.curHealth) / 10;
  if (user.anbuId) {
    cost *= 1 - ANBU_HOSPITAL_DISCOUNT_PERC / 100;
  }
  return cost;
};

/**
 * Calculates the number of seconds left until the user is fully healed.
 * @param user - The user data.
 * @param timeDiff - Optional. The time difference in milliseconds. Defaults to the current time.
 * @returns The number of seconds left until the user is fully healed.
 */
const healSecondsLeft = (user: UserData, timeDiff?: number) => {
  const seconds = secondsPassed(new Date(user.regenAt), timeDiff);
  const healedIn = Math.max(3 * 60 - seconds, 0);
  return healedIn;
};

/**
 * Calculates the timestamp when a user will finish healing.
 * @param info - The healing information.
 * @param info.user - The user data.
 * @param info.timeDiff - The time difference in seconds (optional).
 * @param info.boost - The healing boost percentage (optional).
 * @returns The timestamp when the user will finish healing.
 */
export const calcHealFinish = (info: {
  user: UserData;
  timeDiff?: number;
  boost?: number;
}) => {
  const { user, timeDiff, boost } = info;
  const factor = (100 - (boost ?? 0)) / 100;
  const timeLeft = healSecondsLeft(user, timeDiff) * factor;
  const healedAt = secondsFromNow(timeLeft);
  return healedAt;
};
