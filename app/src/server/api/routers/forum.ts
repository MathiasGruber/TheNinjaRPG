import { z } from "zod";
import { forumThread, forumBoard, forumPost } from "../../../../drizzle/schema";
import { userData } from "../../../../drizzle/schema";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { serverError } from "../trpc";
import { eq, sql, desc, asc } from "drizzle-orm";
import { forumBoardSchema } from "../../../validators/forum";
import { canModerate, canCreateNews } from "../../../validators/forum";
import { callDiscordNews } from "../../../libs/discord";
import { fetchUser } from "./profile";
import { nanoid } from "nanoid";
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
    await ctx.drizzle
      .update(userData)
      .set({ unreadNews: 0 })
      .where(eq(userData.userId, ctx.userId));
    return true;
  }),
  // Get board in the system
  getThreads: publicProcedure
    .input(
      z.object({
        board_id: z.string(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const board = await fetchBoard(ctx.drizzle, input.board_id);
      const { threads, nextCursor } = await getInfiniteThreads(
        ctx.drizzle,
        input.board_id,
        input.cursor,
        input.limit
      );
      return {
        data: threads,
        board: board,
        nextCursor: nextCursor,
      };
    }),
  getNews: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const board = await ctx.drizzle.query.forumBoard.findFirst({
        where: eq(forumBoard.name, "News"),
      });
      if (!board) throw new Error("News board not found");
      const { threads, nextCursor } = await getInfiniteThreads(
        ctx.drizzle,
        board.id,
        input.cursor,
        input.limit
      );
      return {
        data: threads,
        board: board,
        nextCursor: nextCursor,
      };
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
      if (isNews && !canCreateNews(user)) {
        throw serverError("UNAUTHORIZED", "You are not authorized to create news");
      }
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      if (!board) {
        throw serverError("UNAUTHORIZED", "Board does not exist");
      }
      if (isNews) {
        await callDiscordNews(user.username, input.title, input.content, user.avatar);
      }
      await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.insert(forumThread).values({
          id: threadId,
          title: input.title,
          boardId: input.board_id,
          userId: ctx.userId,
        }),
        ctx.drizzle.insert(forumPost).values({
          id: nanoid(),
          content: input.content,
          threadId: threadId,
          userId: ctx.userId,
        }),
        ctx.drizzle
          .update(forumBoard)
          .set({ nThreads: sql`nThreads + 1`, updatedAt: new Date() })
          .where(eq(forumBoard.id, input.board_id)),
        ...(isNews
          ? [ctx.drizzle.update(userData).set({ unreadNews: sql`unreadNews + 1` })]
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const thread = await fetchThread(ctx.drizzle, input.thread_id);
      if (!canModerate(user)) {
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const thread = await fetchThread(ctx.drizzle, input.thread_id);
      if (!canModerate(user)) {
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
      if (!canModerate(user)) {
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

export const getInfiniteThreads = async (
  client: DrizzleClient,
  boardId: string,
  cursor: number | null | undefined,
  limit: number
) => {
  const currentCursor = cursor ? cursor : 0;
  const skip = currentCursor * limit;
  const threads = await client.query.forumThread.findMany({
    offset: skip,
    limit: limit,
    where: eq(forumThread.boardId, boardId),
    with: {
      user: {
        columns: { username: true },
      },
      posts: {
        limit: 1,
        orderBy: asc(forumPost.createdAt),
      },
    },
    orderBy: [desc(forumThread.isPinned), desc(forumThread.createdAt)],
  });
  const nextCursor = threads.length < limit ? null : currentCursor + 1;
  return { threads, nextCursor };
};

export const fetchBoard = async (client: DrizzleClient, threadId: string) => {
  const entry = await client.query.forumBoard.findFirst({
    where: eq(forumBoard.id, threadId),
  });
  if (!entry) {
    throw new Error("Board not found");
  }
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
