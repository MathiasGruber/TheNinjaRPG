import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { eq } from "drizzle-orm";
import { actionLog } from "@/drizzle/schema";

export const logsRouter = createTRPCRouter({
  getContentChanges: protectedProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        table: z.enum(["ai", "item", "bloodline", "jutsu", "bloodline"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const entries = await ctx.drizzle.query.actionLog.findMany({
        where: eq(actionLog.tableName, input.table),
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
        limit: input.limit,
      });
      const nextCursor = entries.length < input.limit ? null : currentCursor + 1;
      return {
        data: entries,
        nextCursor: nextCursor,
      };
    }),
});
