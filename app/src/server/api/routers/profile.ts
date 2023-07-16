import { z } from "zod";
import { eq, sql, and, or, like, desc, isNull, isNotNull } from "drizzle-orm";
import { inArray, notInArray } from "drizzle-orm";
import { secondsPassed } from "../../../utils/time";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError, baseServerResponse } from "../trpc";
import {
  userData,
  userAttribute,
  historicalAvatar,
  reportLog,
  userReportComment,
  forumPost,
  conversationComment,
  user2conversation,
  userReport,
} from "../../../../drizzle/schema";
import { ENERGY_SPENT_PER_SECOND } from "../../../libs/train";
import { calcLevelRequirements } from "../../../libs/profile";
import { calcHP, calcSP, calcCP } from "../../../libs/profile";
import { UserStatNames } from "../../../../drizzle/constants";
import type { DrizzleClient } from "../../db";
import type { inferRouterOutputs } from "@trpc/server";
import type { NavBarDropdownLink } from "../../../libs/menus";

export const profileRouter = createTRPCRouter({
  // Start training of a specific attribute
  startTraining: protectedProcedure
    .input(z.object({ stat: z.enum(UserStatNames) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchRegeneratedUser(ctx.drizzle, ctx.userId, true);
      if (!user) {
        throw serverError("NOT_FOUND", "User not found");
      }
      if (user.curEnergy < 1) {
        return { success: false, message: "Not enough energy" };
      }
      const result = await ctx.drizzle
        .update(userData)
        .set({ trainingStartedAt: new Date(), currentlyTraining: input.stat })
        .where(
          and(eq(userData.userId, ctx.userId), isNull(userData.currentlyTraining))
        );
      if (result.rowsAffected === 0) {
        return { success: false, message: "You are already training" };
      } else {
        return { success: true, message: `Started training` };
      }
    }),
  // Stop training
  stopTraining: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      const user = await fetchRegeneratedUser(ctx.drizzle, ctx.userId, true);
      if (!user) {
        throw serverError("NOT_FOUND", "User not found");
      }
      if (user.status === "BATTLE") {
        return { success: false, message: "You cannot stop training while in battle" };
      }
      if (!user.trainingStartedAt || !user.currentlyTraining) {
        return { success: false, message: "You are not currently training anything" };
      }
      const secondsPassed = (Date.now() - user.trainingStartedAt.getTime()) / 1000;
      const trainingAmount = Math.min(
        Math.floor(ENERGY_SPENT_PER_SECOND * secondsPassed),
        user.curEnergy
      );
      const result = await ctx.drizzle
        .update(userData)
        .set({
          trainingStartedAt: null,
          currentlyTraining: null,
          curEnergy: sql`curEnergy - ${trainingAmount}`,
          experience: sql`experience + ${trainingAmount}`,
          strength:
            user.currentlyTraining === "strength"
              ? sql`strength + ${trainingAmount}`
              : sql`strength`,
          intelligence:
            user.currentlyTraining === "intelligence"
              ? sql`intelligence + ${trainingAmount}`
              : sql`intelligence`,
          willpower:
            user.currentlyTraining === "willpower"
              ? sql`willpower + ${trainingAmount}`
              : sql`willpower`,
          speed:
            user.currentlyTraining === "speed"
              ? sql`speed + ${trainingAmount}`
              : sql`speed`,
          ninjutsuOffence:
            user.currentlyTraining === "ninjutsuOffence"
              ? sql`ninjutsuOffence + ${trainingAmount}`
              : sql`ninjutsuOffence`,
          ninjutsuDefence:
            user.currentlyTraining === "ninjutsuDefence"
              ? sql`ninjutsuDefence + ${trainingAmount}`
              : sql`ninjutsuDefence`,
          genjutsuOffence:
            user.currentlyTraining === "genjutsuOffence"
              ? sql`genjutsuOffence + ${trainingAmount}`
              : sql`genjutsuOffence`,
          genjutsuDefence:
            user.currentlyTraining === "genjutsuDefence"
              ? sql`genjutsuDefence + ${trainingAmount}`
              : sql`genjutsuDefence`,
          taijutsuOffence:
            user.currentlyTraining === "taijutsuOffence"
              ? sql`taijutsuOffence + ${trainingAmount}`
              : sql`taijutsuOffence`,
          taijutsuDefence:
            user.currentlyTraining === "taijutsuDefence"
              ? sql`taijutsuDefence + ${trainingAmount}`
              : sql`taijutsuDefence`,
          bukijutsuDefence:
            user.currentlyTraining === "bukijutsuDefence"
              ? sql`bukijutsuDefence + ${trainingAmount}`
              : sql`bukijutsuDefence`,
          bukijutsuOffence:
            user.currentlyTraining === "bukijutsuOffence"
              ? sql`bukijutsuOffence + ${trainingAmount}`
              : sql`bukijutsuOffence`,
        })
        .where(
          and(eq(userData.userId, ctx.userId), isNotNull(userData.currentlyTraining))
        );
      if (result.rowsAffected === 0) {
        return { success: false, message: "You are not training" };
      } else {
        return {
          success: true,
          message: `You gained ${trainingAmount} ${user.currentlyTraining}`,
        };
      }
    }),
  // Update user with new level
  levelUp: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    const expRequired = calcLevelRequirements(user.level) - user.experience;
    if (expRequired > 0) {
      throw serverError("PRECONDITION_FAILED", "Not enough experience to level up");
    }
    const newLevel = user.level + 1;
    const result = await ctx.drizzle
      .update(userData)
      .set({
        level: newLevel,
        maxHealth: calcHP(newLevel),
        maxStamina: calcSP(newLevel),
        maxChakra: calcCP(newLevel),
      })
      .where(and(eq(userData.userId, ctx.userId), eq(userData.level, user.level)));
    return result.rowsAffected === 0 ? user.level : newLevel;
  }),
  // Get all information on logged in user
  getUser: protectedProcedure.query(async ({ ctx }) => {
    const user = await fetchRegeneratedUser(ctx.drizzle, ctx.userId);
    const notifications: NavBarDropdownLink[] = [];
    if (user) {
      // Get number of un-resolved user reports
      // TODO: Get number of records from KV store to speed up
      if (user.role === "MODERATOR" || user.role === "ADMIN") {
        const reportCounts = await ctx.drizzle
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(userReport)
          .where(inArray(userReport.status, ["UNVIEWED", "BAN_ESCALATED"]));
        const userReports = reportCounts?.[0]?.count || 0;
        if (userReports > 0) {
          notifications.push({
            href: "/reports",
            name: `${userReports} waiting!`,
            color: "blue",
          });
        }
      }
      // Check if user is banned
      if (user.isBanned) {
        notifications.push({
          href: "/reports",
          name: "You are banned!",
          color: "red",
        });
      }
      // Add deletion timer to notifications
      if (user?.deletionAt) {
        notifications?.push({
          href: "/profile",
          name: "Being deleted",
          color: "red",
        });
      }
      // Is in combat
      if (user.status === "BATTLE") {
        notifications?.push({
          href: "/combat",
          name: "In combat",
          color: "red",
        });
      }
      // Is in hospital
      if (user.status === "HOSPITALIZED") {
        notifications?.push({
          href: "/hospital",
          name: "In hospital",
          color: "red",
        });
      }
      // Stuff in inbox
      if (user.inboxNews > 0) {
        notifications?.push({
          href: "/inbox",
          name: `${user.inboxNews} new messages`,
          color: "green",
        });
      }
    }
    return { userData: user, notifications: notifications, serverTime: Date.now() };
  }),
  // Get user attributes
  getUserAttributes: protectedProcedure.query(async ({ ctx }) => {
    return fetchAttributes(ctx.drizzle, ctx.userId);
  }),
  // Check if username exists in database already
  getUsername: publicProcedure
    .input(
      z.object({
        username: z.string().trim(),
      })
    )
    .query(async ({ ctx, input }) => {
      const username = await ctx.drizzle.query.userData.findFirst({
        columns: { username: true },
        where: eq(userData.username, input.username),
      });
      if (username) return username;
      return null;
    }),
  // Return list of 5 most similar users in database
  searchUsers: protectedProcedure
    .input(
      z.object({
        username: z.string().trim(),
        showYourself: z.boolean(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.drizzle.query.userData.findMany({
        columns: {
          userId: true,
          username: true,
          avatar: true,
          rank: true,
          level: true,
          role: true,
          federalStatus: true,
        },
        where: and(
          like(userData.username, `%${input.username}%`),
          eq(userData.approvedTos, 1),
          ...(input.showYourself ? [] : [sql`${userData.userId} != ${ctx.userId}`])
        ),
        limit: 5,
      });
    }),
  // Get public information on a user
  getPublicUser: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.drizzle.query.userData.findFirst({
        where: and(eq(userData.userId, input.userId)),
        columns: {
          userId: true,
          username: true,
          gender: true,
          status: true,
          rank: true,
          curHealth: true,
          maxHealth: true,
          curStamina: true,
          maxStamina: true,
          curChakra: true,
          maxChakra: true,
          level: true,
          role: true,
          reputationPoints: true,
          popularityPoints: true,
          experience: true,
          avatar: true,
          federalStatus: true,
        },
        with: {
          village: true,
          bloodline: true,
        },
      });
    }),
  // Get public users
  getPublicUsers: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        orderBy: z.enum(["Online", "Strongest", "Staff"]),
        username: z
          .string()
          .regex(new RegExp("^[a-zA-Z0-9_]*$"), {
            message: "Must only contain alphanumeric characters and no spaces",
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const getOrder = () => {
        switch (input.orderBy) {
          case "Online":
            return [desc(userData.updatedAt)];
          case "Strongest":
            return [desc(userData.level), desc(userData.experience)];
          case "Staff":
            return [desc(userData.role)];
        }
      };
      const users = await ctx.drizzle.query.userData.findMany({
        where: and(
          ...(input.username !== undefined
            ? [like(userData.username, `%${input.username}%`)]
            : []),
          ...(input.orderBy === "Staff" ? [notInArray(userData.role, ["USER"])] : []),
          eq(userData.approvedTos, 1),
          eq(userData.isAi, 0)
        ),
        columns: {
          userId: true,
          username: true,
          avatar: true,
          rank: true,
          level: true,
          role: true,
          experience: true,
          updatedAt: true,
          reputationPointsTotal: true,
        },
        offset: skip,
        limit: input.limit,
        orderBy: getOrder(),
      });
      const nextCursor = users.length < input.limit ? null : currentCursor + 1;
      return {
        data: users,
        nextCursor: nextCursor,
      };
    }),
  // Toggle deletion of user
  toggleDeletionTimer: protectedProcedure.mutation(async ({ ctx }) => {
    const currentUser = await fetchUser(ctx.drizzle, ctx.userId);
    return ctx.drizzle
      .update(userData)
      .set({
        deletionAt: currentUser.deletionAt
          ? null
          : new Date(new Date().getTime() + 2 * 86400000),
      })
      .where(eq(userData.userId, ctx.userId));
  }),
  // Delete user
  confirmDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    const currentUser = await fetchUser(ctx.drizzle, ctx.userId);
    if (!currentUser.deletionAt || currentUser.deletionAt > new Date()) {
      throw serverError("PRECONDITION_FAILED", "Deletion timer not passed yet");
    }
    await ctx.drizzle.transaction(async (tx) => {
      await tx.delete(userData).where(eq(userData.userId, ctx.userId));
      await tx.delete(userAttribute).where(eq(userAttribute.userId, ctx.userId));
      await tx.delete(historicalAvatar).where(eq(historicalAvatar.userId, ctx.userId));
      await tx
        .delete(userReportComment)
        .where(eq(userReportComment.userId, ctx.userId));
      await tx.delete(forumPost).where(eq(forumPost.userId, ctx.userId));
      await tx
        .delete(conversationComment)
        .where(eq(conversationComment.userId, ctx.userId));
      await tx
        .delete(user2conversation)
        .where(eq(user2conversation.userId, ctx.userId));
      await tx
        .delete(reportLog)
        .where(
          or(
            eq(reportLog.targetUserId, ctx.userId),
            eq(reportLog.staffUserId, ctx.userId)
          )
        );
    });
  }),
});

