import sanitize from "../../../utils/sanitize";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, sql, and, desc } from "drizzle-orm";
import { bugReport, bugVotes, conversation } from "../../../../drizzle/schema";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { serverError } from "../trpc";
import { bugreportSchema } from "../../../validators/bugs";
import { fetchUser } from "./profile";
import type { DrizzleClient } from "../../db";

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
      const bugs = await ctx.drizzle.query.bugReport.findMany({
        offset: skip,
        limit: input.limit,
        where: eq(bugReport.isResolved, input.is_active ? 0 : 1),
        with: {
          user: true,
          votes: true,
        },
        orderBy: [desc(bugReport.popularity), desc(bugReport.createdAt)],
      });
      const nextCursor = bugs.length < input.limit ? null : currentCursor + 1;
      return {
        data: bugs,
        nextCursor: nextCursor,
      };
    }),
  // Get a single bug report
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return await fetchBugReport(ctx.drizzle, input.id);
    }),
  // Create a new bug report
  create: protectedProcedure.input(bugreportSchema).mutation(async ({ ctx, input }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (user.isBanned) {
      throw serverError("UNAUTHORIZED", "You are banned");
    }
    const convoId = nanoid();
    await ctx.drizzle.insert(conversation).values({
      id: convoId,
      title: input.title,
      createdById: ctx.userId,
    });
    return await ctx.drizzle.insert(bugReport).values({
      id: nanoid(),
      title: input.title,
      content: sanitize(input.content),
      system: input.system,
      userId: ctx.userId,
      conversationId: convoId,
    });
  }),
  // Delete a bug report
  delete: protectedProcedure
    .input(z.object({ bugId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const report = await fetchBugReport(ctx.drizzle, input.bugId);
      if (report && user.role === "ADMIN") {
        const convoId = report.conversationId;
        await ctx.drizzle.delete(bugReport).where(eq(bugReport.id, input.bugId));
        await ctx.drizzle.delete(bugVotes).where(eq(bugVotes.bugId, input.bugId));
        await ctx.drizzle.delete(conversation).where(eq(conversation.id, convoId));
      } else {
        throw serverError("UNAUTHORIZED", "Only admins can delete bugs");
      }
    }),
  // Upvote a bug report
  vote: protectedProcedure
    .input(
      z.object({
        bugId: z.string(),
        value: z.number().min(-1).max(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await fetchBugReport(ctx.drizzle, input.bugId);
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.isBanned) {
        throw serverError("UNAUTHORIZED", "You are banned");
      }
      const currentVote = await ctx.drizzle.query.bugVotes.findFirst({
        where: and(eq(bugVotes.bugId, report.id), eq(bugVotes.userId, ctx.userId)),
      });
      if (currentVote) {
        await ctx.drizzle
          .update(bugVotes)
          .set({ value: input.value })
          .where(eq(bugVotes.id, currentVote.id));
      } else {
        await ctx.drizzle.insert(bugVotes).values({
          id: nanoid(),
          bugId: report.id,
          userId: ctx.userId,
          value: input.value,
        });
      }
      const result = await ctx.drizzle
        .select({ sum: sql<number>`sum(${bugVotes.value})` })
        .from(bugVotes)
        .where(eq(bugVotes.bugId, input.bugId));
      const popularity = result?.[0]?.sum || 0;
      return await ctx.drizzle
        .update(bugReport)
        .set({ popularity: popularity })
        .where(eq(bugReport.id, report.id));
    }),
  // Resolve / unresolve bug report
  resolve: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.role === "ADMIN") {
        const report = await fetchBugReport(ctx.drizzle, input.id);
        await ctx.drizzle
          .update(bugReport)
          .set({ isResolved: report.isResolved ? 0 : 1 })
          .where(eq(bugReport.id, report.id));
        return await ctx.drizzle
          .update(conversation)
          .set({ isLocked: report.isResolved ? 0 : 1 })
          .where(eq(conversation.id, report.conversationId));
      } else {
        throw serverError("UNAUTHORIZED", "Only admins can resolve bugs");
      }
    }),
});

export const fetchBugReport = async (client: DrizzleClient, bugId: string) => {
  const report = await client.query.bugReport.findFirst({
    where: eq(bugReport.id, bugId),
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
  });
  if (!report) {
    throw new Error("Bug report not found");
  }
  return report;
};
