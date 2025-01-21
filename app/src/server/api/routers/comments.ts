import { nanoid } from "nanoid";
import { z } from "zod";
import { eq, or, and, sql, desc, asc, inArray, isNull, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  village,
  userBlackList,
  conversation,
  userReportComment,
  forumPost,
  forumThread,
  userData,
} from "@/drizzle/schema";
import { user2conversation, conversationComment } from "@/drizzle/schema";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  ratelimitMiddleware,
  hasUserMiddleware,
} from "@/server/api/trpc";
import { serverError, baseServerResponse, errorResponse } from "@/server/api/trpc";
import { mutateCommentSchema } from "@/validators/comments";
import { reportCommentSchema } from "@/validators/reports";
import { deleteCommentSchema } from "@/validators/comments";
import { canPostReportComment } from "@/utils/permissions";
import { canSeeReport } from "@/utils/permissions";
import { canDeleteComment } from "@/utils/permissions";
import { canModerateRoles } from "@/utils/permissions";
import { canSeeSecretData } from "@/utils/permissions";
import { createConversationSchema } from "@/validators/comments";
import { getServerPusher } from "@/libs/pusher";
import { fetchUserReport } from "@/routers/reports";
import { fetchThread } from "@/routers/forum";
import { fetchUser } from "@/routers/profile";
import { moderateContent } from "@/libs/moderator";
import sanitize from "@/utils/sanitize";
import type { DrizzleClient } from "../../db";

