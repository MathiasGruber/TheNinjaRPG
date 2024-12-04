import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { baseServerResponse, errorResponse } from "../trpc";
import { sql, eq, and, isNotNull } from "drizzle-orm";
import { userData, conceptImage, userLikes } from "@/drizzle/schema";
import { fetchUser } from "@/routers/profile";
import { z } from "zod";
import { env } from "@/env/server.mjs";
import { conceptArtFilterSchema, conceptArtPromptSchema } from "@/validators/art";
import { getTimeFrameinSeconds } from "@/validators/art";
import { SmileyEmotions } from "@/drizzle/constants";
import Replicate from "replicate";
import type { inferRouterOutputs } from "@trpc/server";
import type { DrizzleClient } from "../../db";
import { syncImage, txt2img } from "@/libs/replicate";

const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN,
});

export const conceptartRouter = createTRPCRouter({
  check: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const prediction = await replicate.predictions.get(input.id);
      return syncImage(ctx.drizzle, prediction, ctx.userId);
    }),
  toggleEmotion: protectedProcedure
    .input(z.object({ imageId: z.string(), type: z.enum(SmileyEmotions) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const result = await fetchImage(ctx.drizzle, input.imageId, ctx.userId);
      // Guard
      if (!result) return errorResponse("Image not found");
      // Mutate
      const hasLike = result?.likes.find((like) => like.type === input.type);
      await ctx.drizzle
        .update(conceptImage)
        .set({
          ...(input.type === "like"
            ? { n_likes: result.n_likes + (hasLike ? -1 : 1) }
            : {}),
          ...(input.type === "love"
            ? { n_loves: result.n_loves + (hasLike ? -1 : 1) }
            : {}),
          ...(input.type === "laugh"
            ? { n_laugh: result.n_laugh + (hasLike ? -1 : 1) }
            : {}),
        })
        .where(eq(conceptImage.id, input.imageId));
      if (hasLike) {
        await ctx.drizzle
          .delete(userLikes)
          .where(
            and(
              eq(userLikes.userId, ctx.userId),
              eq(userLikes.imageId, input.imageId),
              eq(userLikes.type, input.type),
            ),
          );
      } else {
        await ctx.drizzle.insert(userLikes).values({
          userId: ctx.userId,
          imageId: input.imageId,
          type: input.type,
        });
      }
      return { success: true, message: "Emotion toggled" };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const result = await fetchImage(ctx.drizzle, input.id, ctx.userId);
      // Guard
      if (!result) return errorResponse("Image not found");
      if (result.userId !== ctx.userId) return errorResponse("Not authorized");
      // Mutate
      await ctx.drizzle.delete(conceptImage).where(eq(conceptImage.id, input.id));
      return { success: true, message: "Image deleted" };
    }),
  create: protectedProcedure
    .input(conceptArtPromptSchema)
    .output(baseServerResponse.extend({ imageId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Query
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Guard
      if (user.reputationPoints < 1) {
        return errorResponse("Not enough reputation points");
      }
      // Mutate
      const output = await txt2img({
        prompt:
          input.prompt +
          ", trending on ArtStation, trending on CGSociety, Intricate, High Detail, Sharp focus, dramatic, midjourney",
        width: 576,
        height: 768,
        negative_prompt: input.negative_prompt,
        guidance_scale: input.guidance_scale,
        seed: input.seed,
      });
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({ reputationPoints: sql`${userData.reputationPoints}- 1` })
          .where(eq(userData.userId, ctx.userId)),
        ctx.drizzle.insert(conceptImage).values({
          userId: ctx.userId,
          prompt: input.prompt,
          negative_prompt: input.negative_prompt,
          seed: input.seed,
          id: output.id,
          status: output.status,
        }),
      ]);
      return { success: true, message: "Image created", imageId: output.id };
    }),
  getAll: publicProcedure
    .input(
      z
        .object({
          cursor: z.number().nullish(),
          limit: z.number().min(1).max(500),
        })
        .merge(conceptArtFilterSchema),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const userSearch = ctx?.userId ?? "none";
      const secondsBack = getTimeFrameinSeconds(input.time_frame);
      const results = await ctx.drizzle.query.conceptImage.findMany({
        extras: {
          sumReaction:
            sql<number>`${conceptImage.n_likes} + ${conceptImage.n_loves} + ${conceptImage.n_laugh}`.as(
              "total_reaction",
            ),
        },
        where: and(
          ...[
            input.only_own
              ? eq(conceptImage.userId, userSearch)
              : isNotNull(conceptImage.userId),
            secondsBack
              ? sql`createdAt > DATE_SUB(NOW(), INTERVAL ${secondsBack} SECOND)`
              : undefined,
          ],
        ),
        offset: skip,
        limit: input.limit,
        with: {
          user: {
            columns: {
              userId: true,
              username: true,
              avatar: true,
              level: true,
              rank: true,
              isOutlaw: true,
              role: true,
              federalStatus: true,
            },
          },
          likes: {
            where: (userLikes) => eq(userLikes.userId, userSearch),
          },
        },
        orderBy: (image, { desc }) => [
          ...(input.sort === "Most Liked" ? [desc(sql`total_reaction`)] : []),
          ...(input.sort === "Most Recent" ? [desc(sql`createdAt`)] : []),
        ],
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
      const image = await fetchImage(ctx.drizzle, input.id, ctx.userId ?? "");
      return image || null;
    }),
});

export const fetchImage = async (
  client: DrizzleClient,
  imageId: string,
  userId: string,
) => {
  const result = await client.query.conceptImage.findFirst({
    where: eq(conceptImage.id, imageId),
    with: {
      user: {
        columns: {
          userId: true,
          username: true,
          avatar: true,
          level: true,
          rank: true,
          isOutlaw: true,
          role: true,
          federalStatus: true,
        },
      },
      likes: {
        where: (userLikes) => eq(userLikes.userId, userId),
      },
    },
  });
  return result;
};

type RouterOutput = inferRouterOutputs<typeof conceptartRouter>;
export type ImageWithRelations = RouterOutput["get"];
