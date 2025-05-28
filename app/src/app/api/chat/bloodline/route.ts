import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { checkContentAiAuth } from "@/libs/llm";
import { BloodlineValidator } from "@/libs/combat/types";
import type { CoreMessage } from "ai";
import { OPENAI_CONTENT_MODEL } from "@/drizzle/constants";
import { convertToOpenaiCompatibleSchema } from "@/libs/zod_utils";

export async function POST(req: Request) {
  // Auth guard
  await checkContentAiAuth();

  // Call LLM
  const { messages } = (await req.json()) as { messages: CoreMessage[] };
  const schema = convertToOpenaiCompatibleSchema(
    BloodlineValidator.omit({ effects: true, villageId: true }),
  );
  const result = streamText({
    model: openai(OPENAI_CONTENT_MODEL),
    system: `You are a helpful assistant tasked with creating new bloodlines set in the ninja world of Seichi. 
    Your primary task is to call the function 'updateBloodline' with appropriate parameters to update the bloodline shown to the user.
    Do not give detailed instructions to the user on what bloodline is created, instead just give a brief summary and start creating it.
    Do not use markdown.
    Do not ask the user for clarifying questions; if details are left out, simply fill in best guesses for the bloodline.
    Only update the bloodline if the user asks you to do so or asks you to create a new bloodline.`,
    messages,
    tools: {
      updateBloodline: {
        description: "Update bloodline shown to the user",
        parameters: schema,
      },
    },
    maxSteps: 2,
  });

  return result.toDataStreamResponse();
}
