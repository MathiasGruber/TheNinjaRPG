import { eq } from "drizzle-orm";
import { village } from "@/drizzle/schema";
import {
  handleEndpointError,
  lockWithMinuteTimer,
  updateGameSetting,
} from "@/libs/gamesettings";
import { drizzleDB } from "@/server/db";
import { authenticateCronRequest } from "@/server/utils/cron";
import { syncKageDefense } from "@/server/utils/kage";

const TIMER = "kage-defense-maintenance";
export const maxDuration = 300;

/** Reconcile assignments and attendance even when participants close the game. */
export async function GET(request: Request) {
  const authError = authenticateCronRequest(request);
  if (authError) return authError;
  const timer = await lockWithMinuteTimer(drizzleDB, TIMER);
  if (!timer.isNewMinute) return timer.response;
  try {
    const villages = await drizzleDB.query.village.findMany({
      columns: { id: true },
      where: eq(village.type, "VILLAGE"),
    });
    await Promise.all(villages.map((v) => syncKageDefense(drizzleDB, v.id)));
    return Response.json({ success: true });
  } catch (error) {
    await updateGameSetting(drizzleDB, TIMER, 0, timer.prevTime);
    return handleEndpointError(error);
  }
}
