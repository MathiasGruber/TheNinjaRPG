import { z } from "zod";
import { type PrismaClient } from "@prisma/client";

import { createTRPCRouter, protectedProcedure } from "../trpc";
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
   * Conversation POSTS
   * Creating, editing, deleting and getting comments on forum threads
   */
  getConversationComments: protectedProcedure
    .input(
      z
        .object({
          convo_id: z.string().cuid().optional(),
          convo_title: z.string().min(1).max(10).optional(),
          cursor: z.number().nullish(),
          limit: z.number().min(1).max(100),
          refreshKey: z.number(),
        })
        .refine(
          (data) => !!data.convo_id || !!data.convo_title,
          "Either convo_id or convo_title is required"
        )
    )
    .query(async ({ ctx, input }) => {
      // Guard
      const convo = await fetchConversation(
        ctx.prisma,
        input.convo_id,
        input.convo_title,
        ctx.session.user.id
      );
      // Fetch comments
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const comments = await ctx.prisma.conversationComment.findMany({
        skip: skip,
        take: input.limit,
        where: { conversationId: convo.id },
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
        convo: convo,
        data: comments,
        nextCursor: nextCursor,
      };
    }),
  createConversationComment: protectedProcedure
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      // Guard
      const convo = await fetchConversation(ctx.prisma, input.object_id);
      if (ctx.session.user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      return ctx.prisma.conversationComment.create({
        data: {
          content: sanitize(input.comment),
          userId: ctx.session.user.id,
          conversationId: convo.id,
        },
      });
    }),
  editConversationComment: protectedProcedure
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const comment = await ctx.prisma.conversationComment.findUniqueOrThrow({
        where: { id: input.object_id },
      });
      if (comment?.userId === ctx.session.user.id) {
        return ctx.prisma.conversationComment.update({
          where: { id: input.object_id },
          data: {
            content: sanitize(input.comment),
          },
        });
      } else {
        throw serverError("UNAUTHORIZED", "You can only edit own comments");
      }
    }),
  deleteConversationComment: protectedProcedure
    .input(deleteCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.prisma.conversationComment.findUniqueOrThrow({
        where: { id: input.id },
      });
      if (
        comment?.userId === ctx.session.user.id ||
        ctx.session.user.role === "ADMIN"
      ) {
        return ctx.prisma.conversationComment.delete({
          where: { id: input.id },
        });
      } else {
        throw serverError("UNAUTHORIZED", "You can only delete own comments");
      }
    }),
});

/**
 * Fetches the forum thread. Throws an error if not found.
 */
export const fetchConversation = async (
  client: PrismaClient,
  id?: string,
  title?: string,
  userId?: string
) => {
  if (id) {
    const convo = await client.conversation.findUniqueOrThrow({
      where: { id },
    });
    return convo;
  } else if (title && userId) {
    const convo = await client.conversation.findUniqueOrThrow({
      where: { title: title },
    });
    return convo;
  }
  throw serverError("NOT_FOUND", "Conversation not found");
};
