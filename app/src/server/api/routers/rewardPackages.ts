import { and, eq, gte, isNull, notExists, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { UserRole } from "@/drizzle/constants";
import { actionLog, quest, rewardNode, rewardPackage } from "@/drizzle/schema";
import { fetchUser } from "@/routers/profile";
import {
  baseServerResponse,
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
  serverError,
} from "@/server/api/trpc";
import { validateTitleRewardIds } from "@/server/utils/titleRewards";
import { calculateContentDiff } from "@/utils/diff";
import { canAwardReputation, canManageRewards, isStaffRole } from "@/utils/permissions";
import { idSchema } from "@/validators/misc";
import type { QuestContentType } from "@/validators/objectives";
import { SaveRewardNode, SaveRewardPackage } from "@/validators/rewardPackages";

/** Staff reward catalog maintenance; reward delivery stays in the quest claim path. */
export const rewardPackagesRouter = createTRPCRouter({
  /** Load both catalogs in parallel after checking staff visibility. */
  getCatalog: protectedProcedure.query(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (!isStaffRole(user.role))
      throw serverError("FORBIDDEN", "Rewards are only available to staff");
    const [packages, nodes] = await Promise.all([
      ctx.drizzle.query.rewardPackage.findMany({
        orderBy: (table, { asc }) => [asc(table.name)],
      }),
      ctx.drizzle.query.rewardNode.findMany({
        orderBy: (table, { asc }) => [asc(table.name)],
      }),
    ]);
    return { packages, nodes };
  }),
  /** Save and audit a catalog source, preserving reputation amounts for restricted authors. */
  savePackage: protectedProcedure
    .input(SaveRewardPackage)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [user, entry, titleError] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        input.id
          ? ctx.drizzle.query.rewardPackage.findFirst({
              where: eq(rewardPackage.id, input.id),
            })
          : undefined,
        validateTitleRewardIds(ctx.drizzle, [input.data.rewards]),
      ]);
      if (user.isBanned || !canManageRewards(user.role))
        return errorResponse("Not allowed to maintain reward packages");
      if (input.id && !entry) return errorResponse("Reward package not found");
      if (titleError) return errorResponse(titleError);
      if (
        !canAwardReputation(user.role) &&
        input.data.rewards.reward_reputation !== (entry?.rewards.reward_reputation ?? 0)
      )
        return errorResponse("Not allowed to author reputation rewards");
      const id = entry?.id ?? nanoid();
      await Promise.all([
        entry
          ? ctx.drizzle
              .update(rewardPackage)
              .set({ ...input.data, updatedAt: new Date() })
              .where(eq(rewardPackage.id, id))
          : ctx.drizzle.insert(rewardPackage).values({ id, ...input.data }),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "rewardPackage",
          relatedId: id,
          relatedMsg: `${entry ? "Update" : "Create"}: ${input.data.name}`,
          changes: calculateContentDiff(entry ?? {}, input.data),
        }),
      ]);
      return { success: true, message: "Reward package saved" };
    }),
  /** Save and audit editor field groupings without changing any saved reward payload. */
  saveNode: protectedProcedure
    .input(SaveRewardNode)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [user, entry] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        input.id
          ? ctx.drizzle.query.rewardNode.findFirst({
              where: eq(rewardNode.id, input.id),
            })
          : undefined,
      ]);
      if (user.isBanned || !canManageRewards(user.role))
        return errorResponse("Not allowed to maintain reward nodes");
      if (input.id && !entry) return errorResponse("Reward node not found");
      const id = entry?.id ?? nanoid();
      await Promise.all([
        entry
          ? ctx.drizzle.update(rewardNode).set(input.data).where(eq(rewardNode.id, id))
          : ctx.drizzle.insert(rewardNode).values({ id, ...input.data }),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "rewardNode",
          relatedId: id,
          relatedMsg: `${entry ? "Update" : "Create"}: ${input.data.name}`,
          changes: calculateContentDiff(entry ?? {}, input.data),
        }),
      ]);
      return { success: true, message: "Reward node saved" };
    }),
  /** Delete only sources unused by visible, unexpired quests, using one guarded statement. */
  deletePackage: protectedProcedure
    .input(idSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.isBanned || !canManageRewards(user.role))
        return errorResponse("Not allowed to delete reward packages");
      // Snapshots retain their payload even if a hidden quest is saved concurrently with deletion.
      const result = await ctx.drizzle.delete(rewardPackage).where(
        and(
          eq(rewardPackage.id, input.id),
          notExists(
            ctx.drizzle
              .select({ id: quest.id })
              .from(quest)
              .where(
                and(
                  eq(quest.hidden, false),
                  or(isNull(quest.endsAt), gte(quest.endsAt, sql`CURRENT_DATE`)),
                  or(
                    sql`JSON_CONTAINS(COALESCE(JSON_EXTRACT(${quest.content}, '$.reward.reward_packages[*].packageId'), JSON_ARRAY()), JSON_QUOTE(${input.id})) = 1`,
                    sql`JSON_CONTAINS(COALESCE(JSON_EXTRACT(${quest.content}, '$.objectives[*].reward_packages[*].packageId'), JSON_ARRAY()), JSON_QUOTE(${input.id})) = 1`,
                  ),
                ),
              ),
          ),
        ),
      );
      if (result.rowsAffected === 0)
        return errorResponse(
          "Package not found or used by an active quest. Remove it from active quests first.",
        );
      await ctx.drizzle.insert(actionLog).values({
        id: nanoid(),
        userId: ctx.userId,
        tableName: "rewardPackage",
        relatedId: input.id,
        relatedMsg: "Delete reward package",
        changes: ["Deleted reward package"],
      });
      return { success: true, message: "Reward package deleted" };
    }),
  /** Remove a catalog grouping; existing rewards remain accessible through fallback groups. */
  deleteNode: protectedProcedure
    .input(idSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.isBanned || !canManageRewards(user.role))
        return errorResponse("Not allowed to delete reward nodes");
      await ctx.drizzle.delete(rewardNode).where(eq(rewardNode.id, input.id));
      await ctx.drizzle.insert(actionLog).values({
        id: nanoid(),
        userId: ctx.userId,
        tableName: "rewardNode",
        relatedId: input.id,
        relatedMsg: "Delete reward node",
        changes: ["Deleted reward node"],
      });
      return { success: true, message: "Reward node deleted" };
    }),
});

