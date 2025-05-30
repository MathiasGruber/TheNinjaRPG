import { z } from "zod";
import {
  baseServerResponse,
  createTRPCRouter,
  protectedProcedure,
  serverError,
} from "../trpc";
import { canChangeContent } from "@/utils/permissions";
import { fetchUser } from "@/routers/profile";
import {
  fetchReplicateResult,
  txt2imgReplicate,
  txt2imgGPT,
  img2model,
  uploadToUT,
} from "@/libs/replicate";
import { historicalAvatar } from "@/drizzle/schema";
import { requestBgRemoval } from "@/libs/replicate";
import { and, gte, sql } from "drizzle-orm";
import { eq } from "drizzle-orm";

export const openaiRouter = createTRPCRouter({
  create3dModel: protectedProcedure
    .input(
      z.object({
        imgUrl: z.string().url("imgUrl must be a valid http/https URL"),
        field: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      const result = await img2model(input.imgUrl);
      return { replicateId: result.id };
    }),
  createImgReplicate: protectedProcedure
    .input(z.object({ prompt: z.string(), field: z.string(), removeBg: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      const result = await txt2imgReplicate({
        prompt: input.prompt,
        width: 512,
        height: 512,
      });
      return { replicateId: result.id };
    }),
  createImgGPT: protectedProcedure
    .input(
      z.object({
        preprompt: z.string(),
        prompt: z.string(),
        previousImg: z.string().optional(),
        removeBg: z.boolean(),
        relationId: z.string(),
      }),
    )
    .output(baseServerResponse.extend({ url: z.string().url().optional().nullable() }))
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, historicalToday] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.historicalAvatar.findMany({
          where: and(
            eq(historicalAvatar.status, "content-success"),
            eq(historicalAvatar.done, 1),
            gte(historicalAvatar.createdAt, sql`NOW() - INTERVAL 1 DAY`),
          ),
        }),
      ]);
      // Guard
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      if (historicalToday.length > 100) {
        throw serverError(
          "TOO_MANY_REQUESTS",
          "Maximum of 100 creations per day reached",
        );
      }
      // Create image
      const resultUrl = await txt2imgGPT({
        preprompt: input.preprompt,
        prompt: input.prompt,
        previousImg: input.previousImg,
        removeBg: input.removeBg,
        userId: ctx.userId,
        width: 256,
        height: 256,
      });
      // Store for future reference
      if (resultUrl) {
        await ctx.drizzle.insert(historicalAvatar).values({
          avatar: resultUrl,
          userId: input.relationId,
          status: "content-success",
          done: 1,
        });
      }
      return { success: true, message: "Image generated", url: resultUrl };
    }),
  removeBg: protectedProcedure
    .input(z.object({ url: z.string(), field: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      const result = await requestBgRemoval(input.url);
      return { replicateId: result.id, temp: result };
    }),
  fetchReplicateResult: protectedProcedure
    .input(
      z.object({ replicateId: z.string(), field: z.string(), removeBg: z.boolean() }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      const { prediction, replicateUrl } = await fetchReplicateResult(
        input.replicateId,
      );
      if (
        prediction.status == "failed" ||
        prediction.status == "canceled" ||
        (prediction.status == "succeeded" && !prediction.output)
      ) {
        return { status: "failed", url: null };
      } else if (prediction.status == "succeeded") {
        if (replicateUrl) {
          const url = await uploadToUT(replicateUrl);
          if (url) {
            return { status: "succeeded", url };
          }
        }
        return { status: "failed", url: null };
      } else {
        return { status: "running", url: null };
      }
    }),
});
