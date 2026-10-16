import {
  KAGE_DEFENSE_SLOT_MINUTES,
  KAGE_DEFENSE_WINDOW_HOURS,
  KAGE_ELDER_MIN_DAYS,
  KAGE_MIN_DAYS_IN_VILLAGE,
  KAGE_PRESTIGE_REQUIREMENT,
  KAGE_RANK_REQUIREMENT,
} from "@/drizzle/constants";
import type { UserData } from "@/drizzle/schema";
import { hasRequiredRank } from "@/libs/train";
import type { UserWithRelations } from "@/routers/profile";
import { getWeeklyWindowSlots } from "@/utils/time";
import type { KageWindow } from "@/validators/kage";

/** Enumerate title-defense starts from an inclusive lower bound using the configured UTC cadence. */
export const getKageSlots = (windows: KageWindow[], earliest: Date, days = 28) =>
  getWeeklyWindowSlots(
    windows,
    earliest,
    days,
    KAGE_DEFENSE_WINDOW_HOURS,
    KAGE_DEFENSE_SLOT_MINUTES,
  );

/** Return a user-facing ineligibility reason, or null, shared by admission, nomination and launch. */
export const getKageEligibility = (user: UserData, villageId: string) => {
  if (user.villageId !== villageId || user.isOutlaw)
    return "You must belong to this village";
  if (user.isBanned || user.isAi) return "Your character cannot join the queue";
  if (user.anbuId) return "Leave ANBU before joining the Kage queue";
  if (!hasRequiredRank(user.rank, KAGE_RANK_REQUIREMENT))
    return `Requires ${KAGE_RANK_REQUIREMENT} rank`;
  if (user.villagePrestige < KAGE_PRESTIGE_REQUIREMENT)
    return `Requires ${KAGE_PRESTIGE_REQUIREMENT.toLocaleString()} village prestige`;
  if (getDaysInVillage(user) < KAGE_MIN_DAYS_IN_VILLAGE)
    return `Requires ${KAGE_MIN_DAYS_IN_VILLAGE} days in this village`;
  return null;
};

/**
 * Gets the number of days a user has been in their village.
 * @param user - The user data.
 * @returns The number of days the user has been in their village.
 */
const getDaysInVillage = (user: UserData) => {
  try {
    if (!user.joinedVillageAt) return 0;
    const joinDate = new Date(user.joinedVillageAt);
    return Math.floor((Date.now() - joinDate.getTime()) / (1000 * 3600 * 24));
  } catch {
    return 0;
  }
};

/**
 * Checks if a user can be an elder.
 * @param user - The user data.
 * @returns True if the user can be an elder, false otherwise.
 */
export const canBeElder = (user: UserData) => {
  const daysInVillage = getDaysInVillage(user);
  return daysInVillage >= KAGE_ELDER_MIN_DAYS;
};

/**
 * Checks if a user is the Kage of their village.
 * @param user - The user object.
 * @returns True if the user is the Kage of their village, false otherwise.
 */
export const isKage = (user: NonNullable<UserWithRelations>) => {
  return Boolean(user?.village && user.userId === user.village?.kageId);
};
