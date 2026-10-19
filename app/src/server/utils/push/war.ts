import * as Sentry from "@sentry/nextjs";
import { and, eq, gte, inArray } from "drizzle-orm";
import { after } from "next/server";
import { PUSH_TOKEN_STALE_DAYS } from "@/drizzle/constants";
import { userData, userDevice } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { isPushEnabled, sendPushToUsers } from "@/server/utils/push";
import { secondsFromDate } from "@/utils/time";
import { warUpdate } from "./messages";

/** Only committed war transitions call this; roster queries stay off their response. */
export const notifyWarVillages = (
  client: DrizzleClient,
  villageIds: string[],
  warId: string,
) => {
  const villages = [...new Set(villageIds)].filter(Boolean);
  if (!villages.length || !isPushEnabled()) return;
  after(async () => {
    try {
      const recipients = await client
        .selectDistinct({ userId: userData.userId })
        .from(userDevice)
        .innerJoin(userData, eq(userData.userId, userDevice.userId))
        .where(
          and(
            inArray(userData.villageId, villages),
            eq(userData.isAi, false),
            gte(
              userDevice.lastSeenAt,
              secondsFromDate(-PUSH_TOKEN_STALE_DAYS * 86400, new Date()),
            ),
          ),
        );
      await sendPushToUsers(
        client,
        recipients.map(({ userId }) => userId),
        warUpdate(warId),
      );
    } catch (error) {
      Sentry.captureException(error, { tags: { source: "warPush" } });
    }
  });
};
