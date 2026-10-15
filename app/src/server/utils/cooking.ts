import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  type Item,
  type UserData,
  type UserItem,
  type UserRaidBuff,
  userCookingJob,
  userData,
  userItem,
  userRaidBuff,
} from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import {
  claimUserSnapshot,
  consumeUserItemAtomically,
} from "@/server/utils/concurrency";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { isMealEffect } from "@/validators/cooking";

/** Claim completion receipts and award XP together; output stacks can move independently. */
export const settleCookingExperience = async (
  client: DrizzleClient,
  userId: string,
  jobs: readonly { id: string; experience: number; finishesAt: Date }[],
  now = new Date(),
) => {
  const due = jobs.filter((job) => job.finishesAt <= now);
  if (!due.length) return false;
  return retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      let experience = 0;
      for (const job of due) {
        const claimed = await tx
          .delete(userCookingJob)
          .where(
            and(
              eq(userCookingJob.id, job.id),
              eq(userCookingJob.userId, userId),
              lte(userCookingJob.finishesAt, now),
            ),
          );
        if (claimed.rowsAffected === 1) experience += job.experience;
      }
      if (experience > 0)
        await tx
          .update(userData)
          .set({
            cookingExperience: sql`${userData.cookingExperience} + ${experience}`,
            updatedAt: sql`GREATEST(NOW(3), TIMESTAMPADD(MICROSECOND, 1000, ${userData.updatedAt}))`,
          })
          .where(eq(userData.userId, userId));
      return true;
    }),
  );
};

/** One account snapshot guards inventory removal and replacement of its single meal buff. */
export const consumeMeal = async ({
  client,
  user,
  owned,
  expectedQuantity,
}: {
  client: DrizzleClient;
  user: UserData & { raidBuffs?: UserRaidBuff[] };
  owned: UserItem & { item: Item };
  expectedQuantity?: number;
}) => {
  const now = new Date();
  if (user.status !== "AWAKE" || user.battleId)
    return {
      success: false,
      message: "Meals can only be eaten while awake and out of combat",
    };
  if (
    owned.storedAtHome ||
    owned.isInAuction ||
    owned.equipped !== "NONE" ||
    (owned.craftingFinishedAt && owned.craftingFinishedAt > now)
  ) {
    return {
      success: false,
      message: "Carry a finished meal in your inventory before eating it",
    };
  }
  if (expectedQuantity === undefined || expectedQuantity !== owned.quantity)
    return {
      success: false,
      message: "Your meal stack changed. Refresh your inventory and try again",
    };
  if (
    owned.item.effects.length !== 1 ||
    !owned.item.effects.every(isMealEffect) ||
    owned.item.mealDurationSeconds < 1
  ) {
    return { success: false, message: "This meal has an invalid effect or duration" };
  }
  const id = `meal-${user.userId}`;
  const previous = user.raidBuffs?.find(
    (buff) => buff.id === id && buff.expiresAt > now,
  );
  const extendsMeal = previous?.itemId === owned.itemId;
  const expiresAt = new Date(
    (extendsMeal ? previous.expiresAt.getTime() : now.getTime()) +
      owned.item.mealDurationSeconds * 1000,
  );
  const inventoryConflict = Symbol("inventoryConflict");
  try {
    return await retryOnDeadlock(() =>
      client.transaction(async (tx) => {
        const claim = await claimUserSnapshot({
          client: tx,
          userId: user.userId,
          updatedAt: user.updatedAt,
          where: [eq(userData.status, "AWAKE"), isNull(userData.battleId)],
        });
        if (!claim.success)
          return { success: false, message: "Your state changed. Please try again" };
        const taken = await consumeUserItemAtomically({
          client: tx,
          userId: user.userId,
          userItemId: owned.id,
          expectedQuantity,
          where: [
            eq(userItem.itemId, owned.itemId),
            eq(userItem.storedAtHome, false),
            eq(userItem.isInAuction, false),
            eq(userItem.equipped, "NONE"),
            or(
              isNull(userItem.craftingFinishedAt),
              lte(userItem.craftingFinishedAt, now),
            ),
          ],
        });
        if (!taken) throw inventoryConflict;
        const buff = {
          itemId: owned.itemId,
          questId: null,
          effects: owned.item.effects,
          expiresAt,
          createdAt: extendsMeal ? previous.createdAt : now,
        };
        await tx
          .insert(userRaidBuff)
          .values({ id, userId: user.userId, ...buff })
          .onDuplicateKeyUpdate({ set: buff });
        return {
          success: true,
          message: `Ate ${owned.item.name}. ${extendsMeal ? "Extended" : "Applied"} its meal effect.`,
          userRefresh: true,
        };
      }),
    );
  } catch (error) {
    if (error === inventoryConflict)
      return { success: false, message: "Your meal stack changed. Please try again" };
    throw error;
  }
};
