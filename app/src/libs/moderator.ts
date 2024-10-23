import OpenAI from "openai";
import { nanoid } from "nanoid";
import { automatedModeration } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import type { AutomoderationCategory } from "@/drizzle/constants";

// OpenAI client
const openai = new OpenAI();

export const moderateContent = async (
  client: DrizzleClient,
  content: string,
  userId: string,
  relationType: AutomoderationCategory,
) => {
  const moderation = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: content,
  });
  const result = moderation.results?.[0];
  if (result?.flagged) {
    return client.insert(automatedModeration).values({
      id: nanoid(),
      content: content,
      userId: userId,
      relationType: relationType,
      sexual: result.categories["sexual"],
      sexual_minors: result.categories["sexual/minors"],
      harassment: result.categories["harassment"],
      harassment_threatening: result.categories["harassment/threatening"],
      hate: result.categories["hate"],
      hate_threatening: result.categories["hate/threatening"],
      illicit: result.categories["illicit"],
      illicit_violent: result.categories["illicit/violent"],
      self_harm: result.categories["self-harm"],
      self_harm_intent: result.categories["self-harm/intent"],
      self_harm_instructions: result.categories["self-harm/instructions"],
      violence: result.categories["violence"],
      violence_graphic: result.categories["violence/graphic"],
    });
  }
};
