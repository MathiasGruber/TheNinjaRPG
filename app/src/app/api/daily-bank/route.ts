import { eq, ne, and, or, sql, lt } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userData } from "@/drizzle/schema";
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
    return Response.json(`OK`);
  } catch (cause) {
    return handleEndpointError(cause);
  }
}
