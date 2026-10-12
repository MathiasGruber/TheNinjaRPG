import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { WAR_LOSING_COOLDOWN_DAYS } from "@/drizzle/constants";
import { userRequest, village, war, warAlly } from "@/drizzle/schema";
import { errorResponse } from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { DAY_S, secondsFromDate } from "@/utils/time";

export const activeWarAllyWhere = () =>
  and(isNotNull(warAlly.acceptedAt), isNull(warAlly.endedAt));

/** Closing the request must release its unpaid slot in the same status claim. */
export const closeWarAllyOffer = async (
  client: DrizzleClient,
  offerId: string,
  userId: string,
  status: "CANCELLED" | "REJECTED",
) => {
  const request = alias(userRequest, "r");
  const membership = alias(warAlly, "wa");
  // Drizzle cannot express a multi-table write. Ending only an unpaid reservation
  // preserves accepted history and frees the unique slot even if the response fails.
  const closed = await retryOnDeadlock(() =>
    client.execute(sql`
    UPDATE ${userRequest} r
    LEFT JOIN ${warAlly} wa ON ${membership.id} = ${request.id} AND ${membership.acceptedAt} IS NULL AND ${membership.endedAt} IS NULL
    SET ${request.status} = ${status}, ${membership.endedAt} = CURRENT_TIMESTAMP(3)
    WHERE ${request.id} = ${offerId} AND ${request.type} = 'WAR_ALLY' AND ${request.status} = 'PENDING'
      AND ${status === "CANCELLED" ? request.senderId : request.receiverId} = ${userId}
  `),
  );
  return closed.rowsAffected > 0;
};

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
  const request = alias(userRequest, "r");
  const membership = alias(warAlly, "wa");
  const activeWar = alias(war, "w");
  const joining = alias(village, "joining");
  const supporting = alias(village, "supporting");
  await retryOnDeadlock(() =>
    client.execute(sql`
    INSERT IGNORE INTO ${warAlly} (id, warId, villageId, supportVillageId, tokensPaid, acceptedAt)
    SELECT ${request.id}, ${activeWar.id}, ${joining.id}, ${supporting.id}, 0, NULL
    FROM ${userRequest} r
    INNER JOIN ${war} w ON ${activeWar.id} = ${request.relatedId}
    INNER JOIN ${village} joining ON ${joining.id} = ${offer.villageId} AND ${joining.kageId} = ${request.receiverId}
    INNER JOIN ${village} supporting ON ${supporting.id} = ${offer.supportVillageId} AND ${supporting.kageId} = ${request.senderId}
    WHERE ${request.id} = ${offer.offerId} AND ${request.type} = 'WAR_ALLY' AND ${request.status} = 'PENDING'
      AND ${request.receiverId} = ${offer.userId} AND ${request.value} >= 0
      AND ${activeWar.id} = ${offer.warId} AND ${activeWar.status} = 'ACTIVE' AND ${activeWar.endedAt} IS NULL
      AND ${supporting.id} IN (${activeWar.attackerVillageId}, ${activeWar.defenderVillageId})
  `),
  );

  // Drizzle cannot express a multi-table write. The receipt, both balances, and
  // accepted membership change together, so a failed delivery remains retryable.
  const delivered = await retryOnDeadlock(() =>
    client.execute(sql`
    UPDATE ${userRequest} r
    INNER JOIN ${warAlly} wa ON ${membership.id} = ${request.id} AND ${membership.warId} = ${request.relatedId}
    INNER JOIN ${war} w ON ${activeWar.id} = ${membership.warId}
    INNER JOIN ${village} joining ON ${joining.id} = ${membership.villageId} AND ${joining.kageId} = ${request.receiverId}
    INNER JOIN ${village} supporting ON ${supporting.id} = ${membership.supportVillageId} AND ${supporting.kageId} = ${request.senderId}
    SET ${request.status} = 'ACCEPTED', ${membership.acceptedAt} = CURRENT_TIMESTAMP(3), ${membership.tokensPaid} = ${request.value},
        ${joining.tokens} = ${joining.tokens} + ${request.value}, ${supporting.tokens} = ${supporting.tokens} - ${request.value}
    WHERE ${request.id} = ${offer.offerId} AND ${request.type} = 'WAR_ALLY' AND ${request.status} = 'PENDING'
      AND ${request.receiverId} = ${offer.userId} AND ${request.value} >= 0 AND ${supporting.tokens} >= ${request.value}
      AND ${membership.villageId} = ${offer.villageId} AND ${membership.supportVillageId} = ${offer.supportVillageId}
      AND ${membership.acceptedAt} IS NULL AND ${membership.endedAt} IS NULL
      AND ${activeWar.status} = 'ACTIVE' AND ${activeWar.endedAt} IS NULL
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
  const membership = alias(warAlly, "wa");
  const activeWar = alias(war, "w");
  const withdrawing = alias(village, "v");
  const endedAt = new Date();
  const cooldown = secondsFromDate(WAR_LOSING_COOLDOWN_DAYS * DAY_S, endedAt);
  const withdrawn = await retryOnDeadlock(() =>
    client.execute(sql`
    UPDATE ${warAlly} wa
    INNER JOIN ${war} w ON ${activeWar.id} = ${membership.warId}
    INNER JOIN ${village} v ON ${withdrawing.id} = ${membership.villageId}
    SET ${membership.endedAt} = ${endedAt}, ${withdrawing.warExhaustionEndedAt} = ${cooldown}, ${withdrawing.lastWarEndedAt} = ${endedAt}
    WHERE ${membership.warId} = ${warId} AND ${membership.villageId} = ${villageId}
      AND ${membership.acceptedAt} IS NOT NULL AND ${membership.endedAt} IS NULL
      AND ${activeWar.status} = 'ACTIVE' AND ${activeWar.endedAt} IS NULL AND ${withdrawing.kageId} = ${userId}
  `),
  );
  if (withdrawn.rowsAffected === 0)
    return errorResponse("War or membership changed. Refresh before surrendering.");
  return { success: true, message: "War surrendered and therefore lost" };
};
