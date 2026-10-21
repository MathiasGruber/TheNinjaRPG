import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import { historicalSoundEffect, userData } from "@/drizzle/schema";
import { generateAndUploadAudio } from "@/libs/replicate";
import {
  baseServerResponse,
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
} from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { canChangeContent } from "@/utils/permissions";
import type { GenerateAudioInput } from "@/validators/audio";
import { generateAudioSchema } from "@/validators/audio";
import { mediaHistoryQuerySchema } from "@/validators/mediaHistory";

export const audioRouter = createTRPCRouter({
  generate: protectedProcedure
    .input(generateAudioSchema)
    .output(baseServerResponse.extend({ url: z.string().nullish() }))
    .mutation(async ({ ctx, input }) => {
      // Query
      const user = await ctx.drizzle.query.userData.findFirst({
        where: eq(userData.userId, ctx.userId),
      });
      // Guard
      if (!user) return errorResponse("User not found");
      if (user.isBanned) return errorResponse("You are banned");
      if (!canChangeContent(user.role)) return errorResponse("Not allowed");
      // Generate and upload audio
      const url = await generateAndUploadAudio(input);
      // Guard
      if (!url) return errorResponse("Failed to upload audio");
      // Final insert (store prompts)
      await insertHistoricalSoundEffect(ctx.drizzle, ctx.userId, url, input);
      return { success: true, message: "Audio generated", url };
    }),

  getHistorical: protectedProcedure
    .input(mediaHistoryQuerySchema)
    .query(async ({ ctx, input }) => {
      // Query
      const relationId = input.relationId ?? ctx.userId;
      const limit = input.limit ?? 50;
      const { cursor } = input;
      const rows = await ctx.drizzle
        .select()
        .from(historicalSoundEffect)
        .where(
          and(
            eq(historicalSoundEffect.relationId, relationId),
            eq(historicalSoundEffect.done, true),
            isNotNull(historicalSoundEffect.url),
            cursor != null ? lte(historicalSoundEffect.id, cursor) : undefined,
          ),
        )
        .orderBy(desc(historicalSoundEffect.id))
        .limit(limit + 1);

      let nextCursor: number | undefined;
      if (rows.length > limit) {
        const nextItem = rows.pop();
        nextCursor = nextItem?.id;
      }
      return { data: rows, nextCursor };
    }),
});

/**
 *
 * @param ctx - The database client
 * @param input - The input data
 */
export const insertHistoricalSoundEffect = async (
  client: DrizzleClient,
  userId: string,
  url: string,
  config?: GenerateAudioInput,
) => {
  await client.insert(historicalSoundEffect).values({
    ...(config ?? {}),
    userId,
    url,
    status: "success",
    done: true,
  });
};
