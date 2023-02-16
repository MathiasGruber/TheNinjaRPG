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
  // Get public information on a user
  getPublicUser: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.userData.findUnique({
        where: { userId: input.userId },
        select: {
          gender: true,
          cur_health: true,
          max_health: true,
          cur_stamina: true,
          max_stamina: true,
          cur_chakra: true,
          max_chakra: true,
          level: true,
          village: true,
        },
      });
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