/**
 * Validate attachment identities, source approval and whole-bundle choice restrictions.
 * Restricted reputation amounts must match the saved snapshot or approved catalog source;
 * copied attachments can retain saved approval under fresh ids after catalog edits or deletion.
 * Independent nodes without a catalog source retain approval only under their own saved id.
 * @returns A recoverable save rejection, or null when every attachment is permitted.
 */
export const validateQuestRewardPackages = (
  content: QuestContentType,
  existing: QuestContentType,
  packages: (typeof rewardPackage.$inferSelect)[],
  role: UserRole,
): string | null => {
  const rewards = [content.reward, ...content.objectives];
  const oldRewards = [existing.reward, ...existing.objectives];
  const snapshots = rewards.flatMap((reward) => reward.reward_packages ?? []);
  const oldSnapshots = oldRewards.flatMap((reward) => reward.reward_packages ?? []);
  if (new Set(snapshots.map((pack) => pack.id)).size !== snapshots.length)
    return "Each package snapshot must have a unique id";
  for (const pack of snapshots) {
    // Catalog copies can match their source; independent nodes must match their exact saved identity.
    const old =
      oldSnapshots.find(
        (saved) => saved.id === pack.id && saved.packageId === pack.packageId,
      ) ??
      (pack.packageId
        ? oldSnapshots.find(
            (saved) =>
              saved.packageId === pack.packageId &&
              (canAwardReputation(role) ||
                saved.rewards.reward_reputation === pack.rewards.reward_reputation),
          )
        : undefined);
    const source = packages.find((source) => source.id === pack.packageId);
    if (pack.packageId && !source && !old)
      return "Reward package no longer exists. Select another package.";
    if (
      !canAwardReputation(role) &&
      pack.rewards.reward_reputation !==
        (old?.rewards.reward_reputation ?? source?.rewards.reward_reputation ?? 0)
    )
      return "Package reputation must match its approved snapshot";
    if (
      pack.rewards.reward_sage_modes.length > 1 &&
      content.rewardMode === "choose" &&
      content.reward.reward_packages?.includes(pack)
    )
      return "A reward choice package can contain at most one sage mode";
  }
  return null;
};
