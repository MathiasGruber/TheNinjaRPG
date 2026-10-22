import { handleEndpointError, lockWithMinuteTimer } from "@/libs/gamesettings";
import { maintainEventTournaments } from "@/routers/tournamentEvents";
import { drizzleDB } from "@/server/db";
import { authenticateCronRequest } from "@/server/utils/cron";

const TIMER = "tournament-maintenance";
export const maxDuration = 300;

/** Authenticate and claim the shared minute lock before reconciling event progress and payouts. */
export async function GET(request: Request) {
  const authError = authenticateCronRequest(request);
  if (authError) return authError;
  const timer = await lockWithMinuteTimer(drizzleDB, TIMER);
  if (!timer.isNewMinute) return timer.response;
  try {
    await maintainEventTournaments(drizzleDB);
    return Response.json({ success: true });
  } catch (error) {
    await timer.release();
    return handleEndpointError(error);
  }
}
