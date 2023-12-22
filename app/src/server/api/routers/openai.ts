import { z } from "zod";
import OpenAI from "openai";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { allObjectiveTasks } from "@/validators/objectives";
import { canChangeContent } from "@/utils/permissions";
import { serverEnv } from "src/env/schema.mjs";
import { fetchQuest } from "@/routers/quests";
import { fetchUser } from "@/routers/profile";
import { requestContentImage } from "@/libs/replicate";
import { fetchReplicateResult } from "@/libs/replicate";
import { requestBgRemoval } from "@/libs/replicate";
import { copyImageToStorage } from "@/libs/aws";

const client = new OpenAI({
  apiKey: serverEnv.OPENAI_API_KEY,
  maxRetries: 0,
});

type ReturnQuest = {
  title?: string;
  description?: string;
  successDescription?: string;
  objectives?: string[];
};

export const openaiRouter = createTRPCRouter({
  createImg: protectedProcedure
    .input(z.object({ prompt: z.string(), field: z.string(), removeBg: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      const result = await requestContentImage(input.prompt);
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
      z.object({ replicateId: z.string(), field: z.string(), removeBg: z.boolean() })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      const result = await fetchReplicateResult(input.replicateId);
      if (
        result.status == "failed" ||
        result.status == "canceled" ||
        (result.status == "succeeded" && !result.output)
      ) {
        return { status: "failed", url: null };
      } else if (result.status == "succeeded") {
        const output = result.output;
        const replicateUrl = typeof output === "string" ? output : output?.[0];
        if (replicateUrl) {
          const url = await copyImageToStorage(replicateUrl, result.id);
          if (url) {
            return { status: "succeeded", url };
          }
        }
        return { status: "failed", url: null };
      } else {
        return { status: "running", url: null };
      }
    }),
  createQuest: protectedProcedure
    .input(
      z.object({
        questId: z.string(),
        freeText: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Ensure the quest is there
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const quest = await fetchQuest(ctx.drizzle, input.questId);
      if (!quest) {
        throw serverError("NOT_FOUND", "Quest not found");
      }
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      // Get new content from OpenAI
      const completion = await client.chat.completions.create(
        {
          model: "gpt-3.5-turbo-1106",
          messages: [
            {
              role: "user",
              content: `
              Please write and/or edit the title, description, and objectives for a ${
                quest.requiredRank
              }-ranked ${
                quest.questType
              }. Be specific about details of the mission, and try to follow the below user instructions.
              
              User Instructions: ${input.freeText}
              Current title: ${quest.name}
              Current description: ${quest.description}
              Current success message: ${quest.successDescription}

              The objectives must be a list of tasks, with the following available tasks: ${allObjectiveTasks.join(
                ","
              )}
            
              Return the output as JSON with the fields "title", "description", "successDescription" and "objectives".`,
            },
          ],
          response_format: { type: "json_object" },
        },
        { timeout: 10 * 1000 }
      );
      return JSON.parse(
        completion?.choices?.[0]?.message?.content ?? "{}"
      ) as ReturnQuest;
    }),
});
