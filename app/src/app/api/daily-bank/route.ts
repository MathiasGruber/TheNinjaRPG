import { eq, ne, and, or, sql, lt } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userData } from "@/drizzle/schema";
import { lockWithDailyTimer, updateGameSetting } from "@/libs/gamesettings";
import { structureBoost } from "@/utils/village";
import { calcBankInterest } from "@/utils/village";
import { RYO_CAP } from "@/drizzle/constants";
import { FED_NORMAL_BANK_INTEREST } from "@/drizzle/constants";
import { FED_SILVER_BANK_INTEREST } from "@/drizzle/constants";
import { FED_GOLD_BANK_INTEREST } from "@/drizzle/constants";
import { cookies } from "next/headers";

const ENDPOINT_NAME = "daily-bank";

export async function GET() {
  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  await cookies();

  // Query
  const villages = await drizzleDB.query.village.findMany({
    with: { structures: true },
  });

  // Create responses
  const promises = villages.flatMap((village) => {
    // Calculations
    const boost = structureBoost("bankInterestPerLvl", village.structures);
    const factor = 1 + calcBankInterest(boost) / 100;
    const factorNormal = factor + FED_NORMAL_BANK_INTEREST / 100;
    const factorSilver = factor + FED_SILVER_BANK_INTEREST / 100;
    const factorGold = factor + FED_GOLD_BANK_INTEREST / 100;
    // Config
    const config = [
      {
        factor: factor,
        where: and(eq(userData.federalStatus, "NONE"), eq(userData.role, "USER")),
      },
      {
        factor: factorNormal,
        where: and(eq(userData.federalStatus, "NORMAL"), eq(userData.role, "USER")),
      },
      {
        factor: factorSilver,
        where: and(eq(userData.federalStatus, "SILVER"), eq(userData.role, "USER")),
      },
      {
        factor: factorGold,
        where: or(eq(userData.federalStatus, "GOLD"), ne(userData.role, "USER")),
      },
    ];
    return config.map((c) => {
      return (async () => {
        // Do a check for each bank endpoint
        const bankEndpoint = `${ENDPOINT_NAME}-${village.name}-${c.factor}`;
        const timerCheck = await lockWithDailyTimer(drizzleDB, bankEndpoint);
        if (!timerCheck.isNewDay && timerCheck.response) {
          return `Please wait to next day - ${bankEndpoint}`;
        }
        // Try to execute
        try {
          await drizzleDB
            .update(userData)
            .set({
              bank: sql`${userData.bank} + LEAST(${userData.bank} * ${c.factor} - ${userData.bank}, 1000000)`,
            })
            .where(
              and(
                eq(userData.villageId, village.id),
                lt(userData.bank, RYO_CAP),
                c.where,
              ),
            );
          return `OK - ${bankEndpoint}`;
        } catch (cause) {
          // Rollback
          await updateGameSetting(drizzleDB, bankEndpoint, 0, timerCheck.prevTime);
          console.error(cause);
          return `ERROR - ${bankEndpoint}`;
        }
      })();
    });
  });

  // Execute in parallel
  const responses = await Promise.all(promises);

  // Return responses
  return new Response(responses.join("\n"));
}
