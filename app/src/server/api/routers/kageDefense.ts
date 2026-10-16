import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  KAGE_CHALLENGER_DAILY_LIMIT,
  KAGE_CHALLENGER_WEEKLY_LIMIT,
  KAGE_DEFENSE_CHECK_IN_MINUTES,
  KAGE_DEFENSE_GRACE_MINUTES,
  KAGE_DEFENSE_NOTICE_HOURS,
  KAGE_DEFENSE_SLOT_MINUTES,
} from "@/drizzle/constants";
import { kageChallenge, userData } from "@/drizzle/schema";
import { initiateBattle } from "@/routers/combat";
import {
  baseServerResponse,
  errorResponse,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  assignKageMatches,
  getKageDefensePublic,
  saveKageSchedule,
  syncLockedKageDefense,
  withinKageChallengeLimits,
  withKageDefense,
} from "@/server/utils/kage";
import { isMysqlDuplicateKeyError } from "@/server/utils/mysqlErrors";
import { getKageEligibility } from "@/utils/kage";
import { secondsFromDate } from "@/utils/time";
import {
  kageAiSchema,
  kageBattleResponseSchema,
  kageJoinSchema,
  kageMatchSchema,
  kageScheduleSchema,
  kageVillageSchema,
} from "@/validators/kage";

