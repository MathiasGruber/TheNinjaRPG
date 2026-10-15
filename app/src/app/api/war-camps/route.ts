import { and, eq, isNotNull } from "drizzle-orm";
import { war } from "@/drizzle/schema";
import {
  handleEndpointError,
  lockWithMinuteTimer,
  updateGameSetting,
} from "@/libs/gamesettings";
import { drizzleDB } from "@/server/db";
import { authenticateCronRequest } from "@/server/utils/cron";
import { syncWarCamps } from "@/server/utils/objectiveWar";

const ENDPOINT_NAME = "war-camps";

/** Authenticate and lock the scheduler minute before replaying or creating camp slots. */
export async function GET(request: Request) {
  const authError = authenticateCronRequest(request);
  if (authError) return authError;
  const timer = await lockWithMinuteTimer(drizzleDB, ENDPOINT_NAME);
  if (!timer.isNewMinute && timer.response) return timer.response;
  try {
    const wars = await drizzleDB.query.war.findMany({
      where: and(eq(war.status, "ACTIVE"), isNotNull(war.rules)),
    });
    if (wars.length) await syncWarCamps(drizzleDB, wars);
    return new Response("War camps updated", { status: 200 });
  } catch (cause) {
    await updateGameSetting(drizzleDB, ENDPOINT_NAME, 0, timer.prevTime);
    return handleEndpointError(cause);
  }
}