export const commentsRouter = createTRPCRouter({
  /**
   * USER REPORTS
   * Creating, editing, deleting and getting comments on user reports
   */
  getReportComments: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const report = await fetchUserReport(ctx.drizzle, input.id, ctx.userId);
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
              isOutlaw: true,
              level: true,
              role: true,
              federalStatus: true,
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
    .use(ratelimitMiddleware)
    .use(hasUserMiddleware)
    .output(baseServerResponse)
    .input(reportCommentSchema)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, report] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUserReport(ctx.drizzle, input.object_id, ctx.userId),
      ]);
      // Guard
      if (!canPostReportComment(report)) return errorResponse("Already resolved");
      if (!canSeeReport(user, report)) return errorResponse("No access to report");
      // Update
      await ctx.drizzle.insert(userReportComment).values({
        id: nanoid(),
        userId: ctx.userId,
        reportId: input.object_id,
        content: sanitize(input.comment),
      });
      return { success: true, message: "Comment posted" };
    }),
  /**
   * FORUM POSTS
   * Creating, editing, deleting and getting comments on forum threads
   */
  getForumComments: publicProcedure
    .input(
      z.object({
        thread_id: z.string(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const [thread, comments, counts] = await Promise.all([
        fetchThread(ctx.drizzle, input.thread_id),
        ctx.drizzle.query.forumPost.findMany({
          offset: skip,
          limit: input.limit,
          where: eq(forumPost.threadId, input.thread_id),
          with: {
            user: {
              columns: {
                userId: true,
                username: true,
                avatar: true,
                rank: true,
                isOutlaw: true,
                level: true,
                role: true,
                federalStatus: true,
              },
            },
          },
          orderBy: [asc(forumPost.createdAt)],
        }),
        ctx.drizzle
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(forumPost)
          .where(eq(forumPost.threadId, input.thread_id)),
      ]);
      const nextCursor = comments.length < input.limit ? null : currentCursor + 1;
      const totalComments = counts?.[0]?.count || 0;
      return {
        thread: thread,
        data: comments,
        nextCursor: nextCursor,
        totalComments: totalComments,
        totalPages: Math.ceil(totalComments / input.limit),
      };
    }),
  createForumComment: protectedProcedure
    .use(ratelimitMiddleware)
    .use(hasUserMiddleware)
    .input(mutateCommentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, thread] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchThread(ctx.drizzle, input.object_id),
      ]);
      // Guard
      if (user.isBanned || user.isSilenced) {
        return errorResponse("You are banned");
      }
      if (!thread) {
        return errorResponse("Thread not found");
      }
      // Mutate
      const sanitized = sanitize(input.comment);
      const createdId = nanoid();
      await Promise.all([
        moderateContent(ctx.drizzle, {
          content: sanitized,
          userId: ctx.userId,
          relationType: "forumPost",
          relationId: createdId,
          contextId: thread.id,
        }),
        ctx.drizzle.insert(forumPost).values({
          id: createdId,
          userId: ctx.userId,
          threadId: thread.id,
          content: sanitized,
        }),
        ctx.drizzle
          .update(forumThread)
          .set({ nPosts: sql`nPosts + 1` })
          .where(eq(forumThread.id, thread.id)),
      ]);
      return { success: true, message: "Comment posted" };
    }),
  editForumComment: protectedProcedure
    .input(mutateCommentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, comment] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.forumPost.findFirst({
          where: and(
            eq(forumPost.id, input.object_id),
            eq(forumPost.userId, ctx.userId),
          ),
        }),
      ]);
      // Guard
      if (user.isBanned) return errorResponse("You are banned");
      if (user.isSilenced) return errorResponse("You are silenced");
      if (!comment) return errorResponse("Comment not found");
      // Mutate
      const postId = input.object_id;
      const sanitized = sanitize(input.comment);
      await Promise.all([
        moderateContent(ctx.drizzle, {
          content: sanitized,
          userId: ctx.userId,
          relationType: "forumPost",
          relationId: postId,
        }),
        ctx.drizzle
          .update(forumPost)
          .set({ content: sanitized })
          .where(eq(forumPost.id, postId)),
      ]);
      return { success: true, message: "Comment edited" };
    }),
  deleteForumComment: protectedProcedure
    .input(deleteCommentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, comment] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.forumPost.findFirst({
          where: and(eq(forumPost.id, input.id)),
        }),
      ]);
      // Guard
      if (!comment) return errorResponse("Comment not found");
      if (user.isBanned) return errorResponse("You are banned");
      if (user.isSilenced) return errorResponse("You are silenced");
      if (!canDeleteComment(user, comment.userId)) {
        return errorResponse("You can only delete own comments");
      }
      // Mutate
      await ctx.drizzle.delete(forumPost).where(eq(forumPost.id, input.id));
      return { success: true, message: "Comment deleted" };
    }),
  /**
   * Conversation POSTS
   * Creating, editing, deleting and getting comments on forum threads
   */
  getUserConversations: protectedProcedure
    .input(z.object({ selectedConvo: z.string().nullish().optional() }))
    .query(async ({ ctx }) => {
      // Query
      const [data] = await Promise.all([
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
          with: {
            creatorBlacklist: true,
            conversations: {
              with: {
                conversation: {
                  with: {
                    users: {
                      with: {
                        userData: {
                          columns: {
                            userId: true,
                            username: true,
                            avatar: true,
                            role: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        // Remove the counter of new conversations
        ctx.drizzle
          .update(userData)
          .set({ inboxNews: 0 })
          .where(eq(userData.userId, ctx.userId)),
      ]);
      // Filter off blacklisted conversations
      const filteredConverations = data?.conversations
        .filter(
          (c) =>
            !c.conversation.users
              .filter((u) => u.userData)
              .filter((u) => u.userId !== ctx.userId)
              .every((u) =>
                data.creatorBlacklist.some(
                  (b) =>
                    b.targetUserId === u.userId && !canSeeSecretData(u.userData.role),
                ),
              ),
        )
        .map((c) => c.conversation)
        .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
      // Return filtered conversations
      return filteredConverations;
    }),
  createConversation: protectedProcedure
    .use(ratelimitMiddleware)
    .use(hasUserMiddleware)
    .input(createConversationSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.isBanned || user.isSilenced) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const convoId = await createConvo(
        ctx.drizzle,
        ctx.userId,
        input.users,
        input.title,
        input.comment,
      );
      return { conversationId: convoId };
    }),
  exitConversation: protectedProcedure
    .input(z.object({ convo_id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const convo = await fetchConversation({
        client: ctx.drizzle,
        id: input.convo_id,
        userId: ctx.userId,
      });
      await ctx.drizzle
        .delete(user2conversation)
        .where(
          and(
            eq(user2conversation.conversationId, convo.id),
            eq(user2conversation.userId, ctx.userId),
          ),
        );
      if (convo.users.length === 1) {
        await ctx.drizzle.delete(conversation).where(eq(conversation.id, convo.id));
        await ctx.drizzle
          .delete(conversationComment)
          .where(eq(conversationComment.conversationId, convo.id));
      }
    }),
  fetchConversationComment: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const posterUser = alias(userData, "posterUser");
      const readerUser = alias(userData, "readerUser");
      const posterBlacklist = alias(userBlackList, "posterBlacklist");
      const readerBlacklist = alias(userBlackList, "readerBlacklist");
      const comment = await ctx.drizzle
        .select({
          id: conversationComment.id,
          createdAt: conversationComment.createdAt,
          content: conversationComment.content,
          conversationId: conversationComment.conversationId,
          isPinned: conversationComment.isPinned,
          isReported: conversationComment.isReported,
          villageName: village.name,
          villageHexColor: village.hexColor,
          villageKageId: village.kageId,
          userId: posterUser.userId,
          username: posterUser.username,
          avatar: posterUser.avatar,
          rank: posterUser.rank,
          isOutlaw: posterUser.isOutlaw,
          level: posterUser.level,
          role: posterUser.role,
          customTitle: posterUser.customTitle,
          federalStatus: posterUser.federalStatus,
          nRecruited: posterUser.nRecruited,
        })
        .from(conversationComment)
        .innerJoin(posterUser, eq(posterUser.userId, conversationComment.userId))
        .innerJoin(readerUser, eq(readerUser.userId, ctx.userId))
        .leftJoin(
          posterBlacklist,
          and(
            notInArray(readerUser.role, canModerateRoles),
            eq(posterBlacklist.creatorUserId, conversationComment.userId),
            eq(posterBlacklist.targetUserId, ctx.userId),
          ),
        )
        .leftJoin(
          readerBlacklist,
          and(
            eq(readerBlacklist.creatorUserId, ctx.userId),
            eq(readerBlacklist.targetUserId, conversationComment.userId),
          ),
        )
        .leftJoin(village, eq(village.id, posterUser.villageId))
        .where(
          and(
            eq(conversationComment.id, input.commentId),
            or(isNull(readerBlacklist.id), inArray(posterUser.role, canModerateRoles)),
            isNull(posterBlacklist.id),
          ),
        );
      return comment?.[0] || null;
    }),
  getConversationComments: protectedProcedure
    .input(
      z
        .object({
          convo_id: z.string().optional(),
          convo_title: z.string().min(1).max(30).optional(),
          cursor: z.number().nullish(),
          limit: z.number().min(1).max(100),
          refreshKey: z.number(),
        })
        .refine(
          (data) => !!data.convo_id || !!data.convo_title,
          "Either convo_id or convo_title is required",
        ),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      // Guard
      if (!input.convo_id && !input.convo_title) {
        throw serverError(
          "BAD_REQUEST",
          "Invalid request; must specify either ID or title",
        );
      }
      // Fetch data
      const [user, convo] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchConversation({
          client: ctx.drizzle,
          id: input.convo_id,
          title: input.convo_title,
          userId: ctx.userId,
        }),
      ]);
      const posterBlacklist = alias(userBlackList, "posterBlacklist");
      const readerBlacklist = alias(userBlackList, "readerBlacklist");
      const [comments] = await Promise.all([
        ctx.drizzle
          .select({
            id: conversationComment.id,
            createdAt: conversationComment.createdAt,
            content: conversationComment.content,
            conversationId: conversationComment.conversationId,
            isPinned: conversationComment.isPinned,
            isReported: conversationComment.isReported,
            villageName: village.name,
            villageHexColor: village.hexColor,
            villageKageId: village.kageId,
            userId: userData.userId,
            username: userData.username,
            avatar: userData.avatar,
            rank: userData.rank,
            isOutlaw: userData.isOutlaw,
            level: userData.level,
            role: userData.role,
            customTitle: userData.customTitle,
            federalStatus: userData.federalStatus,
            nRecruited: userData.nRecruited,
          })
          .from(conversationComment)
          .innerJoin(userData, eq(conversationComment.userId, userData.userId))
          .leftJoin(
            posterBlacklist,
            and(
              eq(
                posterBlacklist.creatorUserId,
                canSeeSecretData(user.role) ? "neverfound" : conversationComment.userId,
              ),
              eq(posterBlacklist.targetUserId, ctx.userId),
            ),
          )
          .leftJoin(
            readerBlacklist,
            and(
              eq(readerBlacklist.creatorUserId, ctx.userId),
              eq(readerBlacklist.targetUserId, conversationComment.userId),
            ),
          )
          .leftJoin(village, eq(village.id, userData.villageId))
          .where(
            and(
              eq(conversationComment.conversationId, convo.id),
              or(isNull(readerBlacklist.id), inArray(userData.role, canModerateRoles)),
              isNull(posterBlacklist.id),
            ),
          )
          .orderBy(desc(conversationComment.createdAt))
          .limit(input.limit)
          .offset(skip),
        // Update last read
        ...(convo.isPublic
          ? []
          : [
              ctx.drizzle
                .update(user2conversation)
                .set({ lastReadAt: new Date() })
                .where(
                  and(
                    eq(user2conversation.userId, ctx.userId),
                    eq(user2conversation.conversationId, convo.id),
                  ),
                ),
            ]),
      ]);
      // Fetch
      const nextCursor = comments.length < input.limit ? null : currentCursor + 1;
      return {
        convo: convo,
        data: comments,
        nextCursor: nextCursor,
      };
    }),
  createConversationComment: protectedProcedure
    .use(ratelimitMiddleware)
    .use(hasUserMiddleware)
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      // Fetch data
      const [convo, user] = await Promise.all([
        fetchConversation({
          client: ctx.drizzle,
          id: input.object_id,
          userId: ctx.userId,
        }),
        fetchUser(ctx.drizzle, ctx.userId),
      ]);
      // Guard
      if (user.isBanned || user.isSilenced) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const userIds = convo.users.map((u) => u.userId);
      if (userIds.length > 0) {
        await ctx.drizzle
          .update(userData)
          .set({ inboxNews: sql`${userData.inboxNews} + 1` })
          .where(inArray(userData.userId, userIds));
      }
      // Update conversation & update user notifications
      const commentId = nanoid();
      const pusher = getServerPusher();
      void pusher.trigger(convo.id, "event", {
        message: "new",
        fromId: ctx.userId,
        commentId: commentId,
      });
      if (!convo.isPublic) {
        userIds
          .filter((id) => id !== ctx.userId)
          .forEach(
            (userId) => void pusher.trigger(userId, "event", { type: "newInbox" }),
          );
      }
      // Auto-moderation
      const sanitized = sanitize(input.comment);
      await Promise.all([
        ...(convo.isPublic
          ? [
              moderateContent(ctx.drizzle, {
                content: sanitized,
                userId: ctx.userId,
                relationType: "comment",
                relationId: commentId,
                contextId: convo.id,
              }),
            ]
          : []),
        ctx.drizzle.insert(conversationComment).values({
          id: commentId,
          content: sanitized,
          userId: ctx.userId,
          conversationId: convo.id,
        }),
        ctx.drizzle
          .update(conversation)
          .set({ updatedAt: new Date() })
          .where(eq(conversation.id, convo.id)),
      ]);
      // Insert
      return { success: true, message: "Comment posted" };
    }),
  editConversationComment: protectedProcedure
    .input(mutateCommentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, comment] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.conversationComment.findFirst({
          where: and(
            eq(conversationComment.id, input.object_id),
            eq(conversationComment.userId, ctx.userId),
          ),
        }),
      ]);
      // Guard
      if (user.isBanned) return errorResponse("You are banned");
      if (user.isSilenced) return errorResponse("You are silenced");
      if (!comment) return errorResponse("Comment not found");
      // Mutate
      const commentId = input.object_id;
      const sanitized = sanitize(input.comment);
      await Promise.all([
        moderateContent(ctx.drizzle, {
          content: sanitized,
          userId: ctx.userId,
          relationType: "comment",
          relationId: commentId,
        }),
        ctx.drizzle
          .update(conversationComment)
          .set({ content: sanitized })
          .where(eq(conversationComment.id, commentId)),
      ]);
      return { success: true, message: "Comment edited" };
    }),
  deleteConversationComment: protectedProcedure
    .input(deleteCommentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, comment] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.conversationComment.findFirst({
          where: eq(conversationComment.id, input.id),
        }),
      ]);
      // Guard
      if (user.isBanned) return errorResponse("You are banned");
      if (user.isSilenced) return errorResponse("You are silenced");
      if (!comment) return errorResponse("Comment not found");
      if (!canDeleteComment(user, comment.userId)) {
        return errorResponse("You can only delete own comments");
      }
      // Mutate
      await ctx.drizzle
        .delete(conversationComment)
        .where(eq(conversationComment.id, input.id));
      return { success: true, message: "Comment deleted" };
    }),
});

