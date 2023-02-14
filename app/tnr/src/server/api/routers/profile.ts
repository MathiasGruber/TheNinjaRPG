import { z } from "zod";

import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { registrationSchema } from "../../../validators/register";
import { createAvatar, fetchAvatar, getPrompt } from "../../../libs/replicate";
import { uploadAvatar } from "../../../libs/aws";

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
  // Create avatar
  createAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    // Check if user has any popularity points
    const currentUser = await ctx.prisma.userData.findUnique({
      where: { userId: ctx.session.user.id },
    });
    if (!currentUser || currentUser?.popularity_points <= 0) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "You do not have any popularity points",
      });
    }
    // Set user avatar to undefined
    await ctx.prisma.userData.update({
      where: {
        userId: ctx.session.user.id,
      },
      data: {
        avatar: undefined,
        popularity_points: currentUser.popularity_points - 1,
      },
    });
    // Get prompt
    const prompt = await getPrompt(ctx, currentUser);
    // Create avatar, rerun if NSFW
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
    let result = await createAvatar(prompt);
    let counter = 0;
    while (result.status !== "succeeded") {
      // If failed or canceled, rerun
      if (result.status == "failed" || result.status == "canceled") {
        counter += 1;
        if (counter > 5) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Your avatar could not be created with 5 attempts",
          });
        }
        result = await createAvatar(prompt);
      }
      // If starting or processing, just wait
      if (result.status == "starting" || result.status == "processing") {
        await sleep(2000);
        result = await fetchAvatar(result.id);
      }
      // If succeeded, download image and upload to S3
      if (result.status == "succeeded" && result.output?.[0]) {
        const s3_avatar = await uploadAvatar(result.output[0], result.id);
        await ctx.prisma.userData.update({
          where: { userId: ctx.session.user.id },
          data: { avatar: s3_avatar },
        });
        await ctx.prisma.historicalAvatar.create({
          data: {
            avatar: s3_avatar,
            userId: ctx.session.user.id,
          },
        });
        break;
      }
    }
  }),
  // Get previous avatars
  getHistoricalAvatars: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.historicalAvatar.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
    });
  }),
  // Update user avatar based on hisotical avatar
  updateAvatar: protectedProcedure
    .input(z.object({ avatar: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check if avatar exists
      const avatar = await ctx.prisma.historicalAvatar.findUniqueOrThrow({
        where: { id: input.avatar },
      });
      // Update user avatar
      return ctx.prisma.userData.update({
        where: { userId: ctx.session.user.id },
        data: { avatar: avatar.avatar },
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
