import { z } from "zod";

import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { createAvatar, fetchAvatar, getPrompt } from "../../../libs/replicate";
import { uploadAvatar } from "../../../libs/aws";

export const avatarRouter = createTRPCRouter({
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
});
