import { Ratelimit } from "@upstash/ratelimit"; // for deno: see above
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { type PrismaClient } from "@prisma/client";

import sanitize from "../../../utils/sanitize";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { serverError } from "../trpc";
import { mutateCommentSchema } from "../../../validators/comments";
import { reportCommentSchema } from "../../../validators/reports";
import { deleteCommentSchema } from "../../../validators/comments";
import { canPostReportComment } from "../../../validators/reports";
import { canSeeReport } from "../../../validators/reports";
import { createConversationSchema } from "../../../validators/comments";
import { getServerPusher } from "../../../libs/pusher";

import { fetchUserReport } from "./reports";
import { fetchThread } from "./forum";
import { fetchUser } from "./profile";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  analytics: true,
  prefix: "chat-ratelimit",
});

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
      const user = await fetchUser(ctx.prisma, ctx.userId);
      const report = await fetchUserReport(ctx.prisma, input.object_id);
      if (!canPostReportComment(report)) {
        throw serverError("PRECONDITION_FAILED", "Already been resolved");
      }
      if (!canSeeReport(user, report)) {
        throw serverError("UNAUTHORIZED", "No access to the report");
      }
      const { success } = await ratelimit.limit(ctx.userId);
      if (!success) {
        throw serverError("TOO_MANY_REQUESTS", "You are commenting too fast");
      }
      // Create comment
      return ctx.prisma.userReportComment.create({
        data: {
          userId: ctx.userId,
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
      const user = await fetchUser(ctx.prisma, ctx.userId);
      const thread = await fetchThread(ctx.prisma, input.object_id);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const { success } = await ratelimit.limit(ctx.userId);
      if (!success) {
        throw serverError("TOO_MANY_REQUESTS", "You are commenting too fast");
      }
      return ctx.prisma.forumPost.create({
        data: {
          content: sanitize(input.comment),
          userId: ctx.userId,
          threadId: thread.id,
        },
      });
    }),
  editForumComment: protectedProcedure
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.prisma, ctx.userId);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const comment = await ctx.prisma.forumPost.findUniqueOrThrow({
        where: { id: input.object_id },
      });
      if (comment?.userId === ctx.userId) {
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
      const user = await fetchUser(ctx.prisma, ctx.userId);
      const comment = await ctx.prisma.forumPost.findUniqueOrThrow({
        where: { id: input.id },
      });
      if (comment?.userId === ctx.userId || user.role === "ADMIN") {
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
  getUserConversations: protectedProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        selectedConvo: z.string().cuid().nullish().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const conversations = await ctx.prisma.conversation.findMany({
        skip: skip,
        take: input.limit,
        where: {
          isPublic: false,
          OR: [
            {
              UsersInConversation: {
                some: {
                  userId: ctx.userId,
                },
              },
            },
          ],
        },
        include: {
          UsersInConversation: {
            include: {
              user: {
                select: {
                  userId: true,
                  username: true,
                  avatar: true,
                },
              },
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      });
      const nextCursor = conversations.length < input.limit ? null : currentCursor + 1;
      return {
        data: conversations,
        nextCursor: nextCursor,
      };
    }),
  createConversation: protectedProcedure
    .input(createConversationSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.prisma, ctx.userId);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const { success } = await ratelimit.limit(ctx.userId);
      if (!success) {
        throw serverError("TOO_MANY_REQUESTS", "You are commenting too fast");
      }
      return await ctx.prisma.$transaction(async (tx) => {
        const convo = await tx.conversation.create({
          data: {
            title: input.title,
            createdById: ctx.userId,
            isPublic: false,
            isLocked: false,
            UsersInConversation: {
              create: [...input.users, ctx.userId].map((user) => {
                return {
                  userId: user,
                };
              }),
            },
          },
        });
        await tx.conversationComment.create({
          data: {
            content: sanitize(input.comment),
            userId: ctx.userId,
            conversationId: convo.id,
          },
        });
        return convo;
      });
    }),
  exitConversation: protectedProcedure
    .input(
      z.object({
        convo_id: z.string().cuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Guard
      const convo = await fetchConversation({
        client: ctx.prisma,
        id: input.convo_id,
        userId: ctx.userId,
      });
      // Remove user from conversation
      await ctx.prisma.usersInConversation.deleteMany({
        where: {
          userId: ctx.userId,
          conversationId: convo.id,
        },
      });
      // If user is the last in conversation, delete without waiting
      if (convo.UsersInConversation.length === 1) {
        void ctx.prisma.conversation.delete({
          where: { id: convo.id },
        });
        void ctx.prisma.conversationComment.deleteMany({
          where: { conversationId: convo.id },
        });
      }
    }),
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
      const convo = await fetchConversation({
        client: ctx.prisma,
        id: input.convo_id,
        title: input.convo_title,
        userId: ctx.userId,
      });
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
      const convo = await fetchConversation({
        client: ctx.prisma,
        id: input.object_id,
        userId: ctx.userId,
      });
      const user = await fetchUser(ctx.prisma, ctx.userId);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const { success } = await ratelimit.limit(ctx.userId);
      if (!success) {
        throw serverError("TOO_MANY_REQUESTS", "You are commenting too fast");
      }
      const comment = ctx.prisma.conversationComment.create({
        data: {
          content: sanitize(input.comment),
          userId: ctx.userId,
          conversationId: convo.id,
        },
      });
      const pusher = getServerPusher();
      await pusher.trigger(convo.id, "event", {
        message: "hello world",
      });
      return comment;
    }),
  editConversationComment: protectedProcedure
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.prisma, ctx.userId);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const comment = await ctx.prisma.conversationComment.findUniqueOrThrow({
        where: { id: input.object_id },
      });
      if (comment?.userId === ctx.userId) {
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
      const user = await fetchUser(ctx.prisma, ctx.userId);
      const comment = await ctx.prisma.conversationComment.findUniqueOrThrow({
        where: { id: input.id },
      });
      if (comment?.userId === ctx.userId || user.role === "ADMIN") {
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
interface FetchThreadOptions {
  client: PrismaClient;
  id?: string;
  title?: string;
  userId?: string;
}
export const fetchConversation = async (params: FetchThreadOptions) => {
  const { client, id, title, userId } = params;
  const getConvo = async () => {
    if (id) {
      const convo = await client.conversation.findUniqueOrThrow({
        where: { id: id },
        include: { UsersInConversation: true },
      });
      return convo;
    } else if (title && userId) {
      const convo = await client.conversation.findUniqueOrThrow({
        where: { title: title },
        include: { UsersInConversation: true },
      });
      return convo;
    } else {
      throw serverError("BAD_REQUEST", "Invalid request");
    }
  };
  const convo = await getConvo();
  if (convo.isPublic || convo.UsersInConversation.some((u) => u.userId === userId)) {
    return convo;
  } else {
    throw serverError("UNAUTHORIZED", "Conversation not found");
  }
};
