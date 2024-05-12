import { TRPCError } from "@trpc/server";
import { eq, inArray, isNull, isNotNull, and, or, sql, lt } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { quest, questHistory, userData, userRequest } from "@/drizzle/schema";
import { anbuSquad } from "@/drizzle/schema";
import { UserRanks } from "@/drizzle/constants";
import { availableLetterRanks } from "@/libs/train";
import { secondsFromNow } from "@/utils/time";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { getTimer, updateTimer } from "@/libs/game_timers";
import { upsertQuestEntries } from "@/routers/quests";
import { structureBoost } from "@/utils/village";
import { FED_NORMAL_BANK_INTEREST } from "@/drizzle/constants";
import { FED_SILVER_BANK_INTEREST } from "@/drizzle/constants";
import { FED_GOLD_BANK_INTEREST } from "@/drizzle/constants";
import type { NextApiRequest, NextApiResponse } from "next";

const dailyUpdates = async (req: NextApiRequest, res: NextApiResponse) => {
  // Check timer
  const timer = await getTimer("daily");
  if (timer.time > new Date(Date.now() - 1000 * 60 * 60 * 23.9)) {
    return res.status(200).json("Ran within the last 23.9 hours");
  }

  const villages = await drizzleDB.query.village.findMany({
    with: { structures: true },
  });

  try {
    // STEP 1: Bank interest for each village
    await Promise.all(
      villages.map((village) => {
        const interest = structureBoost("bankInterestPerLvl", village.structures);
        const factor = 1 + interest / 100;
        return Promise.all([
          drizzleDB
            .update(userData)
            .set({ bank: sql`${userData.bank} * ${factor}` })
            .where(
              and(
                eq(userData.villageId, village.id),
                eq(userData.federalStatus, "NONE"),
              ),
            ),
          drizzleDB
            .update(userData)
            .set({
              bank: sql`${userData.bank} * ${factor + FED_NORMAL_BANK_INTEREST / 100}`,
            })
            .where(
              and(
                eq(userData.villageId, village.id),
                eq(userData.federalStatus, "NORMAL"),
              ),
            ),
          drizzleDB
            .update(userData)
            .set({
              bank: sql`${userData.bank} * ${factor + FED_SILVER_BANK_INTEREST / 100}`,
            })
            .where(
              and(
                eq(userData.villageId, village.id),
                eq(userData.federalStatus, "SILVER"),
              ),
            ),
          drizzleDB
            .update(userData)
            .set({
              bank: sql`${userData.bank} * ${factor + FED_GOLD_BANK_INTEREST / 100}`,
            })
            .where(
              and(
                eq(userData.villageId, village.id),
                eq(userData.federalStatus, "GOLD"),
              ),
            ),
        ]);
      }),
    );

    // STEP 2: Clear old challenges
    await drizzleDB
      .delete(userRequest)
      .where(lt(userRequest.createdAt, secondsFromNow(-3600 * 24)));

    // STEP 3: Update village prestige & daily limits
    await drizzleDB.update(userData).set({
      villagePrestige: sql`${userData.villagePrestige} + 1`,
      dailyArenaFights: 0,
      dailyMissions: 0,
    });

    // STEP 4: Update daily quests
    await drizzleDB
      .update(questHistory)
      .set({ completed: 0, endAt: new Date() })
      .where(and(eq(questHistory.questType, "daily"), eq(questHistory.completed, 0)));
    await Promise.all(
      UserRanks.map((rank) => {
        const ranks = availableLetterRanks(rank);
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

    // STEP 5: decaying PvP activity counters
    await Promise.all([
      drizzleDB.update(userData).set({
        pvpActivity: sql`${userData.pvpActivity} * 0.95`,
      }),
      drizzleDB.update(anbuSquad).set({
        pvpActivity: sql`${anbuSquad.pvpActivity} * 0.95`,
      }),
    ]);

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
