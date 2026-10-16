import { and, eq, inArray, sql } from "drizzle-orm";
import {
  ELDER_MIN_VOTING_COUNT,
  KAGE_ELDER_REMOVAL_LOCK_SECS,
  TERR_BOT_ID,
} from "@/drizzle/constants";
import { notification, userData, village, villageElderVote } from "@/drizzle/schema";
import { resolveElderVote } from "@/libs/elder";
import type { DrizzleClient } from "@/server/db";
import { queryInTransaction } from "@/server/utils/concurrency";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";

/** Live voting and cron expiry share one atomic political settlement. Prestige is retained. */
export const settleKageRemoval = async (
  client: DrizzleClient,
  voteId: string,
  expired = false,
) => {
  const initial = await client.query.villageElderVote.findFirst({
    where: eq(villageElderVote.id, voteId),
  });
  if (initial?.type !== "KAGE_REMOVAL")
    return { success: false, message: "Removal vote not found" };
  return retryOnDeadlock(() =>
    client.transaction(async (transaction) => {
      const tx = transaction as unknown as DrizzleClient;
      await tx
        .update(village)
        .set({ kageScheduleVersion: sql`${village.kageScheduleVersion} + 1` })
        .where(eq(village.id, initial.villageId));
      const [motion, v, elders] = await queryInTransaction([
        tx.query.villageElderVote.findFirst({
          where: eq(villageElderVote.id, voteId),
          with: { entries: true },
        }),
        tx.query.village.findFirst({ where: eq(village.id, initial.villageId) }),
        tx.query.userData.findMany({
          columns: { userId: true },
          where: and(
            eq(userData.villageId, initial.villageId),
            eq(userData.rank, "ELDER"),
            eq(userData.isAi, false),
            eq(userData.isBanned, false),
          ),
        }),
      ]);
      if (motion?.status !== "PENDING")
        return { success: true, message: "Removal vote already resolved" };
      const electorate = new Set(
        elders.filter((e) => e.userId !== motion.targetId).map((e) => e.userId),
      );
      const yes = motion.entries.filter(
        (e) => electorate.has(e.userId) && e.vote === "YES",
      ).length;
      const no = motion.entries.filter(
        (e) => electorate.has(e.userId) && e.vote === "NO",
      ).length;
      const isValid =
        !!v &&
        v.kageId === motion.targetId &&
        (!motion.tenure || motion.tenure.getTime() === v.leaderUpdatedAt.getTime()) &&
        Date.now() >= v.leaderUpdatedAt.getTime() + KAGE_ELDER_REMOVAL_LOCK_SECS * 1000;
      const outcome =
        !isValid || electorate.size < ELDER_MIN_VOTING_COUNT
          ? "REJECTED"
          : resolveElderVote(
              yes,
              no,
              electorate.size,
              expired || new Date() >= motion.endsAt,
            );
      if (outcome === "PENDING")
        return {
          success: true,
          message: `Vote recorded. Current tally: ${yes} YES, ${no} NO`,
        };
      const now = new Date();
      const claim = await tx
        .update(villageElderVote)
        .set({ status: outcome, resolvedAt: now })
        .where(
          and(eq(villageElderVote.id, voteId), eq(villageElderVote.status, "PENDING")),
        );
      if (!claim.rowsAffected)
        return { success: true, message: "Removal vote already resolved" };
      if (outcome === "APPROVED" && v) {
        await tx
          .update(village)
          .set({
            kageId: "",
            leaderUpdatedAt: now,
            kageSchedule: {
              kageId: "",
              tenure: now.toISOString(),
              windows: [],
              publishedAt: null,
              missedStarts: 0,
              paused: false,
              observedAt: now.toISOString(),
              vacancy: {
                removedUserId: motion.targetId,
                reason: motion.reason || "Removed by elder majority vote",
              },
            },
          })
          .where(eq(village.id, v.id));
      }
      const recipients = [...new Set([motion.targetId, ...electorate])];
      // Publish one system announcement; unread counters determine who receives it.
      await tx.insert(notification).values({
        userId: TERR_BOT_ID,
        content:
          outcome === "APPROVED"
            ? `The ${v?.name ?? "village"} Elder Council removed the Kage. Village prestige is retained. Elders may nominate an eligible villager at Town Hall.`
            : `The ${v?.name ?? "village"} Kage removal vote did not pass. The result and reason are published at Town Hall.`,
      });
      await tx
        .update(userData)
        .set({ unreadNotifications: sql`${userData.unreadNotifications} + 1` })
        .where(inArray(userData.userId, recipients));
      return {
        success: isValid,
        message: !isValid
          ? "The Kage has changed or is still protected; vote rejected"
          : outcome === "APPROVED"
            ? "Kage removed. Elders may now nominate an eligible successor."
            : "Kage removal vote failed",
      };
    }),
  );
};
