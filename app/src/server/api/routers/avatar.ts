import { z } from "zod";
import { eq, sql, gt, and, isNotNull, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/api/trpc";
import { baseServerResponse, errorResponse } from "@/api/trpc";
import { updateAvatar, checkAvatar } from "@/libs/replicate";
import { fetchUser } from "@/routers/profile";
import { userData, historicalAvatar } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";

export const avatarRouter = createTRPCRouter({
  createAvatar: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      // Fetch
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Guard
      if (user.reputationPoints < 1) {
        return errorResponse("Not enough reputation points");
      }
      if (user.isBanned) return errorResponse("You are banned");
      // Mutate
      const result = await ctx.drizzle
        .update(userData)
        .set({
          avatar: null,
          reputationPoints: sql`${userData.reputationPoints} - 1`,
        })
        .where(and(eq(userData.userId, ctx.userId), gt(userData.reputationPoints, 0)));
      if (result.rowsAffected === 1) {
        await updateAvatar(ctx.drizzle, user);
        return { success: true, message: "Avatar created" };
      } else {
        return errorResponse("Failed to upload avatar");
      }
    }),
  checkAvatar: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await fetchUser(ctx.drizzle, input.userId);
      const avatarUrl = await checkAvatar(ctx.drizzle, currentUser);
      return { url: avatarUrl };
    }),
  getHistoricalAvatars: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.number().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 50;
      const { cursor } = input;
      const avatars = await ctx.drizzle.query.historicalAvatar.findMany({
        where: and(
          eq(historicalAvatar.userId, ctx.userId),
          eq(historicalAvatar.done, 1),
          isNotNull(historicalAvatar.avatar),
        ),
        offset: cursor ? cursor : 0,
        limit: limit + 1,
        orderBy: [desc(historicalAvatar.id)],
      });
      let nextCursor: typeof cursor | undefined = undefined;
      if (avatars.length > limit) {
        const nextItem = avatars.pop();
        nextCursor = nextItem?.id;
      }
      return {
        data: avatars,
        nextCursor,
      };
    }),
  updateAvatar: protectedProcedure
    .input(z.object({ avatar: z.number() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, avatar] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchAvatar(ctx.drizzle, input.avatar),
      ]);
      // Guard
      if (!avatar) return errorResponse("Avatar not found");
      if (avatar.userId !== ctx.userId) return errorResponse("Not yours");
      if (user.isBanned) return errorResponse("You are banned");
      // Mutation
      await ctx.drizzle
        .update(userData)
        .set({ avatar: avatar.avatar })
        .where(eq(userData.userId, ctx.userId));
      return { success: true, message: "Avatar updated" };
    }),
  deleteAvatar: protectedProcedure
    .input(z.object({ avatar: z.number() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const avatar = await fetchAvatar(ctx.drizzle, input.avatar);
      if (!avatar) {
        return errorResponse("Avatar not found");
      }
      if (avatar.userId !== ctx.userId) {
        return errorResponse("Not your avatar");
      }
      await ctx.drizzle
        .delete(historicalAvatar)
        .where(eq(historicalAvatar.id, input.avatar));
      return { success: true, message: "Avatar deleted" };
    }),
});

/**
 * Fetches the avatar with the specified ID from the database.
 *
 * @param client - The DrizzleClient instance used to query the database.
 * @param id - The ID of the avatar to fetch.
 * @returns A promise that resolves to the fetched avatar.
 */
export const fetchAvatar = async (client: DrizzleClient, id: number) => {
  return await client.query.historicalAvatar.findFirst({
    where: eq(historicalAvatar.id, id),
  });
};
