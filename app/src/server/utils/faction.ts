import { and, eq, sql } from "drizzle-orm";
import {
  FACTION_MIN_MEMBERS_FOR_STRONGHOLD,
  STRONGHOLD_MEMBER_GRACE_HOURS,
} from "@/drizzle/constants";
import { clan, userData, village } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";

/** Stamp departures immediately, reset on recovery, and downgrade after an uninterrupted grace period. */
export const syncStrongholdMembership = async (
  client: DrizzleClient,
  villageId?: string,
) => {
  const count = sql`(SELECT COUNT(*) FROM ${userData} INNER JOIN ${clan} ON ${clan.id} = ${userData.clanId} WHERE ${clan.villageId} = ${village.id} AND ${userData.isAi} = 0)`;
  const expired = sql`${count} < ${FACTION_MIN_MEMBERS_FOR_STRONGHOLD} AND ${village.belowMemberMinimumSince} <= NOW(3) - INTERVAL ${STRONGHOLD_MEMBER_GRACE_HOURS} HOUR`;
  await retryOnDeadlock(() =>
    client
      .update(village)
      .set({
        wasDowngraded: sql`CASE WHEN ${expired} THEN 1 ELSE ${village.wasDowngraded} END`,
        type: sql`CASE WHEN ${expired} THEN 'HIDEOUT' ELSE ${village.type} END`,
        belowMemberMinimumSince: sql`CASE WHEN ${count} >= ${FACTION_MIN_MEMBERS_FOR_STRONGHOLD} THEN NULL ELSE COALESCE(${village.belowMemberMinimumSince}, NOW(3)) END`,
      })
      .where(
        and(
          eq(village.type, "STRONGHOLD"),
          villageId ? eq(village.id, villageId) : undefined,
        ),
      ),
  );
};
