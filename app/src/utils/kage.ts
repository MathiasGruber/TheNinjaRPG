import { hasRequiredRank } from "@/libs/train";
import {
  KAGE_PRESTIGE_REQUIREMENT,
  KAGE_RANK_REQUIREMENT,
  KAGE_MIN_DAYS_IN_VILLAGE,
  KAGE_ELDER_MIN_DAYS,
  KAGE_DAILY_PRESTIGE_LOSS,
  KAGE_MIN_PRESTIGE,
} from "@/drizzle/constants";
import { kagePrestige, type UserData, type KagePrestige } from "@/drizzle/schema";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { DrizzleClient } from "@/server/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const getDaysInVillage = (user: UserData) => {
  try {
    const joinDate = user.villageJoinedAt ? new Date(user.villageJoinedAt) : new Date(0);
    return Math.floor((new Date().getTime() - joinDate.getTime()) / (1000 * 3600 * 24));
  } catch {
    return 0;
  }
};

/**
 * Checks if a user can challenge the Kage.
 * @param user - The user data.
 * @returns True if the user can challenge the Kage, false otherwise.
 */
export const canChallengeKage = (user: UserData) => {
  const daysInVillage = getDaysInVillage(user);

  if (
    user.villagePrestige >= KAGE_PRESTIGE_REQUIREMENT &&
    hasRequiredRank(user.rank, KAGE_RANK_REQUIREMENT) &&
    daysInVillage >= KAGE_MIN_DAYS_IN_VILLAGE
  ) {
    return true;
  }
  return false;
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

/**
 * Updates the Kage prestige based on time elapsed since last update.
 * @param client - The database client.
 * @param kagePrestige - The Kage prestige record.
 * @returns The updated prestige value and whether the Kage should be removed.
 */
export const updateKagePrestige = async (client: DrizzleClient, kagePrestige: KagePrestige) => {
  const now = new Date();
  const lastUpdate = new Date(kagePrestige.lastPrestigeUpdate);
  const daysSinceUpdate = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 3600 * 24));

  if (daysSinceUpdate === 0) {
    return { prestige: kagePrestige.prestige, shouldRemove: kagePrestige.prestige < KAGE_MIN_PRESTIGE };
  }

  const prestigeLoss = daysSinceUpdate * KAGE_DAILY_PRESTIGE_LOSS;
  const newPrestige = Math.max(0, kagePrestige.prestige - prestigeLoss);

  await client
    .update(kagePrestige)
    .set({
      prestige: newPrestige,
      lastPrestigeUpdate: now,
    })
    .where(eq(kagePrestige.id, kagePrestige.id));

  return { prestige: newPrestige, shouldRemove: newPrestige < KAGE_MIN_PRESTIGE };
};

/**
 * Converts village prestige to Kage prestige.
 * @param client - The database client.
 * @param userId - The user ID.
 * @param villageId - The village ID.
 * @param amount - The amount of village prestige to convert.
 * @returns The updated Kage prestige value.
 */
export const convertToKagePrestige = async (
  client: DrizzleClient,
  userId: string,
  villageId: string,
  amount: number,
) => {
  const kagePrestigeRecord = await client.query.kagePrestige.findFirst({
    where: eq(kagePrestige.userId, userId),
  });

  if (kagePrestigeRecord) {
    await client
      .update(kagePrestige)
      .set({
        prestige: sql`${kagePrestige.prestige} + ${amount}`,
      })
      .where(eq(kagePrestige.userId, userId));

    return kagePrestigeRecord.prestige + amount;
  } else {
    await client.insert(kagePrestige).values({
      id: crypto.randomUUID(),
      userId,
      villageId,
      prestige: 5000 + amount,
      createdAt: new Date(),
      lastPrestigeUpdate: new Date(),
    });

    return 5000 + amount;
  }
};
