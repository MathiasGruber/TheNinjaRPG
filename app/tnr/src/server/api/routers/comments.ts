import { Ratelimit } from "@upstash/ratelimit"; // for deno: see above
import { Redis } from "@upstash/redis";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { eq, or, and, sql, gte, ne, desc, inArray } from "drizzle-orm";
import { conversation, userReportComment, forumPost } from "../../../../drizzle/schema";
import { usersInConversation, conversationComment } from "../../../../drizzle/schema";
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
import sanitize from "../../../utils/sanitize";
import type { DrizzleClient } from "../../db";

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
      const report = await fetchUserReport(ctx.drizzle, input.id);
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const comments = await ctx.drizzle.query.userReportComment.findMany({
        offset: skip,
        limit: input.limit,
        where: eq(userReportComment.reportId, report.id),
        with: {
          user: {
            columns: {
              userId: true,
              username: true,
              avatar: true,
              rank: true,
              level: true,
            },
          },
        },
        orderBy: [desc(userReportComment.createdAt)],
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
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const report = await fetchUserReport(ctx.drizzle, input.object_id);
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
      return await ctx.drizzle.insert(userReportComment).values({
        id: createId(),
        userId: ctx.userId,
        reportId: input.object_id,
        content: sanitize(input.comment),
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
      const thread = await fetchThread(ctx.drizzle, input.thread_id);
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const comments = await ctx.drizzle.query.forumPost.findMany({
        offset: skip,
        limit: input.limit,
        where: eq(forumPost.threadId, thread.id),
        with: {
          user: {
            columns: {
              userId: true,
              username: true,
              avatar: true,
              rank: true,
              level: true,
            },
          },
        },
        orderBy: [desc(forumPost.createdAt)],
      });
      const nextCursor = comments.length < input.limit ? null : currentCursor + 1;
      const counts = await ctx.drizzle
        .select({ count: sql<number>`count(*)` })
        .from(forumPost)
        .where(eq(forumPost.threadId, thread.id));
      const totalComments = counts?.[0]?.count || 0;
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
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const thread = await fetchThread(ctx.drizzle, input.object_id);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const { success } = await ratelimit.limit(ctx.userId);
      if (!success) {
        throw serverError("TOO_MANY_REQUESTS", "You are commenting too fast");
      }
      return ctx.drizzle.insert(forumPost).values({
        id: createId(),
        userId: ctx.userId,
        threadId: thread.id,
        content: sanitize(input.comment),
      });
    }),
  editForumComment: protectedProcedure
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const comment = await ctx.drizzle.query.forumPost.findFirst({
        where: and(eq(forumPost.id, input.object_id), eq(forumPost.userId, ctx.userId)),
      });
      if (comment) {
        return ctx.drizzle
          .update(forumPost)
          .set({ content: sanitize(input.comment) })
          .where(eq(forumPost.id, input.object_id));
      } else {
        throw serverError("UNAUTHORIZED", "You can only edit own comments");
      }
    }),
  deleteForumComment: protectedProcedure
    .input(deleteCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const comment = await ctx.drizzle.query.forumPost.findFirst({
        where: and(eq(forumPost.id, input.id)),
      });
      if (comment?.userId === ctx.userId || user.role === "ADMIN") {
        return ctx.drizzle.delete(forumPost).where(eq(forumPost.id, input.id));
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
      const conversations = await ctx.drizzle.query.conversation.findMany({
        offset: skip,
        limit: input.limit,
        where: (table, { sql }) =>
          and(
            eq(conversation.isPublic, 0),
            sql`JSON_SEARCH(${table.users}, ${ctx.userId}) IS NOT NULL`
          ),
        with: { users: { columns: { userId: true, username: true, avatar: true } } },
        orderBy: [desc(conversation.updatedAt)],
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
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const { success } = await ratelimit.limit(ctx.userId);
      if (!success) {
        throw serverError("TOO_MANY_REQUESTS", "You are commenting too fast");
      }
      return await ctx.drizzle.transaction(async (tx) => {
        const convoId = createId();
        await tx.insert(conversation).values({
          id: convoId,
          title: input.title,
          createdById: ctx.userId,
          isPublic: 0,
          isLocked: 0,
        });
        [...input.users, ctx.userId].map(async (user) => {
          await tx.insert(usersInConversation).values({
            conversationId: convoId,
            userId: user,
          });
        });
        await tx.insert(conversationComment).values({
          id: createId(),
          content: sanitize(input.comment),
          userId: ctx.userId,
          conversationId: convoId,
        });
      });
    }),
  exitConversation: protectedProcedure
    .input(z.object({ convo_id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const convo = await fetchConversation({
        client: ctx.drizzle,
        id: input.convo_id,
        userId: ctx.userId,
      });
      await ctx.drizzle
        .delete(usersInConversation)
        .where(
          and(
            eq(usersInConversation.conversationId, convo.id),
            eq(usersInConversation.userId, ctx.userId)
          )
        );
      if (convo.users.length === 1) {
        await ctx.drizzle.delete(conversation).where(eq(conversation.id, convo.id));
        await ctx.drizzle
          .delete(conversationComment)
          .where(eq(conversationComment.conversationId, convo.id));
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
      const convo = await fetchConversation({
        client: ctx.drizzle,
        id: input.convo_id,
        title: input.convo_title,
        userId: ctx.userId,
      });
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const comments = await ctx.drizzle.query.conversationComment.findMany({
        offset: skip,
        limit: input.limit,
        where: eq(conversationComment.conversationId, convo.id),
        with: {
          user: {
            columns: {
              userId: true,
              username: true,
              avatar: true,
              rank: true,
              level: true,
            },
          },
        },
        orderBy: [desc(conversationComment.createdAt)],
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
      const convo = await fetchConversation({
        client: ctx.drizzle,
        id: input.object_id,
        userId: ctx.userId,
      });
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const { success } = await ratelimit.limit(ctx.userId);
      if (!success) {
        throw serverError("TOO_MANY_REQUESTS", "You are commenting too fast");
      }
      const pusher = getServerPusher();
      void pusher.trigger(convo.id, "event", { message: "new" });
      return ctx.drizzle.insert(conversationComment).values({
        id: createId(),
        content: sanitize(input.comment),
        userId: ctx.userId,
        conversationId: convo.id,
      });
    }),
  editConversationComment: protectedProcedure
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const comment = await ctx.drizzle.query.conversationComment.findFirst({
        where: and(
          eq(conversationComment.id, input.object_id),
          eq(conversationComment.userId, ctx.userId)
        ),
      });
      if (comment) {
        return ctx.drizzle
          .update(conversationComment)
          .set({ content: sanitize(input.comment) })
          .where(eq(conversationComment.id, input.object_id));
      } else {
        throw serverError("UNAUTHORIZED", "You can only edit own comments");
      }
    }),
  deleteConversationComment: protectedProcedure
    .input(deleteCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const comment = await ctx.drizzle.query.conversationComment.findFirst({
        where: eq(conversationComment.id, input.id),
      });
      if (comment?.userId === ctx.userId || user.role === "ADMIN") {
        return ctx.drizzle
          .delete(conversationComment)
          .where(eq(conversationComment.id, input.id));
      } else {
        throw serverError("UNAUTHORIZED", "You can only delete own comments");
      }
    }),
});

/**
 * Fetches a conversation from the database. Throws an error if not found.
 */
interface FetchConvoOptions {
  client: DrizzleClient;
  id?: string;
  title?: string;
  userId?: string;
}
export const fetchConversation = async (params: FetchConvoOptions) => {
  const { client, id, title, userId } = params;
  const getConvo = async () => {
    if (id) {
      return await client.query.conversation.findFirst({
        where: eq(conversation.id, id),
        with: { users: true },
      });
    } else if (title && userId) {
      return await client.query.conversation.findFirst({
        where: eq(conversation.title, title),
        with: { users: true },
      });
    } else {
      throw serverError("BAD_REQUEST", "Invalid request");
    }
  };
  const convo = await getConvo();
  const isPublic = convo?.isPublic;
  const inConversation = convo?.users.some((u) => u.userId === userId);
  if (convo && (isPublic || inConversation)) {
    return convo;
  } else {
    throw serverError("UNAUTHORIZED", "Conversation not found");
  }
};
