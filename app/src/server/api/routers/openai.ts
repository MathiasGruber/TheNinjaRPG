import { z } from "zod";
import {
  baseServerResponse,
  createTRPCRouter,
  protectedProcedure,
  serverError,
} from "../trpc";
import { canChangeContent } from "@/utils/permissions";
import { fetchUser } from "@/routers/profile";
import { txt2imgGPT, img2model } from "@/libs/replicate";
import { historicalAvatar } from "@/drizzle/schema";
import { and, gte, sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { IMG_ORIENTATIONS } from "@/drizzle/constants";

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
  createImgGPT: protectedProcedure
    .input(
      z.object({
        preprompt: z.string(),
        prompt: z.string(),
        previousImg: z.string().optional(),
        removeBg: z.boolean(),
        relationId: z.string(),
        size: z.enum(IMG_ORIENTATIONS),
        maxDim: z.number(),
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
        width: input.maxDim,
        height: input.maxDim,
        size: input.size,
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
});
