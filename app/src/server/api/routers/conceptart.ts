import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError } from "../trpc";
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
import { syncImage } from "@/libs/replicate";

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
    .mutation(async ({ ctx, input }) => {
      const result = await fetchImage(ctx.drizzle, input.imageId, ctx.userId);
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
              eq(userLikes.type, input.type)
            )
          );
      } else {
        await ctx.drizzle.insert(userLikes).values({
          userId: ctx.userId,
          imageId: input.imageId,
          type: input.type,
        });
      }
      return true;
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await fetchImage(ctx.drizzle, input.id, ctx.userId);
      if (result.userId !== ctx.userId) {
        throw serverError("PRECONDITION_FAILED", "Not authorized");
      }
      await ctx.drizzle.delete(conceptImage).where(eq(conceptImage.id, input.id));
      return true;
    }),
  create: protectedProcedure
    .input(conceptArtPromptSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!user || user.reputationPoints < 1) {
        throw serverError("PRECONDITION_FAILED", "Not enough reputation points");
      }
      const output = await replicate.predictions.create({
        version: "ed6d8bee9a278b0d7125872bddfb9dd3fc4c401426ad634d8246a660e387475b",
        input: {
          seed: input.seed,
          width: 576,
          height: 768,
          prompt:
            input.prompt +
            ", trending on ArtStation, trending on CGSociety, Intricate, High Detail, Sharp focus, dramatic, midjourney",
          scheduler: "K_EULER_ANCESTRAL",
          num_outputs: 1,
          guidance_scale: input.guidance_scale,
          safety_checker: true,
          negative_prompt:
            input.negative_prompt +
            ", child, nsfw, porn, sex, canvas frame, cartoon, 3d, ((disfigured)), ((bad art)), ((deformed)),((extra limbs)),((close up)),((b&w)), wierd colors, blurry,  (((duplicate))), ((morbid)), ((mutilated)), [out of frame], extra fingers, mutated hands, ((poorly drawn hands)), ((poorly drawn face)), (((mutation))), (((deformed))), ((ugly)), blurry, ((bad anatomy)), (((bad proportions))), ((extra limbs)), cloned face, (((disfigured))), out of frame, ugly, extra limbs, (bad anatomy), gross proportions, (malformed limbs), ((missing arms)), ((missing legs)), (((extra arms))), (((extra legs))), mutated hands, (fused fingers), (too many fingers), (((long neck))), Photoshop, video game, ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, mutation, mutated, extra limbs, extra legs, extra arms, disfigured, deformed, cross-eye, body out of frame, blurry, bad art, bad anatomy, 3d render ENSD: 31337",
          prompt_strength: 0.8,
          num_inference_steps: 50,
          webhook: `https://www.theninja-rpg.com/api/replicate`,
        },
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
      return output.id;
    }),
  getAll: publicProcedure
    .input(
      z
        .object({
          cursor: z.number().nullish(),
          limit: z.number().min(1).max(500),
        })
        .merge(conceptArtFilterSchema)
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
              "total_reaction"
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
          ]
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
      return await fetchImage(ctx.drizzle, input.id, ctx.userId ?? "");
    }),
});

export const fetchImage = async (
  client: DrizzleClient,
  imageId: string,
  userId: string
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
          role: true,
          federalStatus: true,
        },
      },
      likes: {
        where: (userLikes) => eq(userLikes.userId, userId),
      },
    },
  });
  if (!result) {
    throw serverError("PRECONDITION_FAILED", "Content not found");
  }
  return result;
};

type RouterOutput = inferRouterOutputs<typeof conceptartRouter>;
export type ImageWithRelations = RouterOutput["get"];
