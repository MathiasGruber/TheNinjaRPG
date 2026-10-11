import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { WAR_LOSING_COOLDOWN_DAYS } from "@/drizzle/constants";
import { warAlly } from "@/drizzle/schema";
import { errorResponse } from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { DAY_S, secondsFromDate } from "@/utils/time";

export const activeWarAllyWhere = () =>
  and(isNotNull(warAlly.acceptedAt), isNull(warAlly.endedAt));

/** A pending membership is a durable receipt; admission and its payment commit in one UPDATE. */
export const acceptWarAllyOffer = async (
  client: DrizzleClient,
  offer: {
    offerId: string;
    warId: string;
    villageId: string;
    supportVillageId: string;
    userId: string;
  },
) => {
  await retryOnDeadlock(() =>
    client.execute(sql`
    INSERT IGNORE INTO WarAlly (id, warId, villageId, supportVillageId, tokensPaid, acceptedAt)
    SELECT r.id, w.id, joining.id, supporting.id, 0, NULL
    FROM UserRequest r
    INNER JOIN War w ON w.id = r.relatedId
    INNER JOIN Village joining ON joining.id = ${offer.villageId} AND joining.kageId = r.receiverId
    INNER JOIN Village supporting ON supporting.id = ${offer.supportVillageId} AND supporting.kageId = r.senderId
    WHERE r.id = ${offer.offerId} AND r.type = 'WAR_ALLY' AND r.status = 'PENDING'
      AND r.receiverId = ${offer.userId} AND r.value >= 0
      AND w.id = ${offer.warId} AND w.status = 'ACTIVE' AND w.endedAt IS NULL
      AND supporting.id IN (w.attackerVillageId, w.defenderVillageId)
  `),
  );

  // Drizzle cannot express a multi-table write. The receipt, both balances, and
  // accepted membership change together, so a failed delivery remains retryable.
  const delivered = await retryOnDeadlock(() =>
    client.execute(sql`
    UPDATE UserRequest r
    INNER JOIN WarAlly wa ON wa.id = r.id AND wa.warId = r.relatedId
    INNER JOIN War w ON w.id = wa.warId
    INNER JOIN Village joining ON joining.id = wa.villageId AND joining.kageId = r.receiverId
    INNER JOIN Village supporting ON supporting.id = wa.supportVillageId AND supporting.kageId = r.senderId
    SET r.status = 'ACCEPTED', wa.acceptedAt = CURRENT_TIMESTAMP(3), wa.tokensPaid = r.value,
        joining.tokens = joining.tokens + r.value, supporting.tokens = supporting.tokens - r.value
    WHERE r.id = ${offer.offerId} AND r.type = 'WAR_ALLY' AND r.status = 'PENDING'
      AND r.receiverId = ${offer.userId} AND r.value >= 0 AND supporting.tokens >= r.value
      AND wa.villageId = ${offer.villageId} AND wa.supportVillageId = ${offer.supportVillageId}
      AND wa.acceptedAt IS NULL AND wa.endedAt IS NULL
      AND w.status = 'ACTIVE' AND w.endedAt IS NULL
  `),
  );
  if (delivered.rowsAffected > 0)
    return { success: true, message: "Offer accepted and alliance formed" };

  const saved = await client.query.warAlly.findFirst({
    where: and(
      eq(warAlly.id, offer.offerId),
      eq(warAlly.warId, offer.warId),
      eq(warAlly.villageId, offer.villageId),
      eq(warAlly.supportVillageId, offer.supportVillageId),
    ),
  });
  if (saved?.acceptedAt && !saved.endedAt)
    return { success: true, message: "Offer already accepted" };
  await retryOnDeadlock(() =>
    client
      .delete(warAlly)
      .where(and(eq(warAlly.id, offer.offerId), isNull(warAlly.acceptedAt))),
  );
  return errorResponse(
    "Offer changed, the war ended, or the sending village no longer has enough tokens. Refresh and try again.",
  );
};

/** Freeze withdrawal against the same War row that settlement claims. */
export const withdrawWarAlly = async (
  client: DrizzleClient,
  warId: string,
  villageId: string,
  userId: string,
) => {
  const endedAt = new Date();
  const cooldown = secondsFromDate(WAR_LOSING_COOLDOWN_DAYS * DAY_S, endedAt);
  const withdrawn = await retryOnDeadlock(() =>
    client.execute(sql`
    UPDATE WarAlly wa
    INNER JOIN War w ON w.id = wa.warId
    INNER JOIN Village v ON v.id = wa.villageId
    SET wa.endedAt = ${endedAt}, v.warExhaustionEndedAt = ${cooldown}, v.lastWarEndedAt = ${endedAt}
    WHERE wa.warId = ${warId} AND wa.villageId = ${villageId}
      AND wa.acceptedAt IS NOT NULL AND wa.endedAt IS NULL
      AND w.status = 'ACTIVE' AND w.endedAt IS NULL AND v.kageId = ${userId}
  `),
  );
  if (withdrawn.rowsAffected === 0)
    return errorResponse("War or membership changed. Refresh before surrendering.");
  return { success: true, message: "War surrendered and therefore lost" };
};
