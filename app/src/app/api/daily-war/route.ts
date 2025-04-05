import { drizzleDB } from "@/server/db";
import { war, village } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import {
  WAR_TOKEN_REDUCTION_INTERVAL_HOURS,
  WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_3_DAYS,
  WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_7_DAYS,
} from "@/drizzle/constants";
import { handleWarEnd } from "@/libs/war";
import { fetchActiveWars } from "@/server/api/routers/war";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();

    let activeWars = await fetchActiveWars(drizzleDB);
    activeWars = activeWars.filter((war) => war.type === "VILLAGE_WAR");

    if (!activeWars || activeWars.length === 0) {
      return new Response("No active wars found", { status: 200 });
    }

    for (const activeWar of activeWars) {
      if (!activeWar.attackerVillage || !activeWar.defenderVillage) {
        console.error("War found with missing village data:", activeWar.id);
        continue;
      }

      const { startedAt, dailyTokenReduction, lastTokenReductionAt } = activeWar;

      // Calculate time since last reduction
      const hoursSinceLastReduction = lastTokenReductionAt
        ? (now.getTime() - lastTokenReductionAt.getTime()) / (1000 * 60 * 60)
        : WAR_TOKEN_REDUCTION_INTERVAL_HOURS;

      // Only process if enough time has passed
      if (hoursSinceLastReduction < WAR_TOKEN_REDUCTION_INTERVAL_HOURS) {
        continue;
      }

      // Calculate number of reductions to apply
      const reductionsToApply = Math.floor(
        hoursSinceLastReduction / WAR_TOKEN_REDUCTION_INTERVAL_HOURS,
      );

      // Calculate war duration in days
      const warDuration = Math.floor(
        (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Calculate token reduction based on war duration
      let tokenReduction = dailyTokenReduction;
      if (warDuration >= 7) {
        tokenReduction = Math.floor(
          dailyTokenReduction * WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_7_DAYS,
        );
      } else if (warDuration >= 3) {
        tokenReduction = Math.floor(
          dailyTokenReduction * WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_3_DAYS,
        );
      }

      // Apply multiple reductions if needed
      const totalReduction = tokenReduction * reductionsToApply;

      // Reduce village tokens in-place
      activeWar.attackerVillage.tokens -= totalReduction;
      activeWar.defenderVillage.tokens -= totalReduction;
      activeWar.attackerVillage.tokens = Math.max(0, activeWar.attackerVillage.tokens);
      activeWar.defenderVillage.tokens = Math.max(0, activeWar.defenderVillage.tokens);

      // Handle war end
      if (
        activeWar.attackerVillage.tokens <= 0 ||
        activeWar.defenderVillage.tokens <= 0
      ) {
        await handleWarEnd(activeWar);
        continue;
      }

      // Update token counts and last reduction time
      await Promise.all([
        drizzleDB
          .update(village)
          .set({ tokens: activeWar.attackerVillage.tokens })
          .where(eq(village.id, activeWar.attackerVillage.id)),
        drizzleDB
          .update(village)
          .set({ tokens: activeWar.defenderVillage.tokens })
          .where(eq(village.id, activeWar.defenderVillage.id)),
        drizzleDB
          .update(war)
          .set({
            dailyTokenReduction: tokenReduction,
            lastTokenReductionAt: now,
          })
          .where(eq(war.id, activeWar.id)),
      ]);
    }
    return new Response("War daily update completed", { status: 200 });
  } catch (error) {
    console.error("War daily update failed:", error);
    return new Response("War daily update failed", { status: 500 });
  }
}
