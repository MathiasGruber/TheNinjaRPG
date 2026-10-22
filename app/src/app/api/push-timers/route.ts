import { handleEndpointError, lockWithMinuteTimer } from "@/libs/gamesettings";
import { drizzleDB } from "@/server/db";
import { authenticateCronRequest } from "@/server/utils/cron";
import { deliverDueTimedPushes } from "@/server/utils/push/timed";

const TIMER = "push-timers";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authError = authenticateCronRequest(request);
  if (authError) return authError;
  const timer = await lockWithMinuteTimer(drizzleDB, TIMER);
  if (!timer.isNewMinute) return timer.response;
  try {
    return Response.json(await deliverDueTimedPushes(drizzleDB));
  } catch (error) {
    await timer.release();
    return handleEndpointError(error);
  }
}
