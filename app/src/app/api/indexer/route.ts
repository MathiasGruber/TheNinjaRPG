import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { userReport } from "@/drizzle/schema";
import { checkGameTimer, updateGameSetting } from "@/libs/gamesettings";
import { buildModerationEvidence } from "@/libs/moderation/evidence";
import { indexReportEmbeddings } from "@/libs/moderation/reportSearch";
import { generateAiSummary } from "@/libs/moderator";
import { drizzleDB } from "@/server/db";
import { authenticateCronRequest } from "@/server/utils/cron";

export async function GET(request: Request) {
  const authError = authenticateCronRequest(request);
  if (authError) return authError;

  // Check timer
  const frequency = 1;
  const response = await checkGameTimer(drizzleDB, frequency, "m", "indexer");
  if (response) return response;

  try {
    // Update timer
    await updateGameSetting(drizzleDB, `indexer-${frequency}m`, 0, new Date());

    // Fetch reports without a summary
    const reports = await drizzleDB.query.userReport.findMany({
      columns: {
        id: true,
        system: true,
        reportedUserId: true,
        infraction: true,
        additionalContext: true,
      },
      where: and(
        eq(userReport.aiInterpretation, ""),
        sql`json_length(${userReport.additionalContext}) > 0`,
        notInArray(userReport.system, ["user_profile"]),
      ),
      limit: 50,
      orderBy: asc(userReport.createdAt),
    });

    // Generate summaries before indexing eligible resolved reports
    for (const report of reports) {
      const aiInterpretation = await generateAiSummary(
        buildModerationEvidence({
          infraction: report.infraction,
          context: report.additionalContext,
          system: report.system,
          reportedUserId: report.reportedUserId ?? undefined,
        }),
      );
      await drizzleDB
        .update(userReport)
        .set({
          aiInterpretation: aiInterpretation,
        })
        .where(and(eq(userReport.id, report.id), eq(userReport.aiInterpretation, "")));
    }

    await indexReportEmbeddings(drizzleDB);

    return Response.json(`OK`);
  } catch (cause) {
    console.error(cause);
    if (cause instanceof TRPCError) {
      // An error from tRPC occured
      const httpCode = getHTTPStatusCodeFromError(cause);
      return Response.json(cause, { status: httpCode });
    }
    // Another error occured
    return Response.json("Internal server error", { status: 500 });
  }
}
