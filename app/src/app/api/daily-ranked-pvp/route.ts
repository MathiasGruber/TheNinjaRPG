import { gt, and, sql, eq } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { rankedSeason, rankedUserRewards, userData } from "@/drizzle/schema";
import { updateGameSetting } from "@/libs/gamesettings";
import { lockWithDailyTimer, handleEndpointError } from "@/libs/gamesettings";
import { cookies } from "next/headers";
import { getRankedRank } from "@/libs/ranked_pvp";
import { RANKED_SANNIN_TOP_PLAYERS } from "@/drizzle/constants";
import { nanoid } from "nanoid";

const ENDPOINT_NAME = "daily-pvp";

export async function GET() {
  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  await cookies();

  // Check timer
  const timerCheck = await lockWithDailyTimer(drizzleDB, ENDPOINT_NAME);
  if (!timerCheck.isNewDay && timerCheck.response) return timerCheck.response;

  // Fetch users with rankedLp > 0
  const [users, activeSeason] = await Promise.all([
    drizzleDB.query.userData.findMany({
      columns: {
        userId: true,
        rankedLp: true,
      },
      orderBy: (userData, { desc }) => [desc(userData.rankedLp)],
      where: and(gt(userData.rankedLp, 0)),
    }),
    drizzleDB.query.rankedSeason.findMany({
      where: and(eq(rankedSeason.ended, false)),
    }),
  ]);

  // Check if active season exists & is expired
  const endedSeason = activeSeason.find((season) => season.endDate < new Date());
  const topPlayers = users.slice(0, RANKED_SANNIN_TOP_PLAYERS);

  // Perform work
  try {
    if (endedSeason) {
      await Promise.all([
        // Update users rankedLp to 0
        drizzleDB.update(userData).set({ rankedLp: 0 }),
        // Update rankedSeason to ended
        drizzleDB
          .update(rankedSeason)
          .set({ ended: true })
          .where(eq(rankedSeason.id, endedSeason.id)),
        // Insert rankedUserRewards for top players
        users.length > 0
          ? drizzleDB.insert(rankedUserRewards).values(
              users.map((user) => ({
                id: nanoid(),
                userId: user.userId,
                seasonId: endedSeason.id,
                division: getRankedRank(
                  user.rankedLp,
                  topPlayers.map((x) => x.rankedLp),
                ),
              })),
            )
          : null,
      ]);
    } else {
      await drizzleDB.update(userData).set({
        rankedLp: sql`${userData.rankedLp} * 0.95`,
      });
    }

    return Response.json(`OK`);
  } catch (cause) {
    // Rollback
    await updateGameSetting(drizzleDB, ENDPOINT_NAME, 0, timerCheck.prevTime);
    return handleEndpointError(cause);
  }
}
