import { z } from "zod";

import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { serverError } from "../trpc";
import { bugreportSchema } from "../../../validators/bugs";
import { mutateCommentSchema } from "../../../validators/comments";
import sanitize from "../../../utils/sanitize";

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
              ...(ctx.session?.user ? { userId: ctx.session.user?.id } : {}),
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
    if (ctx.session.user.isBanned) {
      throw serverError("UNAUTHORIZED", "You are banned");
    }
    return ctx.prisma.bugReport.create({
      data: {
        title: input.title,
        content: sanitize(input.content),
        system: input.system,
        userId: ctx.session.user.id,
      },
    });
  }),
  // Delete a bug report
  delete: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role === "ADMIN") {
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
      if (ctx.session.user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      await ctx.prisma.$transaction(async (tx) => {
        // First upsert tracking entry
        await tx.bugVotes.upsert({
          where: {
            bugId_userId: {
              bugId: input.id,
              userId: ctx.session.user.id,
            },
          },
          create: {
            bugId: input.id,
            userId: ctx.session.user.id,
            value: input.value,
          },
          update: {
            value: input.value,
          },
        });
        // Count total popularity of bug report
        const popularity = await tx.bugVotes.aggregate({
          where: { bugId: input.id },
          _sum: {
            value: true,
          },
        });
        // Then update bug popularity
        await tx.bugReport.update({
          where: { id: input.id },
          data: {
            popularity: popularity._sum.value as number,
          },
        });
      });
    }),
  // Comment on a bug report
  resolve: protectedProcedure
    .input(mutateCommentSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      if (ctx.session.user.role === "ADMIN") {
        await ctx.prisma.$transaction(async (tx) => {
          // First upsert tracking entry
          await tx.bugComment.create({
            data: {
              content: sanitize(input.comment),
              userId: ctx.session.user.id,
              bugId: input.object_id,
            },
          });
          await tx.bugReport.update({
            where: { id: input.object_id },
            data: {
              is_resolved: true,
            },
          });
        });
      } else {
        throw serverError("UNAUTHORIZED", "Only admins can resolve bugs");
      }
    }),
});
