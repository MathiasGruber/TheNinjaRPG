import { z } from "zod";
import { nanoid } from "nanoid";
import {
  linkPromotionSchema,
  linkPromotionReviewSchema,
} from "@/validators/linkPromotion";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { eq, desc, sql } from "drizzle-orm";
import { canReviewLinkPromotions } from "@/utils/permissions";
import { fetchUser } from "@/routers/profile";
import { linkPromotion, userData } from "@/drizzle/schema";
import { errorResponse, baseServerResponse } from "@/server/api/trpc";

export const linkPromotionRouter = createTRPCRouter({
  getLinkPromotions: protectedProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(500),
        userId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Query 1
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Query 2
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.linkPromotion.findMany({
        where: canReviewLinkPromotions(user.role)
          ? eq(linkPromotion.reviewed, false)
          : eq(linkPromotion.userId, input.userId),
        with: {
          user: {
            columns: { userId: true, username: true, avatar: true },
          },
          reviewer: {
            columns: { userId: true, username: true, avatar: true },
          },
        },
        offset: skip,
        limit: input.limit,
        orderBy: desc(linkPromotion.createdAt),
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return { data: results, nextCursor };
    }),

  submitLinkPromotion: protectedProcedure
    .input(linkPromotionSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const result = await ctx.drizzle.query.linkPromotion.findFirst({
        where: eq(linkPromotion.url, input.url),
      });
      // Guard
      if (result) return errorResponse("URL already submitted");
      // Mutate
      await ctx.drizzle.insert(linkPromotion).values({
        id: nanoid(),
        userId: ctx.userId,
        url: input.url,
        points: 0,
        reviewed: false,
      });
      return { success: true, message: "Summitted link" };
    }),

  reviewLinkPromotion: protectedProcedure
    .input(linkPromotionReviewSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, promotion] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.linkPromotion.findFirst({
          where: eq(linkPromotion.id, input.id),
        }),
      ]);
      // Guard
      if (!promotion) return errorResponse("Could not find link");
      if (promotion.reviewed) return errorResponse("Already reviewed");
      if (!canReviewLinkPromotions(user.role)) {
        return errorResponse("Cannot review promotion links");
      }
      // Mutate
      await Promise.all([
        ctx.drizzle
          .update(linkPromotion)
          .set({
            points: input.points,
            reviewed: true,
            reviewedBy: ctx.userId,
            reviewedAt: new Date(),
          })
          .where(eq(linkPromotion.id, input.id)),
        ...(input.points > 0
          ? [
              ctx.drizzle
                .update(userData)
                .set({
                  reputationPoints: sql`reputationPoints + ${input.points || 0}`,
                  reputationPointsTotal: sql`reputationPointsTotal + ${input.points || 0}`,
                })
                .where(eq(userData.userId, promotion.userId)),
            ]
          : []),
      ]);
      return { success: true, message: `Reward for ${promotion.url}` };
    }),
});
