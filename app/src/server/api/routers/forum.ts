import { z } from "zod";
import { forumThread, forumBoard, forumPost } from "@/drizzle/schema";
import { userData } from "@/drizzle/schema";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { serverError } from "../trpc";
import { eq, sql, desc, asc } from "drizzle-orm";
import { forumBoardSchema } from "@/validators/forum";
import { canModerate, canCreateNews } from "@/utils/permissions";
import { callDiscordNews } from "../../../libs/discord";
import { fetchUser } from "./profile";
import { nanoid } from "nanoid";
import { moderateContent } from "@/libs/moderator";
import sanitize from "@/utils/sanitize";
import type { DrizzleClient } from "../../db";

export const forumRouter = createTRPCRouter({
  // Get all boards in the system
  getAll: publicProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.forumBoard.findMany({
      orderBy: asc(forumBoard.createdAt),
    });
  }),
  // The user read the news
  readNews: protectedProcedure.mutation(async ({ ctx }) => {
    await readNews(ctx.drizzle, ctx.userId);
    return true;
  }),
  // Get board in the system
  getThreads: publicProcedure
    .input(
      z.object({
        board_id: z.string().optional(),
        board_name: z.string().optional(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await getInfiniteThreads({
        client: ctx.drizzle,
        boardId: input.board_id,
        boardName: input.board_name,
        cursor: input.cursor,
        limit: input.limit,
        highlightPinned: true,
      });
    }),
  createThread: protectedProcedure
    .input(forumBoardSchema)
    .mutation(async ({ ctx, input }) => {
      const threadId = nanoid();
      const [board, user] = await Promise.all([
        fetchBoard(ctx.drizzle, input.board_id),
        fetchUser(ctx.drizzle, ctx.userId),
      ]);
      const isNews = board.name === "News";
      if (isNews && !canCreateNews(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not authorized to create news");
      }
      if (user.isBanned || user.isSilenced) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      if (!board) {
        throw serverError("UNAUTHORIZED", "Board does not exist");
      }
      if (isNews) {
        await callDiscordNews(user.username, input.title, input.content, user.avatar);
      }
      const sanitized = sanitize(input.content);
      const postId = nanoid();
      await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        moderateContent(ctx.drizzle, {
          content: sanitized,
          userId: ctx.userId,
          relationType: "forumPost",
          relationId: postId,
        }),
        ctx.drizzle.insert(forumThread).values({
          id: threadId,
          title: input.title,
          boardId: input.board_id,
          userId: ctx.userId,
        }),
        ctx.drizzle.insert(forumPost).values({
          id: postId,
          content: sanitized,
          threadId: threadId,
          userId: ctx.userId,
        }),
        ctx.drizzle
          .update(forumBoard)
          .set({ nThreads: sql`nThreads + 1`, updatedAt: new Date() })
          .where(eq(forumBoard.id, input.board_id)),
        ...(isNews
          ? [
              ctx.drizzle
                .update(userData)
                .set({ unreadNews: sql`LEAST(unreadNews + 1, 1000)` }),
            ]
          : []),
      ]);
      return threadId;
    }),
  // Pin forum thread to be on top
  pinThread: protectedProcedure
    .input(
      z.object({
        thread_id: z.string(),
        status: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const thread = await fetchThread(ctx.drizzle, input.thread_id);
      if (!canModerate(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not authorized");
      }
      return await ctx.drizzle
        .update(forumThread)
        .set({ isPinned: input.status ? 1 : 0 })
        .where(eq(forumThread.id, thread.id));
    }),
  lockThread: protectedProcedure
    .input(
      z.object({
        thread_id: z.string(),
        status: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const thread = await fetchThread(ctx.drizzle, input.thread_id);
      if (!canModerate(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not authorized");
      }
      return await ctx.drizzle
        .update(forumThread)
        .set({ isLocked: input.status ? 1 : 0 })
        .where(eq(forumThread.id, thread.id));
    }),
  deleteThread: protectedProcedure
    .input(z.object({ thread_id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const thread = await fetchThread(ctx.drizzle, input.thread_id);
      if (!canModerate(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not authorized");
      }
      await ctx.drizzle.delete(forumThread).where(eq(forumThread.id, thread.id));
      await ctx.drizzle.delete(forumPost).where(eq(forumPost.threadId, thread.id));
      await ctx.drizzle
        .update(forumBoard)
        .set({ nThreads: sql`nThreads - 1` })
        .where(eq(forumBoard.id, thread.boardId));
    }),
});

export const getInfiniteThreads = async (props: {
  client: DrizzleClient;
  limit: number;
  highlightPinned?: boolean;
  cursor?: number | null;
  boardId?: string;
  boardName?: string;
}) => {
  const { client, boardId, boardName, cursor, limit, highlightPinned } = props;
  const board = await fetchBoard(client, boardId, boardName);
  if (!board) throw new Error("Board not found");
  const currentCursor = cursor ? cursor : 0;
  const skip = currentCursor * limit;
  const threads = await client.query.forumThread.findMany({
    offset: skip,
    limit: limit,
    where: eq(forumThread.boardId, board.id),
    with: {
      user: {
        columns: { username: true },
      },
      posts: {
        limit: 1,
        orderBy: asc(forumPost.createdAt),
      },
    },
    orderBy: highlightPinned
      ? [desc(forumThread.isPinned), desc(forumThread.createdAt)]
      : desc(forumThread.createdAt),
  });
  const nextCursor = threads.length < limit ? null : currentCursor + 1;
  return { board, threads, nextCursor };
};
export type InfiniteThreads = ReturnType<typeof getInfiniteThreads>;

export const fetchBoard = async (
  client: DrizzleClient,
  threadId?: string,
  threadName?: string,
) => {
  if (!threadId && !threadName) {
    throw new Error("No specific board requested");
  }
  const entry = await client.query.forumBoard.findFirst({
    where: threadId
      ? eq(forumBoard.id, threadId ?? "")
      : eq(forumBoard.name, threadName ?? ""),
  });
  if (!entry) throw new Error("Board not found");
  return entry;
};

export const fetchThread = async (client: DrizzleClient, threadId: string) => {
  const entry = await client.query.forumThread.findFirst({
    where: eq(forumThread.id, threadId),
  });
  if (!entry) {
    throw new Error("Thread not found");
  }
  return entry;
};

export const readNews = async (client: DrizzleClient, userId: string) => {
  await client
    .update(userData)
    .set({ unreadNews: 0 })
    .where(eq(userData.userId, userId));
};
