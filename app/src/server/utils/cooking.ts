import * as Sentry from "@sentry/nextjs";
import { and, eq, lte, sql } from "drizzle-orm";
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
import { getNextUserSnapshotAt } from "@/server/utils/concurrency";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";

/**
 * Atomically exchanges each due receipt's XP for an account increment, independently of
 * output stacks. Zero XP marks a delivered receipt until best-effort cleanup removes it.
 * Returns true for every due snapshot, including lost claims and partial failures, so
 * callers reload account XP instead of returning a snapshot from before another claim.
 */
export const settleCookingExperience = async (
  client: DrizzleClient,
  userId: string,
  jobs: readonly { id: string; experience: number; finishesAt: Date }[],
  now = new Date(),
) => {
  const due = jobs.filter((job) => job.finishesAt <= now);
  if (!due.length) return false;
  for (const job of due) {
    if (job.experience <= 0) continue;
    try {
      // Drizzle cannot express this joined UPDATE. Claim one receipt per statement:
      // MySQL updates a joined account row only once even if several receipts match.
      // Use the guarded literal XP because multi-table assignment order is unspecified;
      // reading receipt.experience while also zeroing it could otherwise award zero.
      await retryOnDeadlock(() =>
        client.execute(sql`
          UPDATE ${userData}
          INNER JOIN ${userCookingJob} ON ${userCookingJob.userId} = ${userData.userId}
          SET ${userData.cookingExperience} = ${userData.cookingExperience} + ${job.experience},
              ${userData.updatedAt} = GREATEST(NOW(3), TIMESTAMPADD(MICROSECOND, 1000, ${userData.updatedAt})),
              ${userCookingJob.experience} = 0
          WHERE ${userData.userId} = ${userId}
            AND ${userCookingJob.id} = ${job.id}
            AND ${userCookingJob.userId} = ${userId}
            AND ${userCookingJob.finishesAt} <= ${now}
            AND ${userCookingJob.experience} = ${job.experience}
            AND ${userCookingJob.experience} > 0
        `),
      );
    } catch (error) {
      // Other receipts may already have committed. Keep this one retryable and finish
      // reconciliation rather than hiding successful grants behind a stale profile.
      Sentry.captureException(error, {
        level: "warning",
        tags: { source: "settleCookingExperience" },
      });
    }
  }
  try {
    await retryOnDeadlock(() =>
      client
        .delete(userCookingJob)
        .where(
          and(
            eq(userCookingJob.userId, userId),
            lte(userCookingJob.finishesAt, now),
            eq(userCookingJob.experience, 0),
          ),
        ),
    );
  } catch (error) {
    // A zero marker cannot grant XP again; cleanup failure must not undo reconciliation.
    Sentry.captureException(error, {
      level: "warning",
      tags: { source: "settleCookingExperience" },
    });
  }
  return true;
};

/**
 * One joined update claims the account snapshot, debits the exact carried stack and
 * replaces its single meal buff together. Only expired empty placeholders and harmless
 * zero-quantity stacks can remain if preparatory or cleanup work loses a race.
 */
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
  if (owned.item.effects.length !== 1 || owned.item.mealDurationSeconds < 1) {
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
  // A rejected same-account race may leave this expired, effect-free row. That
  // reversible residue costs no item or active effect; an existing buff is untouched.
  await retryOnDeadlock(() =>
    client
      .insert(userRaidBuff)
      .values({
        id,
        userId: user.userId,
        itemId: null,
        questId: null,
        effects: [],
        expiresAt: now,
        createdAt: now,
      })
      .onDuplicateKeyUpdate({ set: { id: sql`id` } }),
  );
  // Drizzle cannot express this joined UPDATE. Every guard is checked in the same
  // statement as both value changes, so a lost account/item race changes neither.
  const consumed = await retryOnDeadlock(() =>
    client.execute(sql`
      UPDATE ${userData}
      INNER JOIN ${userItem} ON ${userItem.userId} = ${userData.userId}
      INNER JOIN ${userRaidBuff} ON ${userRaidBuff.userId} = ${userData.userId}
      SET ${userData.updatedAt} = ${getNextUserSnapshotAt(user.updatedAt, now)},
          ${userItem.quantity} = ${expectedQuantity - 1},
          ${userRaidBuff.itemId} = ${owned.itemId},
          ${userRaidBuff.questId} = NULL,
          ${userRaidBuff.effects} = ${JSON.stringify(owned.item.effects)},
          ${userRaidBuff.expiresAt} = ${expiresAt},
          ${userRaidBuff.createdAt} = ${extendsMeal ? previous.createdAt : now}
      WHERE ${userData.userId} = ${user.userId}
        AND ${userData.updatedAt} = ${user.updatedAt}
        AND ${userData.status} = 'AWAKE'
        AND ${userData.battleId} IS NULL
        AND ${userItem.id} = ${owned.id}
        AND ${userItem.userId} = ${user.userId}
        AND ${userItem.itemId} = ${owned.itemId}
        AND ${userItem.quantity} = ${expectedQuantity}
        AND ${userItem.quantity} > 0
        AND ${userItem.storedAtHome} = FALSE
        AND ${userItem.isInAuction} = FALSE
        AND ${userItem.equipped} = 'NONE'
        AND (${userItem.craftingFinishedAt} IS NULL OR ${userItem.craftingFinishedAt} <= ${now})
        AND ${userRaidBuff.id} = ${id}
        AND ${userRaidBuff.userId} = ${user.userId}
    `),
  );
  if (consumed.rowsAffected === 0)
    return {
      success: false,
      message: "Your state or meal stack changed. Please try again",
    };
  if (expectedQuantity === 1) {
    try {
      await retryOnDeadlock(() =>
        client
          .delete(userItem)
          .where(
            and(
              eq(userItem.id, owned.id),
              eq(userItem.userId, user.userId),
              eq(userItem.quantity, 0),
            ),
          ),
      );
    } catch (error) {
      // Consumption already committed. Inventory reads hide zero stacks and reclaim
      // stale tombstones; report success so the player does not retry the same meal.
      Sentry.captureException(error, {
        level: "warning",
        tags: { source: "consumeMeal" },
      });
    }
  }
  return {
    success: true,
    message: `Ate ${owned.item.name}. ${extendsMeal ? "Extended" : "Applied"} its meal effect.`,
    userRefresh: true,
  };
};