export const kageDefenseProcedures = {
  getDefenses: protectedProcedure
    .input(kageVillageSchema)
    .query(async ({ ctx, input }) => {
      const [hall, user] = await Promise.all([
        getKageDefensePublic(ctx.drizzle, input.villageId),
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
        }),
      ]);
      return {
        hall,
        eligibility: user
          ? getKageEligibility(user, input.villageId)
          : "Character not found",
      };
    }),
  publishSchedule: protectedProcedure
    .input(kageScheduleSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      return (
        (await withKageDefense(ctx.drizzle, input.villageId, async (tx, hall) => {
          if (hall.village.kageId !== ctx.userId)
            return errorResponse("Only the current Kage can publish defense times");
          if (!(await syncLockedKageDefense(tx, hall)))
            return errorResponse("Leadership changed. Refresh the defense schedule.");
          if (
            hall.rows.some(({ match }) =>
              ["SCHEDULED", "STARTING", "BATTLE"].includes(match.status),
            )
          )
            return errorResponse(
              "Assigned matches lock the schedule. Use the match reschedule action instead.",
            );
          hall.state.windows = input.windows;
          hall.state.publishedAt = hall.now.toISOString();
          await saveKageSchedule(tx, hall);
          if (!hall.paused) await assignKageMatches(tx, hall);
          return {
            success: true,
            message: "Defense schedule published in UTC game time",
          };
        })) ?? errorResponse("Village not found")
      );
    }),
  joinDefenseQueue: protectedProcedure
    .input(kageJoinSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      return (
        (await withKageDefense(ctx.drizzle, input.villageId, async (tx, hall) => {
          const user = await tx.query.userData.findFirst({
            where: eq(userData.userId, ctx.userId),
          });
          if (!user) return errorResponse("Character not found");
          if (hall.rows.some((r) => r.match.challengerId === ctx.userId))
            return errorResponse("You already have an active queue entry");
          const reason = getKageEligibility(user, input.villageId);
          if (reason) return errorResponse(reason);
          if (hall.village.kageId === ctx.userId)
            return errorResponse("The Kage cannot challenge themselves");
          if (!hall.village.kageId)
            return errorResponse("The village is awaiting a new Kage");
          if (!(await syncLockedKageDefense(tx, hall)))
            return errorResponse("Leadership changed. Refresh the defense schedule.");
          const result = await tx
            .insert(kageChallenge)
            .values({
              id: nanoid(),
              villageId: input.villageId,
              challengerId: ctx.userId,
              kageId: hall.village.kageId,
              tenure: hall.village.leaderUpdatedAt,
              aiRequested: input.aiRequested,
              notBefore: secondsFromDate(KAGE_DEFENSE_NOTICE_HOURS * 3600, hall.now),
            })
            .catch((error: unknown) => {
              if (isMysqlDuplicateKeyError(error)) return null;
              throw error;
            });
          if (!result?.rowsAffected)
            return errorResponse("You already have an active queue entry");
          // Assignment uses the newly inserted row on the next authoritative sync, without blocking play.
          return {
            success: true,
            message: hall.paused
              ? "Joined the queue. Match scheduling is paused for war."
              : "Joined the Kage defense queue",
          };
        })) ?? errorResponse("Village not found")
      );
    }),
  withdrawDefense: protectedProcedure
    .input(kageMatchSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const match = await ctx.drizzle.query.kageChallenge.findFirst({
        where: eq(kageChallenge.id, input.id),
      });
      if (!match) return errorResponse("Match not found");
      return (
        (await withKageDefense(ctx.drizzle, match.villageId, async (tx) => {
          const result = await tx
            .update(kageChallenge)
            .set({
              status: "CANCELLED",
              resolvedAt: new Date(),
              outcome: "Challenger withdrew; no prestige charged",
            })
            .where(
              and(
                eq(kageChallenge.id, input.id),
                eq(kageChallenge.challengerId, ctx.userId),
                inArray(kageChallenge.status, ["QUEUED", "SCHEDULED"]),
              ),
            );
          return result.rowsAffected
            ? { success: true, message: "Withdrawn from the queue" }
            : errorResponse("Only your waiting entry can be withdrawn");
        })) ?? errorResponse("Village not found")
      );
    }),
  rescheduleDefense: protectedProcedure
    .input(kageMatchSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const match = await ctx.drizzle.query.kageChallenge.findFirst({
        where: eq(kageChallenge.id, input.id),
      });
      if (!match) return errorResponse("Match not found");
      return (
        (await withKageDefense(ctx.drizzle, match.villageId, async (tx, hall) => {
          if (!(await syncLockedKageDefense(tx, hall)))
            return errorResponse("Leadership changed. Refresh the defense schedule.");
          const m = hall.rows.find((r) => r.match.id === input.id)?.match;
          if (
            !m ||
            (ctx.userId !== m.challengerId && ctx.userId !== hall.village.kageId)
          )
            return errorResponse("Only match participants can reschedule");
          if (
            m.rescheduled ||
            m.status !== "SCHEDULED" ||
            !m.scheduledAt ||
            hall.paused
          )
            return errorResponse(
              "One reschedule is available for each assigned match outside war",
            );
          if (hall.now >= m.scheduledAt)
            return errorResponse("Reschedule before the appointed match time");
          // Reassign later waiting matches together: the original queue order remains authoritative.
          const index = hall.rows.findIndex((r) => r.match.id === input.id);
          const later = hall.rows
            .slice(index)
            .filter((r) => ["QUEUED", "SCHEDULED"].includes(r.match.status));
          const notBefore = new Date(
            Math.max(
              secondsFromDate(KAGE_DEFENSE_NOTICE_HOURS * 3600, hall.now).getTime(),
              secondsFromDate(KAGE_DEFENSE_SLOT_MINUTES * 60, m.scheduledAt).getTime(),
            ),
          );
          await tx
            .update(kageChallenge)
            .set({ status: "QUEUED", scheduledAt: null, checkedInAt: null, notBefore })
            .where(
              inArray(
                kageChallenge.id,
                later.map((r) => r.match.id),
              ),
            );
          await tx
            .update(kageChallenge)
            .set({ rescheduled: true })
            .where(eq(kageChallenge.id, input.id));
          return {
            success: true,
            message: "Match rescheduled once; queue priority preserved",
          };
        })) ?? errorResponse("Village not found")
      );
    }),
  setDefenseAi: protectedProcedure
    .input(kageAiSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const match = await ctx.drizzle.query.kageChallenge.findFirst({
        where: eq(kageChallenge.id, input.id),
      });
      if (!match) return errorResponse("Match not found");
      return (
        (await withKageDefense(ctx.drizzle, match.villageId, async (tx, hall) => {
          const m = hall.rows.find((r) => r.match.id === input.id)?.match;
          if (!m || !["QUEUED", "SCHEDULED"].includes(m.status))
            return errorResponse("The match can no longer change combat mode");
          const isKage = hall.village.kageId === ctx.userId;
          if (!isKage && m.challengerId !== ctx.userId)
            return errorResponse("Only participants can select combat mode");
          if (isKage && input.consent && !m.aiRequested)
            return errorResponse("The challenger must request AI combat first");
          await tx
            .update(kageChallenge)
            .set(
              isKage
                ? { aiAccepted: input.consent }
                : { aiRequested: input.consent, aiAccepted: false },
            )
            .where(eq(kageChallenge.id, input.id));
          return {
            success: true,
            message: input.consent
              ? "AI preference saved; both players must agree"
              : "Manual PvP selected",
          };
        })) ?? errorResponse("Village not found")
      );
    }),
  checkInDefense: protectedProcedure
    .input(kageMatchSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const match = await ctx.drizzle.query.kageChallenge.findFirst({
        where: eq(kageChallenge.id, input.id),
      });
      if (!match) return errorResponse("Match not found");
      return (
        (await withKageDefense(ctx.drizzle, match.villageId, async (tx, hall) => {
          if (!(await syncLockedKageDefense(tx, hall)))
            return errorResponse("Leadership changed. Refresh the defense schedule.");
          const row = hall.rows.find((r) => r.match.id === input.id);
          const m = row?.match;
          if (!m || m.challengerId !== ctx.userId)
            return errorResponse("Only the challenger can check in");
          if (
            hall.paused ||
            m.hospitalDeferred ||
            m.status !== "SCHEDULED" ||
            !m.scheduledAt
          )
            return errorResponse("Check-in is unavailable while this match is paused");
          if (row.user.status !== "AWAKE")
            return errorResponse("Be awake and free of other activities to check in");
          if (
            hall.now.getTime() <
              m.scheduledAt.getTime() - KAGE_DEFENSE_CHECK_IN_MINUTES * 60_000 ||
            hall.now.getTime() >
              m.scheduledAt.getTime() + KAGE_DEFENSE_GRACE_MINUTES * 60_000
          )
            return errorResponse(
              `Check in during the ${KAGE_DEFENSE_CHECK_IN_MINUTES} minutes before the match or its start grace period`,
            );
          await tx
            .update(kageChallenge)
            .set({ checkedInAt: hall.now })
            .where(eq(kageChallenge.id, input.id));
          return {
            success: true,
            message: hall.village.kage?.isAi
              ? "Checked in. Remain awake and start the title fight at the appointed time."
              : "Checked in. Remain awake; the Kage starts the battle.",
          };
        })) ?? errorResponse("Village not found")
      );
    }),
  startDefense: protectedProcedure
    .input(kageMatchSchema)
    .output(kageBattleResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const match = await ctx.drizzle.query.kageChallenge.findFirst({
        where: eq(kageChallenge.id, input.id),
      });
      if (!match) return errorResponse("Match not found");
      const admission = await withKageDefense(
        ctx.drizzle,
        match.villageId,
        async (tx, hall) => {
          if (!(await syncLockedKageDefense(tx, hall)))
            return errorResponse("Leadership changed. Refresh the defense schedule.");
          const row = hall.rows.find((r) => r.match.id === input.id);
          const m = row?.match;
          const npcIncumbent =
            hall.village.kage?.isAi && ctx.userId === m?.challengerId;
          if (!m || (ctx.userId !== hall.village.kageId && !npcIncumbent))
            return errorResponse("Only the current Kage can start this match");
          if (
            m.status !== "SCHEDULED" ||
            !m.scheduledAt ||
            hall.paused ||
            m.hospitalDeferred
          )
            return errorResponse("This match is not ready to start");
          if (
            m.kageId !== hall.village.kageId ||
            m.tenure.getTime() !== hall.village.leaderUpdatedAt.getTime()
          )
            return errorResponse("Leadership changed; the match will be reassigned");
          if (
            hall.now < m.scheduledAt ||
            hall.now.getTime() >
              m.scheduledAt.getTime() + KAGE_DEFENSE_GRACE_MINUTES * 60_000
          )
            return errorResponse(
              "Start at the scheduled time, within the published grace period",
            );
          if (!m.checkedInAt)
            return errorResponse("The challenger must check in first");
          const reason = getKageEligibility(row.user, match.villageId);
          if (reason) return errorResponse(reason);
          if (hall.rows.some((r) => r.match.status === "BATTLE"))
            return errorResponse("Finish the current defense first");
          const history = await tx.query.kageChallenge.findMany({
            where: eq(kageChallenge.challengerId, m.challengerId),
          });
          if (!withinKageChallengeLimits(history, hall.now))
            return errorResponse(
              `Challengers may fight ${KAGE_CHALLENGER_DAILY_LIMIT} time per UTC day and ${KAGE_CHALLENGER_WEEKLY_LIMIT} times per UTC week`,
            );
          if (
            row.user.status !== "AWAKE" ||
            (!hall.village.kage?.isAi && hall.village.kage?.status !== "AWAKE")
          )
            return errorResponse(
              "Both participants must be awake and free of other activities",
            );
          return { success: true as const, message: "Ready", match: m };
        },
      );
      if (!admission?.success || !("match" in admission))
        return admission ?? errorResponse("Village not found");
      const m = admission.match;
      let result: Awaited<ReturnType<typeof initiateBattle>>;
      try {
        result = await initiateBattle(
          {
            client: ctx.drizzle,
            userIds: [m.challengerId],
            targetIds: [m.kageId],
            biome: "arena",
            autoCombatUserIds:
              m.aiRequested && m.aiAccepted ? [m.challengerId, m.kageId] : undefined,
            kageMatch: {
              id: m.id,
              villageId: m.villageId,
              kageId: m.kageId,
              tenure: m.tenure.toISOString(),
              battleId: nanoid(),
              ai: m.aiRequested && m.aiAccepted,
            },
          },
          "KAGE_PVP",
        );
      } catch (error) {
        await resetFailedLaunch(ctx.drizzle, m.id, m.villageId);
        throw error;
      }
      if (!result.success) await resetFailedLaunch(ctx.drizzle, m.id, m.villageId);
      return result;
    }),
};

/** Failed system admissions receive another published slot without spending the player's reschedule. */
const resetFailedLaunch = (
  client: import("@/server/db").DrizzleClient,
  id: string,
  villageId: string,
) =>
  withKageDefense(client, villageId, async (tx, hall) => {
    const index = hall.rows.findIndex(
      (r) => r.match.id === id && r.match.status === "SCHEDULED",
    );
    if (index < 0) return;
    await tx
      .update(kageChallenge)
      .set({
        status: "QUEUED",
        scheduledAt: null,
        checkedInAt: null,
        notBefore: secondsFromDate(KAGE_DEFENSE_NOTICE_HOURS * 3600, hall.now),
        outcome: "Battle could not start; queue priority retained without penalty",
      })
      .where(
        inArray(
          kageChallenge.id,
          hall.rows
            .slice(index)
            .filter((r) => ["QUEUED", "SCHEDULED"].includes(r.match.status))
            .map((r) => r.match.id),
        ),
      );
  });
