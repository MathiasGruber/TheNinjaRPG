import { z } from "zod";
import { eq } from "drizzle-orm";
import { ReportAction } from "@prisma/client";
import { UserStatus, type PrismaClient } from "@prisma/client";
import type { inferRouterOutputs } from "@trpc/server";
import { type NavBarDropdownLink } from "../../../libs/menus";
import { secondsPassed } from "../../../utils/time";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  serverError,
} from "../trpc";
import { userData } from "../../../../drizzle/schema";

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
        const userReports = await ctx.prisma.userReport.count({
          where: {
            status: {
              in: [ReportAction.UNVIEWED, ReportAction.BAN_ESCALATED],
            },
          },
        });
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
      if (user.status === UserStatus.BATTLE) {
        notifications?.push({
          href: "/combat",
          name: "In combat",
          color: "red",
        });
      }
      // Is in hospital
      if (user.status === UserStatus.HOSPITALIZED) {
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
    return ctx.prisma.userAttribute.findMany({
      where: { userId: ctx.userId },
      distinct: ["attribute"],
    });
  }),
  // Check if username exists in database already
  getUsername: publicProcedure
    .input(
      z.object({
        username: z.string().trim(),
      })
    )
    .query(async ({ ctx, input }) => {
      return await ctx.prisma.userData.findUnique({
        where: { username: input.username },
      });
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
      return await ctx.prisma.userData.findMany({
        where: {
          username: {
            contains: input.username,
          },
          approved_tos: true,
          ...(input.showYourself ? {} : { userId: { not: ctx.userId } }),
        },
        select: {
          userId: true,
          username: true,
          avatar: true,
          rank: true,
          level: true,
          federalStatus: true,
        },
        take: 5,
      });
    }),
  // Get public information on a user
  getPublicUser: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.userData.findUnique({
        where: { userId: input.userId },
        select: {
          userId: true,
          username: true,
          gender: true,
          status: true,
          rank: true,
          cur_health: true,
          max_health: true,
          cur_stamina: true,
          max_stamina: true,
          cur_chakra: true,
          max_chakra: true,
          level: true,
          village: true,
          reputation_points: true,
          popularity_points: true,
          experience: true,
          bloodline: true,
          avatar: true,
          federalStatus: true,
        },
      });
    }),
  // Get public users
  getPublicUsers: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        orderBy: z.enum(["updatedAt", "level", "reputation_points_total"]),
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
      const users = await ctx.prisma.userData.findMany({
        skip: skip,
        take: input.limit,
        where: {
          ...(input.username !== undefined
            ? {
                username: {
                  contains: input.username,
                },
              }
            : {}),
        },
        select: {
          userId: true,
          username: true,
          avatar: true,
          rank: true,
          level: true,
          updatedAt: true,
          reputation_points_total: true,
        },
        orderBy: { [input.orderBy]: "desc" },
      });
      const nextCursor = users.length < input.limit ? null : currentCursor + 1;
      return {
        data: users,
        nextCursor: nextCursor,
      };
    }),
  // Toggle deletion of user
  toggleDeletionTimer: protectedProcedure.mutation(async ({ ctx }) => {
    const currentUser = await ctx.prisma.userData.findUniqueOrThrow({
      where: { userId: ctx.userId },
    });
    await ctx.prisma.userData.update({
      where: { userId: ctx.userId },
      data: {
        ...(currentUser.deletionAt
          ? { deletionAt: null }
          : { deletionAt: new Date(new Date().getTime() + 2 * 86400000) }),
      },
    });
  }),
  // Delete user
  cofirmDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    const currentUser = await ctx.prisma.userData.findUniqueOrThrow({
      where: { userId: ctx.userId },
    });
    if (!currentUser.deletionAt || currentUser.deletionAt > new Date()) {
      throw serverError("PRECONDITION_FAILED", "Deletion timer not passed yet");
    }
    await ctx.prisma.$transaction([
      ctx.prisma.userData.delete({
        where: { userId: ctx.userId },
      }),
      ctx.prisma.userAttribute.deleteMany({
        where: { userId: ctx.userId },
      }),
      ctx.prisma.historicalAvatar.deleteMany({
        where: { userId: ctx.userId },
      }),
      ctx.prisma.bugReport.deleteMany({
        where: { userId: ctx.userId },
      }),
      ctx.prisma.bugVotes.deleteMany({
        where: { userId: ctx.userId },
      }),
      ctx.prisma.reportLog.deleteMany({
        where: {
          OR: [{ targetUserId: ctx.userId }, { staffUserId: ctx.userId }],
        },
      }),
      ctx.prisma.userReport.deleteMany({
        where: { reportedUserId: ctx.userId },
      }),
      ctx.prisma.userReportComment.deleteMany({
        where: { userId: ctx.userId },
      }),
      ctx.prisma.forumPost.deleteMany({
        where: { userId: ctx.userId },
      }),
      ctx.prisma.conversationComment.deleteMany({
        where: { userId: ctx.userId },
      }),
      ctx.prisma.usersInConversation.deleteMany({
        where: { userId: ctx.userId },
      }),
    ]);
  }),
});

/**
 * Fetches user by id
 */
export const fetchUser = async (client: PrismaClient, id: string) => {
  return await client.userData.findUniqueOrThrow({
    where: { userId: id },
  });
};

type RouterOutput = inferRouterOutputs<typeof profileRouter>;
export type UserWithRelations = RouterOutput["getUser"]["userData"];
