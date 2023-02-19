import { z } from "zod";

import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { bugreportSchema } from "../../../validators/bugs";
import { createCommentSchema } from "../../../validators/bugs";

export const bugsRouter = createTRPCRouter({
  // Get all bugs in the system
  getAll: publicProcedure.query(({ ctx }) => {
    return ctx.prisma.bugReport.findMany({
      include: {
        _count: {
          select: { votes: true },
        },
        user: {
          select: {
            username: true,
            avatar: true,
            rank: true,
            level: true,
          },
        },
      },
      orderBy: {
        votes: {
          _count: "desc",
        },
      },
    });
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
  create: protectedProcedure
    .input(bugreportSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.bugReport.create({
        data: {
          title: input.title,
          description: input.description,
          system: input.system,
          userId: ctx.session.user.id,
        },
      });
    }),
  // Upvote a bug report
  upvote: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.bugUpVotes.upsert({
        where: {
          bugId_userId: {
            bugId: input.id,
            userId: ctx.session.user.id,
          },
        },
        create: {
          bugId: input.id,
          userId: ctx.session.user.id,
        },
        update: {},
      });
    }),
  // Downvote a bug report
  downvote: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.prisma.bugUpVotes.delete({
          where: {
            bugId_userId: {
              bugId: input.id,
              userId: ctx.session.user.id,
            },
          },
        });
      } catch (e) {
        console.log("Could not delete upvote: ", e);
      }
    }),

  // Comment on a bug report
  createComment: protectedProcedure
    .input(createCommentSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.bugComment.create({
        data: {
          content: input.comment,
          userId: ctx.session.user.id,
          bugId: input.bug_id,
        },
      });
    }),
  // Get comments for a given bug report
  getComments: publicProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.bugComment.findMany({
        where: { bugId: input.id },
        include: {
          user: {
            select: {
              username: true,
              avatar: true,
              rank: true,
              level: true,
            },
          },
        },
      });
    }),
});
