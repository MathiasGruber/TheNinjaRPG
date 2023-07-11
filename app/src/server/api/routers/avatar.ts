import { z } from "zod";
import { eq, sql, gt, and, isNotNull, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { updateAvatar, checkAvatar } from "../../../libs/replicate";
import { fetchUser } from "./profile";
import { userData, historicalAvatar } from "../../../../drizzle/schema";

export const avatarRouter = createTRPCRouter({
  createAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    const currentUser = await fetchUser(ctx.drizzle, ctx.userId);
    if (currentUser.reputationPoints < 1) {
      throw serverError("PRECONDITION_FAILED", "Not enough reputation points");
    }
    const result = await ctx.drizzle
      .update(userData)
      .set({
        avatar: null,
        reputationPoints: sql`${userData.reputationPoints} - 1`,
      })
      .where(and(eq(userData.userId, ctx.userId), gt(userData.reputationPoints, 0)));
    if (result.rowsAffected === 1) {
      await updateAvatar(ctx.drizzle, currentUser);
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
      })
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 50;
      const { cursor } = input;
      const avatars = await ctx.drizzle.query.historicalAvatar.findMany({
        where: and(
          eq(historicalAvatar.userId, ctx.userId),
          eq(historicalAvatar.done, 1),
          isNotNull(historicalAvatar.avatar)
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
    .mutation(async ({ ctx, input }) => {
      const avatar = await ctx.drizzle.query.historicalAvatar.findFirst({
        where: eq(historicalAvatar.id, input.avatar),
      });
      if (!avatar) throw serverError("PRECONDITION_FAILED", "Avatar not found");
      await ctx.drizzle
        .update(userData)
        .set({ avatar: avatar.avatar })
        .where(eq(userData.userId, ctx.userId));
    }),
});
