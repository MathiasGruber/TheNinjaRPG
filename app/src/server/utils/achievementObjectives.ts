import { getTableName, gt, gte, or, sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { questHistory } from "@/drizzle/schema";

/** Receipt-derived totals; sparse readers omit counts rather than treating them as zero. */
export type ActivityCompletions = {
  dungeonsCompleted?: number;
  raidsCompleted?: number;
};

/** Include lifetime history even when a repeatable quest's current completion was reset. */
export const completedQuestHistoryRelation = {
  columns: {
    id: true,
    questId: true,
    completed: true,
    questType: true,
    previousCompletes: true,
  },
  where: or(gte(questHistory.completed, 1), gt(questHistory.previousCompletes, 0)),
} as const;

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
