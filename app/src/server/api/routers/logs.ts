import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { eq, and } from "drizzle-orm";
import { actionLog } from "@/drizzle/schema";

export const logsRouter = createTRPCRouter({
  getContentChanges: protectedProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        relatedId: z.string().optional(),
        table: z.enum([
          "ai",
          "user",
          "item",
          "bloodline",
          "jutsu",
          "bloodline",
          "badge",
        ]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const entries = await ctx.drizzle.query.actionLog.findMany({
        where: and(
          eq(actionLog.tableName, input.table),
          ...(input.relatedId ? [eq(actionLog.relatedId, input.relatedId)] : []),
        ),
        columns: {
          userId: true,
          createdAt: true,
          changes: true,
          relatedId: true,
          relatedMsg: true,
          relatedImage: true,
        },
        with: {
          user: {
            columns: {
              username: true,
            },
          },
        },
        offset: skip,
        orderBy: (table, { desc }) => desc(table.createdAt),
        limit: input.limit,
      });
      const nextCursor = entries.length < input.limit ? null : currentCursor + 1;
      return {
        data: entries,
        nextCursor: nextCursor,
      };
    }),
});
