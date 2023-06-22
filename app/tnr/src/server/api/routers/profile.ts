import { z } from "zod";
import { eq, sql, inArray, and, or, like, desc } from "drizzle-orm";
import { secondsPassed } from "../../../utils/time";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError } from "../trpc";
import {
  userData,
  userAttribute,
  historicalAvatar,
  bugReport,
  bugVotes,
  reportLog,
  userReportComment,
  forumPost,
  conversationComment,
  user2conversation,
  userReport,
} from "../../../../drizzle/schema";
import type { DrizzleClient } from "../../db";
import type { inferRouterOutputs } from "@trpc/server";
import type { NavBarDropdownLink } from "../../../libs/menus";

export const profileRouter = createTRPCRouter({
  // Get all information on logged in user
  getUser: protectedProcedure.query(async ({ ctx }) => {
    // User
    const user = await ctx.drizzle.query.userData.findFirst({
      where: eq(userData.userId, ctx.userId),
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
    if (user?.updatedAt && user?.regenAt) {
      const sinceUpdate = secondsPassed(user.updatedAt);
      if (sinceUpdate > 300) {
        console.log(sinceUpdate, user.updatedAt);
        const regen = user.regeneration * secondsPassed(user.regenAt);
        await ctx.drizzle
          .update(userData)
          .set({
            curHealth: Math.min(user.curHealth + regen, user.maxHealth),
            curStamina: Math.min(user.curStamina + regen, user.maxStamina),
            curChakra: Math.min(user.curChakra + regen, user.maxChakra),
            updatedAt: new Date(),
          })
          .where(eq(userData.userId, ctx.userId));
      }
    }

    // Notifications
    const notifications: NavBarDropdownLink[] = [];
    if (user) {
      // Get number of un-resolved user reports
      // TODO: Get number of records from KV store to speed up
      if (user.role === "MODERATOR" || user.role === "ADMIN") {
        const reportCounts = await ctx.drizzle
          .select({ count: sql<number>`count(*)` })
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
    }
    return { userData: user, notifications: notifications };
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
        orderBy: z.enum(["updatedAt", "level", "reputationPointsTotal"]),
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
          case "updatedAt":
            return desc(userData.updatedAt);
          case "level":
            return desc(userData.level);
          case "reputationPointsTotal":
            return desc(userData.reputationPointsTotal);
        }
      };
      const users = await ctx.drizzle.query.userData.findMany({
        where: and(
          ...(input.username !== undefined
            ? [like(userData.username, `%${input.username}%`)]
            : []),
          eq(userData.approvedTos, 1),
          eq(userData.isAi, 0)
        ),
        columns: {
          userId: true,
          username: true,
          avatar: true,
          rank: true,
          level: true,
          updatedAt: true,
          reputationPointsTotal: true,
        },
        offset: skip,
        limit: input.limit,
        orderBy: [getOrder()],
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
      await tx.delete(bugReport).where(eq(bugReport.userId, ctx.userId));
      await tx.delete(bugVotes).where(eq(bugVotes.userId, ctx.userId));
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
    throw new Error("User not found");
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
