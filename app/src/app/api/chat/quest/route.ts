import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { checkContentAiAuth } from "@/libs/llm";
import { QuestValidator } from "@/validators/objectives";
import type { CoreMessage } from "ai";

export async function POST(req: Request) {
  // Auth guard
  await checkContentAiAuth();

  // Call LLM
  const { messages } = (await req.json()) as { messages: CoreMessage[] };
  const result = await streamText({
    model: openai("gpt-4o"),
    system: `You are a helpful assistant tasked with creating new quests set in the ninja world of Seichi. 
    Your primary task is to call the function 'updateQuest' with appropriate parameters to update the quest shown to the user.
    Do not give detailed instructions to the user on what quest is created, instead just give a brief summary and start creating it.
    Do not use markdown.
    Do not ask the user for clarifying questions; if details are left out, simply fill in best guesses for the quest.
    Only update the quest if the user asks you to do so or asks you to create a new quest.`,
    messages,
    tools: {
      updateQuest: {
        description: "Update quest shown to the user",
        parameters: QuestValidator,
      },
    },
    maxSteps: 2,
  });

  return result.toDataStreamResponse();
}
