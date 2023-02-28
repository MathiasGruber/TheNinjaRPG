import { z } from "zod";

import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
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
      throw serverError("FORBIDDEN", "Not enough pop points");
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
          throw serverError("TIMEOUT", "Could not be created with 5 attempts");
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
  getHistoricalAvatars: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.number().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 50;
      const { cursor } = input;
      const avatars = await ctx.prisma.historicalAvatar.findMany({
        take: limit + 1,
        where: { userId: ctx.session.user.id },
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: "desc" },
      });
      // Next cursor
      let nextCursor: typeof cursor | undefined = undefined;
      if (avatars.length > limit) {
        const nextItem = avatars.pop();
        nextCursor = nextItem?.id;
      }
      // Return data and next cursor
      return {
        data: avatars,
        nextCursor,
      };
    }),
  // Update user avatar based on hisotical avatar
  updateAvatar: protectedProcedure
    .input(z.object({ avatar: z.number() }))
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
