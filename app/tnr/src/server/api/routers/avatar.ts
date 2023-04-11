import { z } from "zod";

import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { updateAvatar, checkAvatar } from "../../../libs/replicate";

export const avatarRouter = createTRPCRouter({
  createAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    // Check if user has any popularity points
    const currentUser = await ctx.prisma.userData.findUniqueOrThrow({
      where: { userId: ctx.userId },
    });
    if (currentUser?.popularity_points <= 0) {
      throw serverError("FORBIDDEN", "Not enough pop points");
    }
    // Set user avatar to undefined
    await ctx.prisma.userData.update({
      where: {
        userId: ctx.userId,
      },
      data: {
        avatar: undefined,
        popularity_points: currentUser.popularity_points - 1,
      },
    });
    // Update avatar
    await updateAvatar(ctx.prisma, currentUser);
  }),
  // Check if avatar is finished, and return URL if so. Otherwise, wait or restart
  checkAvatar: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.prisma.userData.findUniqueOrThrow({
        where: { userId: input.userId },
      });
      const entry = await checkAvatar(ctx.prisma, currentUser);
      return { url: entry?.avatar };
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
        where: { userId: ctx.userId, done: true, avatar: { not: null } },
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
        where: { userId: ctx.userId },
        data: { avatar: avatar.avatar },
      });
    }),
});
