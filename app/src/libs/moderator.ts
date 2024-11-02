import OpenAI from "openai";
import { nanoid } from "nanoid";
import { automatedModeration } from "@/drizzle/schema";
import { generateObject } from "ai";
import { z } from "zod";
import { openai as openaiSdk } from "@ai-sdk/openai";
import { eq, lt, and, sql, desc } from "drizzle-orm";
import { conversationComment, forumPost, userReportComment } from "@/drizzle/schema";
import { userData } from "@/drizzle/schema";
import { generateText } from "ai";
import { insertUserReport } from "@/routers/reports";
import { TERR_BOT_ID, REPORT_CONTEXT_WINDOW, BanStates } from "@/drizzle/constants";
import type { UserReport } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import type { AutomoderationCategory } from "@/drizzle/constants";

// OpenAI client
const openai = new OpenAI();

// Moderator Prompt
const getSystemPrompt = (content: string, previous: PreviousReport[]) => `
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

  # Guide
  - In your reasoning, do not include statements like "a report should be created" or "warrents further review".
  - If you do not believe a report should be created, please mark it as "REPORT_CLEARED"

  # Previous Reports with Actions
  The following are the previous reports found in the system and their decisions, 
  which may help you in your decision-making process. For each previous decision a comment
  on the decision is included. Please be aware that some reports may have been cleared because 
  they were handled in another capacity.

  ${previous
    .map((report) => {
      return `
      - [REPORT]: ${JSON.stringify(report.infraction)}
      - [DECISION]: ${report.status}
      - [COMMENT]: ${report.comment}
      `;
    })
    .join("\n\n")}
`;

export const moderateContent = async (
  client: DrizzleClient,
  info: {
    content: string;
    userId: string;
    relationType: AutomoderationCategory;
    relationId: string;
    contextId?: string;
  },
) => {
  // Destructure
  const { content, userId, relationType, relationId, contextId } = info;
  // Step 1: Ask moderation API if anything is suspecious
  const moderation = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: content,
  });
  const result = moderation.results?.[0];
  if (result?.flagged) {
    // Step 2: Ask AI if we should make a report
    const [{ decision, aiInterpretation }, context] = await Promise.all([
      generateModerationDecision(client, content),
      getAdditionalContext(client, relationType, new Date(), contextId),
    ]);
    // Step 3: Insert moderation & if relevant the report + update reported status
    return Promise.all([
      client.insert(automatedModeration).values({
        id: nanoid(),
        content: content,
        userId: userId,
        relationType: relationType,
        sexual: result.categories.sexual,
        sexual_minors: result.categories["sexual/minors"],
        harassment: result.categories.harassment,
        harassment_threatening: result.categories["harassment/threatening"],
        hate: result.categories.hate,
        hate_threatening: result.categories["hate/threatening"],
        illicit: result.categories.illicit,
        illicit_violent: result.categories["illicit/violent"],
        self_harm: result.categories["self-harm"],
        self_harm_intent: result.categories["self-harm/intent"],
        self_harm_instructions: result.categories["self-harm/instructions"],
        violence: result.categories.violence,
        violence_graphic: result.categories["violence/graphic"],
      }),
      ...(decision.createReport !== "REPORT_CLEARED"
        ? [
            insertUserReport(client, {
              userId: TERR_BOT_ID,
              reportedUserId: userId,
              system: relationType,
              infraction: { content },
              reason: decision.reasoning,
              aiInterpretation: aiInterpretation,
              predictedStatus: decision.createReport,
              additionalContext: context,
            }),
            updateReportedStatus(client, relationType, relationId),
          ]
        : []),
    ]);
  }
};

export const getAdditionalContext = async (
  client: DrizzleClient,
  system: string,
  timestamp?: Date | null,
  conversationId?: string | null,
) => {
  if (!conversationId) return [];
  switch (system) {
    case "comment":
    case "privateMessage":
    case "conversation_comment":
      return await client
        .select({
          userId: conversationComment.userId,
          username: userData.username,
          avatar: userData.avatar,
          level: userData.level,
          rank: userData.rank,
          federalStatus: userData.federalStatus,
          isOutlaw: userData.isOutlaw,
          role: userData.role,
          content: conversationComment.content,
          createdAt: conversationComment.createdAt,
        })
        .from(conversationComment)
        .innerJoin(userData, eq(conversationComment.userId, userData.userId))
        .where(
          and(
            eq(conversationComment.conversationId, conversationId),
            lt(conversationComment.createdAt, timestamp || new Date()),
          ),
        )
        .orderBy(desc(conversationComment.createdAt))
        .limit(REPORT_CONTEXT_WINDOW);
    case "forumPost":
    case "forum_comment":
      return await client
        .select({
          userId: forumPost.userId,
          username: userData.username,
          avatar: userData.avatar,
          level: userData.level,
          rank: userData.rank,
          federalStatus: userData.federalStatus,
          isOutlaw: userData.isOutlaw,
          role: userData.role,
          content: forumPost.content,
          createdAt: forumPost.createdAt,
        })
        .from(forumPost)
        .innerJoin(userData, eq(forumPost.userId, userData.userId))
        .where(
          and(
            eq(forumPost.threadId, conversationId),
            lt(forumPost.createdAt, timestamp || new Date()),
          ),
        )
        .orderBy(desc(forumPost.createdAt))
        .limit(REPORT_CONTEXT_WINDOW);
    default:
      return [];
  }
};

export const generateAiSummary = async (content: unknown) => {
  const { text } = await generateText({
    model: openaiSdk("gpt-4o"),
    prompt: `
    Write a succint summary of the situation & context in this user post: 
      ${JSON.stringify(content)}

    - Do not include any IDs in the summary.
    `,
  });
  return text;
};

// TODO: Update to vector search when more stable
type PreviousReport = UserReport & { score: number; comment: string };
export const getRelatedReports = async (
  client: DrizzleClient,
  aiInterpretation: string,
) => {
  const results = await client.execute(sql`
    SELECT 
      UserReport.createdAt,
      UserReport.id,
      UserReport.aiInterpretation, 
      UserReport.reason,
      UserReport.infraction, 
      UserReport.status,
      UserReportComment.content as comment,
      MATCH(UserReport.aiInterpretation) AGAINST(${aiInterpretation}) as score
    FROM UserReport
    INNER JOIN UserReportComment ON UserReport.id = UserReportComment.reportId
    WHERE 
      MATCH(UserReport.aiInterpretation) AGAINST(${aiInterpretation}) AND
      UserReport.aiInterpretation != "" AND
      UserReport.system != "user_profile" AND
      UserReport.status != 'UNVIEWED'
    ORDER BY score DESC
    LIMIT 5`);
  return results.rows as PreviousReport[];
};

export const generateModerationDecision = async (
  client: DrizzleClient,
  content: string,
) => {
  // Step 1: Generate summary of the content
  const aiInterpretation = await generateAiSummary({ content });
  // Step 2: Fetch related userReport using full text search
  const prevReports = await getRelatedReports(client, aiInterpretation);
  // Step 3: Create decision with AI based on summary and related reports
  const { object } = await generateObject({
    model: openaiSdk("gpt-4o"),
    schema: z.object({
      createReport: z.enum(BanStates),
      reasoning: z.string(),
    }),
    prompt: getSystemPrompt(content, prevReports),
  });
  // console.log("=====================================");
  // console.log(getSystemPrompt(content, prevReports));
  // console.log("DECISION: ", object);
  return { decision: object, aiInterpretation };
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