export const fetchUser = async (client: DrizzleClient, userId: string) => {
  const user = await client.query.userData.findFirst({
    where: eq(userData.userId, userId),
  });
  if (!user) {
    throw new Error(`fetchUser: User not found: ${userId}`);
  }
  return user;
};

/**
 * Fetch user with bloodline & village relations. Occasionally updates the user with regeneration
 * of pools, or optionally forces regeneration with forceRegen=true
 */
export const fetchRegeneratedUser = async (
  client: DrizzleClient,
  userId: string,
  forceRegen = false
) => {
  // Ensure we can fetch the user
  const user = await client.query.userData.findFirst({
    where: eq(userData.userId, userId),
    with: { bloodline: true, village: true },
  });

  // Add bloodline regen to regeneration
  // NOTE: We add this here, so that the "actual" current pools can be calculated on frontend,
  //       and we can avoid running an database UPDATE on each load
  if (user?.bloodline?.regenIncrease) {
    user.regeneration = user.regeneration + user.bloodline.regenIncrease;
  }
  // If more than 5min since last user update, update the user with regen. We do not need this to be synchronous
  // and it is mostly done to keep user updated on the overview pages
  if (user) {
    const sinceUpdate = secondsPassed(user.updatedAt);
    if (sinceUpdate > 300 || forceRegen) {
      const regen = user.regeneration * secondsPassed(user.regenAt);
      user.curHealth = Math.min(user.curHealth + regen, user.maxHealth);
      user.curStamina = Math.min(user.curStamina + regen, user.maxStamina);
      user.curChakra = Math.min(user.curChakra + regen, user.maxChakra);
      if (!user.currentlyTraining) {
        user.curEnergy = Math.min(user.curEnergy + regen, user.maxEnergy);
      }
      user.updatedAt = new Date();
      user.regenAt = new Date();
      await client
        .update(userData)
        .set({
          curHealth: user.curHealth,
          curStamina: user.curStamina,
          curChakra: user.curChakra,
          curEnergy: user.curEnergy,
          updatedAt: user.updatedAt,
          regenAt: user.regenAt,
        })
        .where(eq(userData.userId, userId));
    }
  }
  return user;
};

export const fetchAttributes = async (client: DrizzleClient, userId: string) => {
  return await client.query.userAttribute.findMany({
    where: eq(userAttribute.userId, userId),
  });
};

type RouterOutput = inferRouterOutputs<typeof profileRouter>;
export type UserWithRelations = RouterOutput["getUser"]["userData"];
