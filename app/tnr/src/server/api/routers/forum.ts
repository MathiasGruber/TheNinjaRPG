import { z } from "zod";
import { type PrismaClient } from "@prisma/client";

import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { serverError } from "../trpc";

import { forumBoardSchema } from "../../../validators/forum";
import { canModerate } from "../../../validators/forum";

export const forumRouter = createTRPCRouter({
  // Get all boards in the system
  getAll: publicProcedure.query(async ({ ctx }) => {
    const boards = await ctx.prisma.forumBoard.findMany({
      orderBy: [
        {
          createdAt: "asc",
        },
      ],
    });
    return boards;
  }),
  // Get board in the system
  getThreads: publicProcedure
    .input(
      z.object({
        board_id: z.string().cuid(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      // Guards
      const board = await fetchBoard(ctx.prisma, input.board_id);
      // Fetch threads
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const threads = await ctx.prisma.forumThread.findMany({
        skip: skip,
        take: input.limit,
        where: {
          boardId: input.board_id,
        },
        include: {
          user: {
            select: {
              username: true,
            },
          },
        },
        orderBy: [
          {
            isPinned: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
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
      // Guards
      if (ctx.session.user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const board = await fetchBoard(ctx.prisma, input.board_id);
      // Create thread, post, and update board
      await ctx.prisma.$transaction(async (tx) => {
        const thread = await tx.forumThread.create({
          data: {
            title: input.title,
            boardId: board.id,
            userId: ctx.session.user.id,
          },
        });
        await tx.forumPost.create({
          data: {
            content: input.content,
            threadId: thread.id,
            userId: ctx.session.user.id,
          },
        });
        await tx.forumBoard.update({
          where: { id: board.id },
          data: {
            nThreads: { increment: 1 },
          },
        });
      });
    }),
  pinThread: protectedProcedure
    .input(
      z.object({
        thread_id: z.string().cuid(),
        status: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Guards
      const thread = await fetchThread(ctx.prisma, input.thread_id);
      if (!canModerate(ctx.session.user)) {
        throw serverError("UNAUTHORIZED", "You are not authorized");
      }
      // Update thread
      await ctx.prisma.forumThread.update({
        where: { id: thread.id },
        data: {
          isPinned: input.status,
        },
      });
    }),
  lockThread: protectedProcedure
    .input(
      z.object({
        thread_id: z.string().cuid(),
        status: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Guards
      const thread = await fetchThread(ctx.prisma, input.thread_id);
      if (!canModerate(ctx.session.user)) {
        throw serverError("UNAUTHORIZED", "You are not authorized");
      }
      // Update thread
      await ctx.prisma.forumThread.update({
        where: { id: thread.id },
        data: {
          isLocked: input.status,
        },
      });
    }),
});

/**
 * Fetches the user report in question. Throws an error if not found.
 */
export const fetchBoard = async (client: PrismaClient, id: string) => {
  const board = await client.forumBoard.findUniqueOrThrow({
    where: { id },
  });
  return board;
};

/**
 * Fetches the user report in question. Throws an error if not found.
 */
export const fetchThread = async (client: PrismaClient, id: string) => {
  const thread = await client.forumThread.findUniqueOrThrow({
    where: { id },
  });
  return thread;
};
