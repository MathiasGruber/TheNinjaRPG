import { z } from "zod";
import { ReportAction } from "@prisma/client";
import { type NavBarDropdownLink } from "../../../libs/menus";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  serverError,
} from "../trpc";
import { registrationSchema } from "../../../validators/register";

export const profileRouter = createTRPCRouter({
  // Get all information on logged in user
  getUser: protectedProcedure.query(async ({ ctx }) => {
    // User
    const user = await ctx.prisma.userData.findUnique({
      where: { userId: ctx.session.user.id },
      include: {
        village: true,
        bloodline: true,
      },
    });
    // Notifications
    const notifications: NavBarDropdownLink[] = [];
    // Get number of un-resolved user reports
    if (ctx.session.user.role === "MODERATOR" || ctx.session.user.role === "ADMIN") {
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
    if (ctx.session.user.isBanned) {
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
    return { userData: user, notifications: notifications };
  }),
  // Get user attributes
  getUserAttributes: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.userAttribute.findMany({
      where: { userId: ctx.session.user.id },
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
          ...(input.showYourself ? {} : { userId: { not: ctx.session.user.id } }),
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
          pvp_experience: true,
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
  // Create Character
  createCharacter: protectedProcedure
    .input(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      // Create user
      const user = await ctx.prisma.userData.create({
        data: {
          villageId: input.village,
          username: input.username,
          gender: input.gender,
          userId: ctx.session.user.id,
          approved_tos: true,
        },
      });
      // Unique attributes
      const unique_attributes = [
        ...new Set([
          input.attribute_1,
          input.attribute_2,
          input.attribute_3,
          input.hair_color + " hair",
          input.eye_color + " eyes",
          input.skin_color + " skin",
        ]),
      ];
      // Create user attributes
      await ctx.prisma.userAttribute.createMany({
        data: unique_attributes.map((attribute) => ({
          attribute,
          userId: ctx.session.user.id,
        })),
        skipDuplicates: true,
      });
      return user;
    }),
  toggleDeletionTimer: protectedProcedure.mutation(async ({ ctx }) => {
    const currentUser = await ctx.prisma.userData.findUniqueOrThrow({
      where: { userId: ctx.session.user.id },
    });
    await ctx.prisma.userData.update({
      where: { userId: ctx.session.user.id },
      data: {
        ...(currentUser.deletionAt
          ? { deletionAt: null }
          : { deletionAt: new Date(new Date().getTime() + 2 * 86400000) }),
      },
    });
  }),
  cofirmDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    const currentUser = await ctx.prisma.userData.findUniqueOrThrow({
      where: { userId: ctx.session.user.id },
    });
    if (!currentUser.deletionAt || currentUser.deletionAt > new Date()) {
      throw serverError("PRECONDITION_FAILED", "Deletion timer not passed yet");
    }
    await ctx.prisma.$transaction([
      ctx.prisma.userData.delete({
        where: { userId: ctx.session.user.id },
      }),
      ctx.prisma.userAttribute.deleteMany({
        where: { userId: ctx.session.user.id },
      }),
      ctx.prisma.user.delete({
        where: { id: ctx.session.user.id },
      }),
      ctx.prisma.historicalAvatar.deleteMany({
        where: { userId: ctx.session.user.id },
      }),
      ctx.prisma.bugReport.deleteMany({
        where: { userId: ctx.session.user.id },
      }),
      ctx.prisma.bugVotes.deleteMany({
        where: { userId: ctx.session.user.id },
      }),
      ctx.prisma.reportLog.deleteMany({
        where: {
          OR: [
            { targetUserId: ctx.session.user.id },
            { staffUserId: ctx.session.user.id },
          ],
        },
      }),
      ctx.prisma.userReport.deleteMany({
        where: { reportedUserId: ctx.session.user.id },
      }),
      ctx.prisma.userReportComment.deleteMany({
        where: { userId: ctx.session.user.id },
      }),
      ctx.prisma.forumPost.deleteMany({
        where: { userId: ctx.session.user.id },
      }),
      ctx.prisma.conversationComment.deleteMany({
        where: { userId: ctx.session.user.id },
      }),
      ctx.prisma.usersInConversation.deleteMany({
        where: { userId: ctx.session.user.id },
      }),
    ]);
  }),
});
