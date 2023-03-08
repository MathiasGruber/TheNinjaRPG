import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { registrationSchema } from "../../../validators/register";

export const profileRouter = createTRPCRouter({
  // Get all information on logged in user
  getUser: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.userData.findUnique({
      where: { userId: ctx.session.user.id },
      include: {
        village: true,
        bloodline: true,
      },
    });
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
      })
    )
    .query(async ({ ctx, input }) => {
      return await ctx.prisma.userData.findMany({
        where: {
          username: {
            contains: input.username,
          },
          approved_tos: true,
          NOT: { userId: ctx.session.user.id },
        },
        select: { userId: true, username: true, avatar: true, rank: true, level: true },
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
});