interface FetchConvoOptions {
  client: DrizzleClient;
  id?: string;
  title?: string;
  userId?: string;
}

/**
 * Fetches a conversation based on the provided options.
 * @param params - The options for fetching the conversation.
 * @returns The fetched conversation if it exists and the user is authorized, otherwise throws an error.
 * @throws {ServerError} If the request is invalid or the conversation is not found.
 */
export const fetchConversation = async (params: FetchConvoOptions) => {
  const { client, id, title, userId } = params;
  const getConvo = async () => {
    if (id) {
      return await client.query.conversation.findFirst({
        where: eq(conversation.id, id),
        with: { users: true },
        orderBy: [desc(conversation.isPublic)],
      });
    } else if (title) {
      return await client.query.conversation.findFirst({
        where: eq(conversation.title, title),
        with: { users: true },
        orderBy: [desc(conversation.isPublic)],
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
    throw serverError(
      "UNAUTHORIZED",
      `Conversation ${params.id}-${params.title} not found`,
    );
  }
};

/**
 * Creates a conversation with the given parameters and performs necessary database operations.
 * @param client - The DrizzleClient instance used for database operations.
 * @param senderUserId - The ID of the user who is creating the conversation.
 * @param receiverUserIds - An array of user IDs who will receive the conversation.
 * @param title - The title of the conversation.
 * @param content - The content of the first comment in the conversation.
 */
export const createConvo = async (
  client: DrizzleClient,
  senderUserId: string,
  receiverUserIds: string[],
  title: string,
  content: string,
) => {
  // Push notifications early
  const pusher = getServerPusher();
  receiverUserIds.forEach(
    (userId) => void pusher.trigger(userId, "event", { type: "newInbox" }),
  );
  // Update DB concurrently
  const convoId = nanoid();
  const messageId = nanoid();
  const sanitized = sanitize(content);
  await Promise.all([
    client.insert(conversation).values({
      id: convoId,
      title: title,
      createdById: senderUserId,
      isPublic: 0,
      isLocked: 0,
    }),
    ...[...receiverUserIds, senderUserId].map((user) =>
      client.insert(user2conversation).values({
        conversationId: convoId,
        userId: user,
      }),
    ),
    ...(receiverUserIds.length > 0
      ? [
          client
            .update(userData)
            .set({ inboxNews: sql`${userData.inboxNews} + 1` })
            .where(inArray(userData.userId, receiverUserIds)),
        ]
      : []),
    client.insert(conversationComment).values({
      id: messageId,
      content: sanitized,
      userId: senderUserId,
      conversationId: convoId,
    }),
  ]);
  return convoId;
};
