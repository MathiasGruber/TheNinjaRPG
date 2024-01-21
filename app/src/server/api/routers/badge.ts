import { z } from "zod";
import { nanoid } from "nanoid";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError, baseServerResponse } from "@/api/trpc";
import { eq } from "drizzle-orm";
import { badge, userBadge } from "@/drizzle/schema";
import { actionLog } from "@/drizzle/schema";
import { BadgeValidator } from "@/validators/badge";
import { fetchUser } from "@/routers/profile";
import { canChangeContent } from "@/utils/permissions";
import { callDiscordContent } from "@/libs/discord";
import HumanDiff from "human-object-diff";
import { setEmptyStringsToNulls } from "@/utils/typeutils";
import type { DrizzleClient } from "@/server/db";

export const badgeRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(500),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.badge.findMany({
        offset: skip,
        limit: input.limit,
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await fetchBadge(ctx.drizzle, input.id);
      if (!result) {
        throw serverError("NOT_FOUND", "Badge not found");
      }
      return result;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: BadgeValidator }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      setEmptyStringsToNulls(input.data);
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchBadge(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        // Calculate diff
        const diff = new HumanDiff({ objectName: "badge" }).diff(entry, {
          id: entry.id,
          createdAt: entry.createdAt,
          ...input.data,
        });
        // Update database
        await Promise.all([
          ctx.drizzle.update(badge).set(input.data).where(eq(badge.id, entry.id)),
          ctx.drizzle.insert(actionLog).values({
            id: nanoid(),
            userId: ctx.userId,
            tableName: "badge",
            changes: diff,
            relatedId: entry.id,
            relatedMsg: `Update: ${entry.name}`,
            relatedImage: entry.image,
          }),
        ]);
        if (process.env.NODE_ENV !== "development") {
          await callDiscordContent(user.username, entry.name, diff, entry.image);
        }
        return { success: true, message: `Data updated: ${diff.join(". ")}` };
      } else {
        return { success: false, message: `Not allowed to edit badge` };
      }
    }),
  create: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (canChangeContent(user.role)) {
      const id = nanoid();
      await ctx.drizzle.insert(badge).values({
        id: id,
        name: "Placeholder",
        image: "https://utfs.io/f/630cf6e7-c152-4dea-a3ff-821de76d7f5a_default.webp",
        description: "",
      });
      return { success: true, message: id };
    } else {
      return { success: false, message: `Not allowed to create badge` };
    }
  }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchBadge(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        await Promise.all([
          ctx.drizzle.delete(badge).where(eq(badge.id, input.id)),
          ctx.drizzle.delete(userBadge).where(eq(userBadge.badgeId, input.id)),
        ]);
        return { success: true, message: `Badge deleted` };
      } else {
        return { success: false, message: `Not allowed to delete badge` };
      }
    }),
});

/**
 * COMMON QUERIES WHICH ARE REUSED
 */

export const fetchBadge = async (client: DrizzleClient, id: string) => {
  return await client.query.badge.findFirst({
    where: eq(badge.id, id),
  });
};
