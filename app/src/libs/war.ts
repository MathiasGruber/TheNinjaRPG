import { drizzleDB } from "@/server/db";
import { war, village, villageStructure, userRequest } from "@/drizzle/schema";
import { eq, and, or } from "drizzle-orm";
import { sql, inArray } from "drizzle-orm";
import {
  WAR_EXHAUSTION_DURATION_DAYS,
  WAR_STRUCTURE_UPGRADE_BLOCK_DAYS,
  WAR_VICTORY_TOKEN_BONUS,
} from "@/drizzle/constants";
import { findRelationship } from "@/utils/alliance";
import type { War, WarAlly, Village, VillageAlliance } from "@/drizzle/schema";

/**
 * Checks if a village can join a war
 * @param war - The war to check
 * @param relationships - The relationships between villages
 * @param joiningVillage - The village to join the war
 * @param warringVillage - The village to war against
 * @returns Whether the village can join the war and a message
 */
export const canJoinWar = (
  war: War & { warAllies: WarAlly[] },
  relationships: VillageAlliance[],
  joiningVillage: Village,
  warringVillage: Village,
) => {
  // Derived
  const joiningVillageId = joiningVillage.id;
  const warringVillageId = warringVillage.id;
  const relationship = findRelationship(
    relationships,
    joiningVillageId,
    warringVillageId,
  );
  const status = relationship?.status || "NEUTRAL";
  // Checks
  const check1 = joiningVillageId !== war.attackerVillageId;
  const check2 = warringVillageId !== war.defenderVillageId;
  const check3 = !war.warAllies.some((f) => f.villageId === joiningVillageId);
  const check4 = ["VILLAGE", "HIDEOUT", "TOWN"].includes(joiningVillage.type);
  const check5 = ["NEUTRAL", "ALLY"].includes(status);
  const check = check1 && check2 && check3 && check4 && check5;
  // Derived message for each check failing
  let message = "";
  if (!check1) message = "Cannot join war, already an attacker";
  if (!check2) message = "Cannot join war, already a defender";
  if (!check3) message = "Cannot join war, faction already in war";
  if (!check4) message = "Cannot join war, not a village/hideout/town";
  if (!check5) message = "Cannot join war with your enemy";
  // Return
  return { check, message };
};

/**
 * Handles the end of a war
 * @param war - The war to handle
 * @returns
 */
export const handleWarEnd = async (
  activeWar: War & {
    warAllies: WarAlly[];
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
  let winningAllies: string[] = [];
  if (!isDraw && winnerVillageId && activeWar.warAllies.length > 0) {
    winningAllies = activeWar.warAllies
      .filter((f) => f.villageId === winnerVillageId)
      .map((f) => f.villageId);
    winningPoints = WAR_VICTORY_TOKEN_BONUS / winningAllies.length;
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
            .where(inArray(village.id, [...winningAllies, winnerVillageId])),
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
