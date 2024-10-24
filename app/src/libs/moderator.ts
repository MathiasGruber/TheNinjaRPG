import OpenAI from "openai";
import { nanoid } from "nanoid";
import { automatedModeration } from "@/drizzle/schema";
import { generateObject } from "ai";
import { z } from "zod";
import { openai as openaiSdk } from "@ai-sdk/openai";
import { eq } from "drizzle-orm";
import {
  userReport,
  conversationComment,
  forumPost,
  userReportComment,
} from "@/drizzle/schema";
import { TERR_BOT_ID } from "@/drizzle/constants";
import type { DrizzleClient } from "@/server/db";
import type { AutomoderationCategory } from "@/drizzle/constants";

// OpenAI client
const openai = new OpenAI();

// Moderator Prompt
const getSystemPrompt = (content: string) => `
  You're a moderator for a popular online game. You're responsible for enforcing the game's rules and ensuring a safe and enjoyable experience for all players. Here are the rules you need to enforce:

  # Language and Content
  - Use only English in public areas.
  - Follow PEGI 12+ guidelines; our rules govern online interactions.
  - Prohibited content: strong language, sexual references or content, inappropriate drug references, spamming.
  - Prohibited: sexual expletives, excessive profanity, offensive language, racial slurs, discriminatory or hateful content, harmful insults.
  - Censoring words with symbols doesn't make them acceptable.

  # Spamming
  - Includes excessive capitals, formatting (bold, italics), punctuation, symbols, nonsensical posts, stretching/breaking chat layouts.
  - Avoid posting purely for advertising.

  # Appropriateness
  - Prohibited content: explicit sexual material, graphic violence, hate symbols, extremist imagery, self-harm content, animal cruelty, shocking or disturbing content.
  - Moderators assess content intent and perception individually.

  # Conduct
  - Treat others with courtesy and respect.
  - Harassment, trolling, or pestering is prohibited, including misuse of game features to do so.

  ## Harassment Examples
  - Discrimination based on race, religion, gender, nationality, or occupation.
  - Obscenity, indecency, distressing historical references.
  - Stalking or sharing personal info without consent.
  - Intentional emotional distress.
  - Actions impacting others' gameplay without being harassment.
  - Examples: belittling opinions, disrupting public spaces, offensive avatars, excluding players beyond normal gameplay, spoiling events, ignoring moderator instructions.
  Trolling
  - Inciting negative responses, baiting, insulting, or disruptive behavior is prohibited.

  Staff Positions
  - Do not pester staff about becoming a staff member; excessive requests may be penalized.

  Reports
  - Do not encourage mass reporting or use reports for personal revenge.
  - Keep discussions about bans and punishments out of public chat.
  - Staff-accessible user information is confidential; sharing it is prohibited and severely punished.
  - Excuses like hacks or accidents don't exempt you from responsibility.
  - Admins won't alter user data except in exceptional cases.
  - Unethical requests may lead to penalties.
  - Impersonating staff is forbidden.

  Please review the following content and determine if it violates the game's rules:

  [USER]: ${content}

  In your reasoning, do not include statements like "a report should be created" or "warrents further review".
`;

export const moderateContent = async (
  client: DrizzleClient,
  content: string,
  userId: string,
  relationType: AutomoderationCategory,
  relationId: string,
) => {
  // Step 1: Ask moderation API if anything is suspecious
  const moderation = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: content,
  });
  const result = moderation.results?.[0];
  if (result?.flagged) {
    // Step 2: Ask AI if we should make a report
    const { object } = await generateObject({
      model: openaiSdk("gpt-4o"),
      schema: z.object({
        createReport: z.boolean(),
        reasoning: z.string(),
      }),
      prompt: getSystemPrompt(content),
    });
    // Step 3: Insert moderation & if relevant the report + update reported status
    return Promise.all([
      client.insert(automatedModeration).values({
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
      }),
      ...(object.createReport
        ? [
            client.insert(userReport).values({
              id: nanoid(),
              reporterUserId: TERR_BOT_ID,
              reportedUserId: userId,
              system: relationType,
              infraction: { content },
              reason: object.reasoning,
            }),
            updateReportedStatus(client, relationType, relationId),
          ]
        : []),
    ]);
  }
};

const updateReportedStatus = async (
  client: DrizzleClient,
  system: AutomoderationCategory,
  relationId: string,
) => {
  switch (system) {
    case "comment":
      await client
        .update(conversationComment)
        .set({ isReported: true })
        .where(eq(conversationComment.id, relationId));
      break;
    case "forumPost":
      await client
        .update(forumPost)
        .set({ isReported: true })
        .where(eq(forumPost.id, relationId));
      break;
    case "userReport":
      await client
        .update(userReportComment)
        .set({ isReported: true })
        .where(eq(userReportComment.id, relationId));
      break;
  }
};
