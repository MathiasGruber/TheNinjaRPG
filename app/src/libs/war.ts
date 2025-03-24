import { drizzleDB } from "@/server/db";
import { war, village, villageStructure, userRequest } from "@/drizzle/schema";
import { eq, and, or } from "drizzle-orm";
import { sql, inArray } from "drizzle-orm";
import {
  WAR_EXHAUSTION_DURATION_DAYS,
  WAR_STRUCTURE_UPGRADE_BLOCK_DAYS,
  WAR_VICTORY_TOKEN_BONUS,
} from "@/drizzle/constants";
import type { War, WarAlly, Village } from "@/drizzle/schema";

/**
 * Handles the end of a war
 * @param war - The war to handle
 * @returns
 */
export const handleWarEnd = async (
  activeWar: War & {
    factions: WarAlly[];
    attackerVillage: Village;
    defenderVillage: Village;
  },
) => {
  // Timer calculations
  const endedAt = new Date();
  const warExhaustionEnd = new Date(
    endedAt.getTime() + WAR_EXHAUSTION_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );
  const structureUpgradeBlock = new Date(
    endedAt.getTime() + WAR_STRUCTURE_UPGRADE_BLOCK_DAYS * 24 * 60 * 60 * 1000,
  );

  // Get IDs of villages & factions that lost (less than 0 tokens) and won (more than 0 tokens)
  // Note both villages could be losing if they both got their points deducted simultaneously
  const isDraw =
    activeWar.attackerVillage.tokens <= 0 && activeWar.defenderVillage.tokens <= 0;
  const winnerVillageId =
    activeWar.attackerVillage.tokens > 0
      ? activeWar.attackerVillage.id
      : activeWar.defenderVillage.id;
  const loserVillageId =
    winnerVillageId === activeWar.attackerVillage.id
      ? activeWar.defenderVillage.id
      : activeWar.attackerVillage.id;
  const status = isDraw
    ? "DRAW"
    : winnerVillageId === activeWar.attackerVillage.id
      ? "ATTACKER_VICTORY"
      : "DEFENDER_VICTORY";

  // Calculate winning tokens
  let winningPoints = isDraw ? 0 : WAR_VICTORY_TOKEN_BONUS;
  let winningFactions: string[] = [];
  if (!isDraw && winnerVillageId && activeWar.factions.length > 0) {
    winningFactions = activeWar.factions
      .filter((f) => f.villageId === winnerVillageId)
      .map((f) => f.villageId);
    winningPoints = WAR_VICTORY_TOKEN_BONUS / winningFactions.length;
  }

  // Run updates
  await Promise.all([
    drizzleDB.update(war).set({ status, endedAt }).where(eq(war.id, activeWar.id)),
    drizzleDB
      .delete(userRequest)
      .where(
        and(
          eq(userRequest.type, "WAR_ALLY"),
          or(
            inArray(userRequest.senderId, [
              activeWar.attackerVillage.kageId,
              activeWar.defenderVillage.kageId,
            ]),
            inArray(userRequest.receiverId, [
              activeWar.attackerVillage.kageId,
              activeWar.defenderVillage.kageId,
            ]),
          ),
        ),
      ),
    ...(isDraw
      ? [
          drizzleDB
            .update(village)
            .set({
              warExhaustionEndedAt: warExhaustionEnd,
              lastWarEndedAt: endedAt,
            })
            .where(inArray(village.id, [loserVillageId, winnerVillageId])),
          drizzleDB
            .update(villageStructure)
            .set({
              level: sql`GREATEST(level - 1, 1)`,
              lastUpgradedAt: structureUpgradeBlock,
            })
            .where(
              inArray(villageStructure.villageId, [loserVillageId, winnerVillageId]),
            ),
        ]
      : [
          drizzleDB
            .update(village)
            .set({
              tokens: sql`tokens + ${winningPoints}`,
            })
            .where(inArray(village.id, [...winningFactions, winnerVillageId])),
          drizzleDB
            .update(village)
            .set({
              warExhaustionEndedAt: warExhaustionEnd,
              lastWarEndedAt: endedAt,
            })
            .where(eq(village.id, loserVillageId)),
          drizzleDB
            .update(villageStructure)
            .set({
              level: sql`GREATEST(level - 1, 1)`,
              lastUpgradedAt: structureUpgradeBlock,
            })
            .where(eq(villageStructure.villageId, loserVillageId)),
        ]),
  ]);
};
