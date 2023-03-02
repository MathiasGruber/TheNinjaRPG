import { z } from "zod";

import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { serverError } from "../trpc";
import { mutateCommentSchema } from "../../../validators/comments";
import { reportCommentSchema } from "../../../validators/reports";
import { deleteCommentSchema } from "../../../validators/comments";
import { canPostReportComment } from "../../../validators/reports";
import { fetchUserReport } from "./reports";
import { fetchThread } from "./forum";
import { canSeeReport } from "../../../validators/reports";
import sanitize from "../../../utils/sanitize";

export const commentsRouter = createTRPCRouter({
  /**
   * BUG REPORTS
   * Creating, editing, deleting and getting comments on bug reports
   */
  createBugComment: protectedProcedure
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      return ctx.prisma.bugComment.create({
        data: {
          content: sanitize(input.comment),
          userId: ctx.session.user.id,
          bugId: input.object_id,
        },
      });
    }),
  editBugComment: protectedProcedure
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const comment = await ctx.prisma.bugComment.findUnique({
        where: { id: input.object_id },
      });
      if (comment?.userId === ctx.session.user.id) {
        return ctx.prisma.bugComment.update({
          where: { id: input.object_id },
          data: {
            content: sanitize(input.comment),
          },
        });
      } else {
        throw serverError("UNAUTHORIZED", "You can only edit own comments");
      }
    }),
  deleteBugComment: protectedProcedure
    .input(deleteCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.prisma.bugComment.findUnique({
        where: { id: input.id },
      });
      if (
        comment?.userId === ctx.session.user.id ||
        ctx.session.user.role === "ADMIN"
      ) {
        return ctx.prisma.bugComment.delete({
          where: { id: input.id },
        });
      } else {
        throw serverError("UNAUTHORIZED", "You can only delete own comments");
      }
    }),
  getBugComments: publicProcedure
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
              userId: true,
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
      const nextCursor = comments.length < input.limit ? null : currentCursor + 1;
      return {
        data: comments,
        nextCursor: nextCursor,
      };
    }),
  /**
   * USER REPORTS
   * Creating, editing, deleting and getting comments on user reports
   */
  getReportComments: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      // Guard
      const report = await fetchUserReport(ctx.prisma, input.id);
      // Fetch comments
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const comments = await ctx.prisma.userReportComment.findMany({
        skip: skip,
        take: input.limit,
        where: { reportId: report.id },
        include: {
          user: {
            select: {
              userId: true,
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
      const nextCursor = comments.length < input.limit ? null : currentCursor + 1;
      return {
        data: comments,
        nextCursor: nextCursor,
      };
    }),
  createReportComment: protectedProcedure
    .input(reportCommentSchema)
    .mutation(async ({ ctx, input }) => {
      // Guards
      const report = await fetchUserReport(ctx.prisma, input.object_id);
      if (!canPostReportComment(report)) {
        throw serverError("PRECONDITION_FAILED", "Already been resolved");
      }
      if (!canSeeReport(ctx.session.user, report)) {
        throw serverError("UNAUTHORIZED", "No access to the report");
      }
      // Create comment
      return ctx.prisma.userReportComment.create({
        data: {
          userId: ctx.session.user.id,
          reportId: input.object_id,
          content: sanitize(input.comment),
        },
      });
    }),
  /**
   * FORUM POSTS
   * Creating, editing, deleting and getting comments on forum threads
   */
  getForumComments: protectedProcedure
    .input(
      z.object({
        thread_id: z.string().cuid(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      // Guard
      const thread = await fetchThread(ctx.prisma, input.thread_id);
      // Fetch comments
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const comments = await ctx.prisma.forumPost.findMany({
        skip: skip,
        take: input.limit,
        where: { threadId: thread.id },
        include: {
          user: {
            select: {
              userId: true,
              username: true,
              avatar: true,
              rank: true,
              level: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });
      const nextCursor = comments.length < input.limit ? null : currentCursor + 1;
      const totalComments = await ctx.prisma.forumPost.count({
        where: { threadId: thread.id },
      });
      return {
        thread: thread,
        data: comments,
        nextCursor: nextCursor,
        total: Math.ceil(totalComments / input.limit),
      };
    }),
  createForumComment: protectedProcedure
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      // Guard
      const thread = await fetchThread(ctx.prisma, input.object_id);
      if (ctx.session.user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      return ctx.prisma.forumPost.create({
        data: {
          content: sanitize(input.comment),
          userId: ctx.session.user.id,
          threadId: thread.id,
        },
      });
    }),
  editForumComment: protectedProcedure
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const comment = await ctx.prisma.forumPost.findUniqueOrThrow({
        where: { id: input.object_id },
      });
      if (comment?.userId === ctx.session.user.id) {
        return ctx.prisma.forumPost.update({
          where: { id: input.object_id },
          data: {
            content: sanitize(input.comment),
          },
        });
      } else {
        throw serverError("UNAUTHORIZED", "You can only edit own comments");
      }
    }),
  deleteForumComment: protectedProcedure
    .input(deleteCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.prisma.forumPost.findUniqueOrThrow({
        where: { id: input.id },
      });
      if (
        comment?.userId === ctx.session.user.id ||
        ctx.session.user.role === "ADMIN"
      ) {
        return ctx.prisma.forumPost.delete({
          where: { id: input.id },
        });
      } else {
        throw serverError("UNAUTHORIZED", "You can only delete own comments");
      }
    }),
  /**
   * TAVERN POSTS
   * Creating, editing, deleting and getting comments on forum threads
   */
});
