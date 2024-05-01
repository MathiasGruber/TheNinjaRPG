import { secondsPassed, secondsFromNow } from "@/utils/time";
import { ANBU_HOSPITAL_DISCOUNT_PERC } from "@/drizzle/constants";
import { MEDNIN_REQUIRED_EXP, MEDNIN_MIN_RANK } from "@/drizzle/constants";
import { hasRequiredRank } from "@/libs/train";
import type { MEDNIN_RANK } from "@/drizzle/constants";
import type { UserData } from "@/drizzle/schema";

/**
 * Calculates the cost of healing for a user.
 * @param user - The user data.
 * @returns The cost of healing.
 */
export const calcHealCost = (user: UserData) => {
  let cost = (user.maxHealth - user.curHealth) / 5;
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

// Minimal user type for calculating mednin things
type Healer = Pick<UserData, "medicalExperience" | "rank">;

/**
 * Calculates the MEDNIN rank based on the healer's medical experience.
 * @param healer - The healer's user data.
 * @returns The MEDNIN rank of the healer.
 */
export const calcMedninRank = (healer?: Healer): MEDNIN_RANK => {
  if (!healer) return "NONE";
  if (!hasRequiredRank(healer.rank, MEDNIN_MIN_RANK)) return "NONE";
  if (healer.medicalExperience >= MEDNIN_REQUIRED_EXP.MASTER) {
    return "MASTER";
  }
  if (healer.medicalExperience >= MEDNIN_REQUIRED_EXP.APPRENTICE) {
    return "APPRENTICE";
  }
  return "NOVICE";
};

/**
 * Calculates the healing factor for a user based on the healer's rank.
 * @param healer - The healer's user data.
 * @returns The calculated healing factor.
 */
export const calcUserHealFactor = (healer: Healer) => {
  const base = 0.5;
  switch (calcMedninRank(healer)) {
    case "NONE":
      return 0;
    case "NOVICE":
      return base - 0.05;
    case "APPRENTICE":
      return base - 0.1;
    case "MASTER":
      return base - 0.25;
  }
};

/**
 * Calculates the combat heal percentage based on the healer's mednin rank.
 * @param healer - The healer's user data.
 * @returns The combat heal percentage.
 */
export const calcCombatHealPercentage = (healer?: Healer) => {
  switch (calcMedninRank(healer)) {
    case "NONE":
      return 5;
    case "NOVICE":
      return 5;
    case "APPRENTICE":
      return 10;
    case "MASTER":
      return 15;
  }
};

/**
 * Calculates the amount of health restored based on the healer's healing factor and the amount of chakra used.
 *
 * @param healer - The healer's user data.
 * @param chakra - The amount of chakra used for healing.
 * @returns The amount of health restored.
 */
export const calcChakraToHealth = (healer?: Healer, chakra?: number) => {
  if (!healer || !chakra) return 0;
  const factor = calcUserHealFactor(healer);
  return chakra / factor;
};

/**
 * Calculates the chakra value based on the healer's heal factor and the health value.
 * @param healer - The healer's user data.
 * @param health - The health value to calculate the chakra from.
 * @returns The calculated chakra value.
 */
export const calcHealthToChakra = (healer: Healer, health: number) => {
  const factor = calcUserHealFactor(healer);
  return health * factor;
};
