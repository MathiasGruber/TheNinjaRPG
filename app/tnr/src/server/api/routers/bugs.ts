import { z } from "zod";

import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { bugreportSchema } from "../../../validators/bugs";
import { createCommentSchema } from "../../../validators/bugs";

export const bugsRouter = createTRPCRouter({
  // Get all bugs in the system
  getAll: publicProcedure
    .input(
      z.object({
        is_active: z.boolean(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const bugs = await ctx.prisma.bugReport.findMany({
        skip: skip,
        take: input.limit,
        where: {
          is_resolved: !input.is_active,
        },
        include: {
          user: {
            select: {
              username: true,
              avatar: true,
              rank: true,
              level: true,
            },
          },
        },
        orderBy: [
          {
            popularity: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
      });
      const nextCursor = bugs.length < input.limit ? null : currentCursor + 1;
      return {
        data: bugs,
        nextCursor: nextCursor,
      };
    }),
  // Get a single bug report
  get: publicProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.bugReport.findUnique({
        where: { id: input.id },
        include: {
          user: {
            select: {
              username: true,
              avatar: true,
              rank: true,
              level: true,
            },
          },
        },
      });
    }),
  // Create a new bug report
  create: protectedProcedure
    .input(bugreportSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.bugReport.create({
        data: {
          title: input.title,
          description: input.description,
          system: input.system,
          userId: ctx.session.user.id,
        },
      });
    }),
  // Delete a bug report
  delete: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role === "ADMIN") {
        return ctx.prisma.bugReport.delete({
          where: { id: input.id },
        });
      }
    }),
  // Mark a bug report as solved
  markSolved: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role === "ADMIN") {
        return ctx.prisma.bugReport.update({
          where: { id: input.id },
          data: {
            is_resolved: true,
          },
        });
      }
    }),
  // Upvote a bug report
  vote: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        value: z.number().min(-1).max(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(async (tx) => {
        // First upsert tracking entry
        await tx.bugVotes.upsert({
          where: {
            bugId_userId: {
              bugId: input.id,
              userId: ctx.session.user.id,
            },
          },
          create: {
            bugId: input.id,
            userId: ctx.session.user.id,
            value: input.value,
          },
          update: {
            value: input.value,
          },
        });
        // Count total popularity of bug report
        const popularity = await tx.bugVotes.aggregate({
          where: { bugId: input.id },
          _sum: {
            value: true,
          },
        });
        // Then update bug popularity
        await tx.bugReport.update({
          where: { id: input.id },
          data: {
            popularity: popularity._sum.value as number,
          },
        });
      });
    }),
  // Comment on a bug report
  createComment: protectedProcedure
    .input(createCommentSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.bugComment.create({
        data: {
          content: input.comment,
          userId: ctx.session.user.id,
          bugId: input.bug_id,
        },
      });
    }),
  // Get comments for a given bug report
  getComments: publicProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const comments = await ctx.prisma.bugComment.findMany({
        skip: skip,
        take: input.limit,
        where: { bugId: input.id },
        include: {
          user: {
            select: {
              username: true,
              avatar: true,
              rank: true,
              level: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      const nextCursor =
        comments.length < input.limit ? null : currentCursor + 1;
      return {
        data: comments,
        nextCursor: nextCursor,
      };
    }),
});
