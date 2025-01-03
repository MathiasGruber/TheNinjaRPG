import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { canReviewLinkPromotions } from "@/utils/permissions";
import { TRPCError } from "@trpc/server";

export const linkPromotionRouter = createTRPCRouter({
  getLinkPromotions: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.number().nullish(),
        userId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 50;
      const { cursor } = input;

      const items = await ctx.prisma.linkPromotion.findMany({
        take: limit + 1,
        where: {
          userId: input.userId,
        },
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: {
          createdAt: "desc",
        },
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop();
        nextCursor = nextItem!.id;
      }

      return {
        data: items,
        nextCursor,
      };
    }),

  submitLinkPromotion: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.linkPromotion.create({
        data: {
          userId: ctx.session.user.id,
          url: input.url,
        },
      });
    }),

  reviewLinkPromotion: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        points: z.number().min(0).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!canReviewLinkPromotions(ctx.session.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to review link promotions",
        });
      }

      const promotion = await ctx.prisma.linkPromotion.update({
        where: { id: input.id },
        data: {
          points: input.points,
          reviewed: true,
          reviewedBy: ctx.session.user.id,
          reviewedAt: new Date(),
        },
      });

      // Add reputation points to user
      if (input.points > 0) {
        await ctx.prisma.userReward.create({
          data: {
            userId: promotion.userId,
            type: "LINK_PROMOTION",
            amount: input.points,
            description: `Link promotion reward for ${promotion.url}`,
          },
        });
      }

      return promotion;
    }),
});
