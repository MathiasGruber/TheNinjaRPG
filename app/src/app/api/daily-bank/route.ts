import { eq, ne, and, or, sql, lt } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userData, dailyReset } from "@/drizzle/schema";
import { lockWithGameTimer, handleEndpointError } from "@/libs/gamesettings";
import { structureBoost } from "@/utils/village";
import { calcBankInterest } from "@/utils/village";
import { RYO_CAP } from "@/drizzle/constants";
import { FED_NORMAL_BANK_INTEREST } from "@/drizzle/constants";
import { FED_SILVER_BANK_INTEREST } from "@/drizzle/constants";
import { FED_GOLD_BANK_INTEREST } from "@/drizzle/constants";
import { cookies } from "next/headers";

export async function GET() {
  // disable cache for this server action (https://github.com/vercel/next.js/discussions/50045)
  cookies();

  // Check timer
  const response = await lockWithGameTimer(drizzleDB, 24, "h", "daily-bank");
  if (response) return response;

  // Query
  const villages = await drizzleDB.query.village.findMany({
    with: { structures: true },
  });

  try {
    await Promise.all(
      villages.map((village) => {
        const boost = structureBoost("bankInterestPerLvl", village.structures);
        const factor = 1 + calcBankInterest(boost) / 100;
        const factorNormal = factor + FED_NORMAL_BANK_INTEREST / 100;
        const factorSilver = factor + FED_SILVER_BANK_INTEREST / 100;
        const factorGold = factor + FED_GOLD_BANK_INTEREST / 100;
        return Promise.all([
          drizzleDB
            .update(userData)
            .set({
              bank: sql`${userData.bank} + LEAST(${userData.bank} * ${factor} - ${userData.bank}, 1000000)`,
            })
            .where(
              and(
                eq(userData.villageId, village.id),
                eq(userData.federalStatus, "NONE"),
                eq(userData.role, "USER"),
                lt(userData.bank, RYO_CAP),
              ),
            ),
          drizzleDB
            .update(userData)
            .set({
              bank: sql`${userData.bank} + LEAST(${userData.bank} * ${factorNormal} - ${userData.bank}, 1000000)`,
            })
            .where(
              and(
                eq(userData.villageId, village.id),
                eq(userData.federalStatus, "NORMAL"),
                eq(userData.role, "USER"),
                lt(userData.bank, RYO_CAP),
              ),
            ),
          drizzleDB
            .update(userData)
            .set({
              bank: sql`${userData.bank} + LEAST(${userData.bank} * ${factorSilver} - ${userData.bank}, 1000000)`,
            })
            .where(
              and(
                eq(userData.villageId, village.id),
                eq(userData.federalStatus, "SILVER"),
                eq(userData.role, "USER"),
                lt(userData.bank, RYO_CAP),
              ),
            ),
          drizzleDB
            .update(userData)
            .set({
              bank: sql`${userData.bank} + LEAST(${userData.bank} * ${factorGold} - ${userData.bank}, 1000000)`,
            })
            .where(
              and(
                eq(userData.villageId, village.id),
                or(eq(userData.federalStatus, "GOLD"), ne(userData.role, "USER")),
                lt(userData.bank, RYO_CAP),
              ),
            ),
        ]);
      }),
    );

    // Log the reset into the DailyReset schema
    await drizzleDB.insert(dailyReset).values({
      id: crypto.randomUUID(), // Generate a unique ID for the reset entry
      resetType: "daily-bank",
      scheduledDate: new Date().toISOString(), // Use current timestamp for scheduled date
      executedDate: new Date().toISOString(), // Log the execution timestamp
      status: "completed", // Mark as completed since the reset was successful
      lastChecked: new Date().toISOString(),
      retryCount: 0,
      isManualOverride: false,
    });

    return Response.json(`OK`);
  } catch (cause) {
    // Log the reset as failed if an error occurs
    await drizzleDB.insert(dailyReset).values({
      id: crypto.randomUUID(),
      resetType: "daily-bank",
      scheduledDate: new Date().toISOString(),
      executedDate: null, // No execution timestamp since it failed
      status: "failed",
      lastChecked: new Date().toISOString(),
      retryCount: 0,
      isManualOverride: false,
      errorLog: String(cause), // Capture the error for debugging
    });
    return handleEndpointError(cause);
  }
}
