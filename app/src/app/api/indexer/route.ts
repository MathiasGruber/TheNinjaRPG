import { TRPCError } from "@trpc/server";
import { and, eq, notInArray } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userReport } from "@/drizzle/schema";
import { updateGameSetting, checkGameTimer } from "@/libs/gamesettings";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { generateModerationDecision } from "@/libs/moderator";

// TODO: Update this to perform vector based indexing once the feature is stable in planetscale + MySQL local
export async function GET() {
  // Check timer
  const frequency = 1;
  const response = await checkGameTimer(drizzleDB, frequency, "m", "indexer");
  // if (response) return response;

  try {
    // Update timer
    await updateGameSetting(drizzleDB, `indexer-${frequency}m`, 0, new Date());

    // Fetch reports without an embedding
    const reports = await drizzleDB.query.userReport.findMany({
      columns: {
        id: true,
        infraction: true,
      },
      where: and(
        eq(userReport.aiInterpretation, ""),
        notInArray(userReport.system, ["user_profile"]),
      ),
      limit: 50,
    });

    // For each report, generate an AI interpretation of the situation, and embed it
    for (const report of reports) {
      const { decision, aiInterpretation } = await generateModerationDecision(
        drizzleDB,
        JSON.stringify(report.infraction),
      );
      await drizzleDB
        .update(userReport)
        .set({
          aiInterpretation: aiInterpretation,
          predictedStatus: decision.createReport,
        })
        .where(eq(userReport.id, report.id));
    }

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
