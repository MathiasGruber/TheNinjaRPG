import { z } from "zod";
import { type PrismaClient } from "@prisma/client/edge";

import sanitize from "../../../utils/sanitize";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { serverError } from "../trpc";
import { bugreportSchema } from "../../../validators/bugs";

import { fetchUser } from "./profile";

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
              userId: true,
              username: true,
              avatar: true,
              rank: true,
              level: true,
            },
          },
          votes: {
            where: {
              ...(ctx.userId ? { userId: ctx.userId } : {}),
            },
            select: {
              value: true,
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
              userId: true,
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
  create: protectedProcedure.input(bugreportSchema).mutation(async ({ ctx, input }) => {
    const user = await fetchUser(ctx.prisma, ctx.userId);
    if (user.isBanned) {
      throw serverError("UNAUTHORIZED", "You are banned");
    }
    return await ctx.prisma.$transaction(async (tx) => {
      const convo = await tx.conversation.create({
        data: {
          createdById: ctx.userId,
        },
      });
      return tx.bugReport.create({
        data: {
          title: input.title,
          content: sanitize(input.content),
          system: input.system,
          userId: ctx.userId,
          conversationId: convo.id,
        },
      });
    });
  }),
  // Delete a bug report
  delete: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.prisma, ctx.userId);
      if (user.role === "ADMIN") {
        return ctx.prisma.bugReport.delete({
          where: { id: input.id },
        });
      } else {
        throw serverError("UNAUTHORIZED", "Only admins can delete bugs");
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
      // Guards
      const report = await fetchBugReport(ctx.prisma, input.id);
      const user = await fetchUser(ctx.prisma, ctx.userId);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      await ctx.prisma.$transaction(async (tx) => {
        // First upsert tracking entry
        await tx.bugVotes.upsert({
          where: {
            bugId_userId: {
              bugId: report.id,
              userId: ctx.userId,
            },
          },
          create: {
            bugId: report.id,
            userId: ctx.userId,
            value: input.value,
          },
          update: {
            value: input.value,
          },
        });
        // Count total popularity of bug report
        const popularity = await tx.bugVotes.aggregate({
          where: { bugId: report.id },
          _sum: {
            value: true,
          },
        });
        // Then update bug popularity
        await tx.bugReport.update({
          where: { id: report.id },
          data: {
            popularity: popularity._sum.value as number,
          },
        });
      });
    }),
  // Resolve / unresolve bug report
  resolve: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.prisma, ctx.userId);
      if (user.role === "ADMIN") {
        const report = await fetchBugReport(ctx.prisma, input.id);
        await ctx.prisma.$transaction(async (tx) => {
          await tx.bugReport.update({
            where: { id: report.id },
            data: {
              is_resolved: !report.is_resolved,
            },
          });
          await tx.conversation.update({
            where: { id: report.conversationId },
            data: {
              isLocked: !report.is_resolved,
            },
          });
        });
      } else {
        throw serverError("UNAUTHORIZED", "Only admins can resolve bugs");
      }
    }),
});

/**
 * Fetches the bug report in question. Throws an error if not found.
 */
export const fetchBugReport = async (client: PrismaClient, id: string) => {
  const report = await client.bugReport.findUniqueOrThrow({
    where: { id },
  });
  return report;
};
