import { z } from "zod";
import { forumThread, forumBoard, forumPost } from "../../../../drizzle/schema";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { serverError } from "../trpc";
import { eq, sql, asc, desc } from "drizzle-orm";
import { forumBoardSchema } from "../../../validators/forum";
import { canModerate } from "../../../validators/forum";
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
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const threads = await ctx.drizzle.query.forumThread.findMany({
        offset: skip,
        limit: input.limit,
        where: eq(forumThread.boardId, board.id),
        with: {
          user: {
            columns: { username: true },
          },
        },
        orderBy: [desc(forumThread.isPinned), desc(forumThread.createdAt)],
      });
      const nextCursor = threads.length < input.limit ? null : currentCursor + 1;
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
        await fetchBoard(ctx.drizzle, input.board_id),
        await fetchUser(ctx.drizzle, ctx.userId),
        await ctx.drizzle.insert(forumThread).values({
          id: threadId,
          title: input.title,
          boardId: input.board_id,
          userId: ctx.userId,
        }),
        await ctx.drizzle.insert(forumPost).values({
          id: nanoid(),
          content: input.content,
          threadId: threadId,
          userId: ctx.userId,
        }),
        await ctx.drizzle
          .update(forumBoard)
          .set({ nThreads: sql`nThreads + 1` })
          .where(eq(forumBoard.id, input.board_id)),
      ]);

      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      if (!board) {
        throw serverError("UNAUTHORIZED", "Board does not exist");
      }
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
});

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
