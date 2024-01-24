import { z } from "zod";
import OpenAI from "openai";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { allObjectiveTasks } from "@/validators/objectives";
import { canChangeContent } from "@/utils/permissions";
import { serverEnv } from "src/env/schema.mjs";
import { fetchQuest } from "@/routers/quests";
import { fetchBadge } from "@/routers/badge";
import { fetchUser } from "@/routers/profile";
import { fetchBloodline } from "@/routers/bloodline";
import { fetchReplicateResult, txt2img, uploadToUT } from "@/libs/replicate";
import { requestBgRemoval } from "@/libs/replicate";
import { tagTypes } from "@/libs/combat/types";
import { LetterRanks, QuestTypes } from "@/drizzle/constants";
import type { LetterRank, QuestType } from "@/drizzle/constants";

const client = new OpenAI({
  apiKey: serverEnv.OPENAI_API_KEY,
  maxRetries: 0,
});

type ReturnQuest = {
  name: string;
  description: string;
  successDescription: string;
  objectives: string[];
  questType: QuestType;
  requiredRank: LetterRank;
};

type ReturnBadge = {
  name: string;
  description: string;
};

type ReturnBloodline = {
  name: string;
  description: string;
  regenIncrease: number;
  rank: LetterRank;
  effects: typeof tagTypes[number][];
};

async function callOpenAI<ReturnType>(
  prompt: string,
  current: string,
  functionParameters: Record<string, unknown>
) {
  const completion = await client.chat.completions.create(
    {
      model: "gpt-4-1106-preview",
      messages: [
        {
          role: "user",
          content: `Update our TOK object, following these instructions: ${prompt}. \r\r The data for our current TOK object is ${current}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "createTokObject",
            description: "Create an updated TOK object",
            parameters: functionParameters,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "createTokObject" },
      },
    },
    { timeout: 10 * 1000 }
  );
  const args = completion?.choices?.[0]?.message?.tool_calls?.[0]?.function.arguments;
  return JSON.parse(args ?? "{}") as ReturnType;
}

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
      z.object({ replicateId: z.string(), field: z.string(), removeBg: z.boolean() })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      const { prediction, replicateUrl } = await fetchReplicateResult(
        input.replicateId
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
  createQuest: protectedProcedure
    .input(z.object({ questId: z.string(), prompt: z.string() }))
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
      return await callOpenAI<ReturnQuest>(input.prompt, JSON.stringify(quest), {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          successDescription: { type: "string" },
          objectives: {
            type: "array",
            items: {
              type: "string",
              enum: allObjectiveTasks,
            },
          },
          questType: {
            type: "string",
            enum: QuestTypes,
          },
          requiredRank: {
            type: "string",
            enum: LetterRanks,
          },
        },
        required: [
          "name",
          "questType",
          "requiredRank",
          "description",
          "successDescription",
          "objectives",
        ],
      });
    }),
  createBadge: protectedProcedure
    .input(z.object({ badgeId: z.string(), prompt: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Ensure the quest is there
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const badge = await fetchBadge(ctx.drizzle, input.badgeId);
      if (!badge) {
        throw serverError("NOT_FOUND", "Badge not found");
      }
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      // Get new content from OpenAI
      return await callOpenAI<ReturnBadge>(input.prompt, JSON.stringify(badge), {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["name", "description"],
      });
    }),
  createBloodline: protectedProcedure
    .input(z.object({ bloodlineId: z.string(), prompt: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Ensure the quest is there
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const bloodline = await fetchBloodline(ctx.drizzle, input.bloodlineId);
      if (!bloodline) {
        throw serverError("NOT_FOUND", "Bloodline not found");
      }
      if (!canChangeContent(user.role)) {
        throw serverError("UNAUTHORIZED", "You are not allowed to change content");
      }
      // Get new content from OpenAI
      return await callOpenAI<ReturnBloodline>(
        input.prompt,
        JSON.stringify(bloodline),
        {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            regenIncrease: { type: "number" },
            rank: {
              type: "string",
              enum: LetterRanks,
            },
            effects: {
              type: "array",
              items: {
                type: "string",
                enum: tagTypes,
              },
            },
          },
          required: ["name", "description", "effects", "regenIncrease", "rank"],
        }
      );
    }),
});
