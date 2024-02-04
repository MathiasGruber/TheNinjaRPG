import { TRPCError } from "@trpc/server";
import { eq, inArray, isNull, isNotNull, and, or, sql, lt } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { quest, questHistory, userData, userChallenge } from "@/drizzle/schema";
import { CHALLENGE_EXPIRY_SECONDS } from "@/libs/combat/constants";
import { UserRanks } from "@/drizzle/constants";
import { availableRanks } from "@/libs/train";
import { secondsFromNow } from "@/utils/time";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { getTimer, updateTimer } from "@/libs/game_timers";
import { upsertQuestEntries } from "@/routers/quests";
import type { NextApiRequest, NextApiResponse } from "next";

const dailyUpdates = async (req: NextApiRequest, res: NextApiResponse) => {
  // Check timer
  const timer = await getTimer("daily");
  if (timer.time > new Date(Date.now() - 1000 * 60 * 60 * 23.5)) {
    return res.status(200).json("Ran within the last 23.5 hours");
  }

  const villages = await drizzleDB.query.village.findMany({});

  try {
    // STEP 1: Bank interest
    await drizzleDB.update(userData).set({ bank: sql`${userData.bank} * 1.01` });

    // STEP 2: Update daily quests
    await drizzleDB
      .delete(userChallenge)
      .where(
        lt(userChallenge.createdAt, secondsFromNow(-CHALLENGE_EXPIRY_SECONDS * 2)),
      );

    // STEP 3: Update daily quests
    await drizzleDB
      .update(questHistory)
      .set({ completed: 0, endAt: new Date() })
      .where(and(eq(questHistory.questType, "daily"), eq(questHistory.completed, 0)));
    await Promise.all(
      UserRanks.map((rank) => {
        const ranks = availableRanks(rank);
        if (ranks.length > 0) {
          void villages.map(async (village) => {
            const newDaily = await drizzleDB.query.quest.findFirst({
              where: and(
                eq(quest.questType, "daily"),
                isNotNull(quest.content),
                inArray(quest.requiredRank, ranks),
                or(
                  isNull(quest.requiredVillage),
                  eq(quest.requiredVillage, village.id ?? ""),
                ),
              ),
              orderBy: sql`RAND()`,
            });
            if (newDaily) {
              await upsertQuestEntries(
                drizzleDB,
                newDaily,
                and(eq(userData.rank, rank), eq(userData.villageId, village.id)),
              );
            }
          });
        }
      }),
    );

    // Update timer
    await updateTimer("daily", new Date());

    res.status(200).json("OK");
  } catch (cause) {
    if (cause instanceof TRPCError) {
      // An error from tRPC occured
      const httpCode = getHTTPStatusCodeFromError(cause);
      return res.status(httpCode).json(cause);
    }
    // Another error occured
    console.error(cause);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default dailyUpdates;
