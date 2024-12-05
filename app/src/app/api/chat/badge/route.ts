import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { checkContentAiAuth } from "@/libs/llm";
import { BadgeValidator } from "@/validators/badge";
import type { CoreMessage } from "ai";

export async function POST(req: Request) {
  // Auth guard
  await checkContentAiAuth();

  // Call LLM
  const { messages } = (await req.json()) as { messages: CoreMessage[] };
  const result = streamText({
    model: openai("gpt-4o"),
    system: `You are a helpful assistant tasked with creating new badges set in the ninja world of Seichi. 
    Your primary task is to call the function 'updateBadge' with appropriate parameters to update the badge shown to the user.
    Do not give detailed instructions to the user on what badge is created, instead just give a brief summary and start creating it.
    Do not use markdown.
    Do not ask the user for clarifying questions; if details are left out, simply fill in best guesses for the badge.
    Only update the badge if the user asks you to do so or asks you to create a new badge.`,
    messages,
    tools: {
      updateBadge: {
        description: "Update badge shown to the user",
        parameters: BadgeValidator,
      },
    },
    maxSteps: 2,
  });

  return result.toDataStreamResponse();
}
