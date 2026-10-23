import { getTableName, sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";

export type ActivityCompletions = {
  dungeonsCompleted?: number;
  raidsCompleted?: number;
};

/** Indexed completion receipts folded into profile/initiation reads; combat actions never fetch them. */
export const activityCompletionExtras = (column: AnyMySqlColumn) => {
  // Relational extras strip column qualifiers. Identifiers preserve the outer alias so
  // the inner membership userId cannot shadow it and count every player's completions.
  const userId = sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
  return {
    dungeonsCompleted:
      sql<number>`(SELECT COUNT(*) FROM DungeonMember achievement_member
    INNER JOIN DungeonRun achievement_run ON achievement_run.id = achievement_member.runId
    WHERE achievement_member.userId = ${userId} AND achievement_run.status = 'COMPLETED')`
        .mapWith(Number)
        .as("dungeonsCompleted"),
    // Everyone who contributed damage gets credit when the shared boss dies, including
    // participants who are offline and those who already claimed a threshold reward.
    raidsCompleted:
      sql<number>`(SELECT COUNT(*) FROM RaidParticipation achievement_participant
    INNER JOIN Quest achievement_raid ON achievement_raid.id = achievement_participant.questId
    WHERE achievement_participant.userId = ${userId} AND achievement_participant.damageDealt > 0
    AND achievement_raid.questType = 'raid' AND achievement_raid.raidBossCurrentHealth <= 0)`
        .mapWith(Number)
        .as("raidsCompleted"),
  };
};
