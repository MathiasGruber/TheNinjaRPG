import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { checkContentAiAuth } from "@/libs/llm";
import { ItemValidator } from "@/libs/combat/types";
import type { CoreMessage } from "ai";

export async function POST(req: Request) {
  // Auth guard
  await checkContentAiAuth();

  // Call LLM
  const { messages } = (await req.json()) as { messages: CoreMessage[] };
  const result = streamText({
    model: openai("gpt-3.5-turbo"),
    system: `You are a helpful assistant tasked with creating new items set in the ninja world of Seichi. 
    Your primary task is to call the function 'updateItem' with appropriate parameters to update the item shown to the user.
    Do not give detailed instructions to the user on what item is created, instead just give a brief summary and start creating it.
    Do not use markdown.
    Do not ask the user for clarifying questions; if details are left out, simply fill in best guesses for the item.
    Only update the item if the user asks you to do so or asks you to create a new item.`,
    messages,
    tools: {
      updateItem: {
        description: "Update item shown to the user",
        parameters: ItemValidator,
      },
    },
    maxSteps: 2,
  });

  return result.toDataStreamResponse();
}
