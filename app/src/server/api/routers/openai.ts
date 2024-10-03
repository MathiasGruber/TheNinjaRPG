import { z } from "zod";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { canChangeContent } from "@/utils/permissions";
import { fetchUser } from "@/routers/profile";
import { fetchReplicateResult, txt2img, uploadToUT } from "@/libs/replicate";
import { requestBgRemoval } from "@/libs/replicate";

export const openaiRouter = createTRPCRouter({
  createImg: protectedProcedure
    .input(z.object({ prompt: z.string(), field: z.string(), removeBg: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      const result = await txt2img({ prompt: input.prompt, width: 512, height: 512 });
      return { replicateId: result.id };
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
  fetchImg: protectedProcedure
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
