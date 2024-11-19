import { z } from "zod";
import { nanoid } from "nanoid";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError, baseServerResponse } from "@/api/trpc";
import { eq } from "drizzle-orm";
import { gameAsset } from "@/drizzle/schema";
import { actionLog } from "@/drizzle/schema";
import { gameAssetValidator } from "@/validators/asset";
import { fetchUser } from "@/routers/profile";
import { canChangeContent } from "@/utils/permissions";
import { callDiscordContent } from "@/libs/discord";
import { calculateContentDiff } from "@/utils/diff";
import { IMG_AVATAR_DEFAULT } from "@/drizzle/constants";
import { setEmptyStringsToNulls } from "@/utils/typeutils";
import type { DrizzleClient } from "@/server/db";

export const gameAssetRouter = createTRPCRouter({
  getAllNames: publicProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.gameAsset.findMany({
      columns: { id: true, name: true, image: true },
    });
  }),
  getAll: publicProcedure
    .input(
      z
        .object({
          cursor: z.number().nullish(),
          limit: z.number().min(1).max(500),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input?.cursor ? input.cursor : 0;
      const limit = input?.limit ? input.limit : 100;
      const skip = currentCursor * limit;
      const results = await ctx.drizzle.query.gameAsset.findMany({
        offset: skip,
        limit: limit,
      });
      const nextCursor = results.length < limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await fetchgameAsset(ctx.drizzle, input.id);
      if (!result) {
        throw serverError("NOT_FOUND", "gameAsset not found");
      }
      return result;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: gameAssetValidator }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      setEmptyStringsToNulls(input.data);
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchgameAsset(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        // Calculate diff
        const diff = calculateContentDiff(entry, {
          id: entry.id,
          createdAt: entry.createdAt,
          ...input.data,
        });
        // Update database
        await Promise.all([
          ctx.drizzle
            .update(gameAsset)
            .set(input.data)
            .where(eq(gameAsset.id, entry.id)),
          ctx.drizzle.insert(actionLog).values({
            id: nanoid(),
            userId: ctx.userId,
            tableName: "gameAsset",
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
        return { success: false, message: `Not allowed to edit gameAsset` };
      }
    }),
  create: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (canChangeContent(user.role)) {
      const id = nanoid();
      await ctx.drizzle.insert(gameAsset).values({
        id: id,
        name: "Placeholder",
        type: "STATIC",
        image: IMG_AVATAR_DEFAULT,
        createdByUserId: ctx.userId,
      });
      return { success: true, message: id };
    } else {
      return { success: false, message: `Not allowed to create gameAsset` };
    }
  }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchgameAsset(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        await ctx.drizzle.delete(gameAsset).where(eq(gameAsset.id, input.id));
        return { success: true, message: `gameAsset deleted` };
      } else {
        return { success: false, message: `Not allowed to delete gameAsset` };
      }
    }),
});

/**
 * COMMON QUERIES WHICH ARE REUSED
 */

export const fetchgameAsset = async (client: DrizzleClient, id: string) => {
  return await client.query.gameAsset.findFirst({
    where: eq(gameAsset.id, id),
  });
};
