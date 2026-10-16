import { randomInt } from "node:crypto";
import {
  and,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  ELDER_KAGE_REMOVAL_VOTE_DAYS,
  ELDER_MIN_VOTING_COUNT,
  KAGE_DEFAULT_PRESTIGE,
  KAGE_DEFENSE_SETUP_HOURS,
  KAGE_DELAY_SECS,
  KAGE_ELDER_REMOVAL_LOCK_SECS,
  KAGE_MAX_WEEKLY_PRESTIGE_SEND,
  KAGE_PRESTIGE_REQUIREMENT,
  KAGE_REMOVAL_COOLDOWN_DAYS,
} from "@/drizzle/constants";
import {
  actionLog,
  clan,
  notification,
  userData,
  village,
  villageElderVote,
  villageStructure,
} from "@/drizzle/schema";
import { castElderVoteEntry, fetchElderVote } from "@/libs/elder";
import { getServerPusher } from "@/libs/pusher";
import { fetchClan } from "@/routers/clan";
import { kageDefenseProcedures } from "@/routers/kageDefense";
import { fetchUpdatedUser, fetchUser, updateNindo } from "@/routers/profile";
import { fetchVillage } from "@/routers/village";
import {
  baseServerResponse,
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
} from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { queryInTransaction } from "@/server/utils/concurrency";
import { withKageDefense } from "@/server/utils/kage";
import { settleKageRemoval } from "@/server/utils/kageGovernance";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { getKageEligibility } from "@/utils/kage";
import { canTakeKage } from "@/utils/permissions";
import { secondsFromDate, secondsFromNow } from "@/utils/time";
import { calcStructureUpgrade } from "@/utils/village";
import {
  kageNominationSchema,
  kageRemovalSchema,
  kageVillageSchema,
  kageVoteSchema,
} from "@/validators/kage";
import {
  structureUpgradeSchema,
  villageMaintenancePaymentSchema,
} from "@/validators/villageMission";

const _pusher = getServerPusher();

export const kageRouter = createTRPCRouter({
  ...kageDefenseProcedures,
  /**
   * Misc other kage features
   */
  resignKage: protectedProcedure
    .meta({ mcp: { description: "Resign from kage position" } })
    .input(z.object({ villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Destructure
      const villageId = input.villageId;
      // Fetch
      const [user, uVillage, elder] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchVillage(ctx.drizzle, input.villageId),
        fetchKageReplacement(ctx.drizzle, input.villageId, ctx.userId),
      ]);
      // Guards
      if (!elder) return errorResponse("No elder found");
      if (!user) return errorResponse("User not found");
      if (!uVillage) return errorResponse("Village not found");
      if (uVillage.type !== "VILLAGE") return errorResponse("Only for villages");
      if (user.villageId !== villageId) return errorResponse("Wrong village");
      if (user.userId !== uVillage?.kageId) return errorResponse("Not kage");
      // Update
      await ctx.drizzle
        .update(village)
        .set({ kageId: elder.userId, leaderUpdatedAt: new Date(), kageSchedule: null })
        .where(eq(village.id, user.villageId));
      return { success: true, message: "You have resigned as kage" };
    }),

  sendKagePrestige: protectedProcedure
    .meta({
      mcp: { description: "Send prestige to the kage as elder" },
    })
    .input(z.object({ kageId: z.string(), amount: z.number() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, kage, records] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.kageId),
        ctx.drizzle.query.actionLog.findMany({
          columns: { relatedValue: true },
          where: and(
            eq(actionLog.userId, ctx.userId),
            eq(actionLog.relatedId, input.kageId),
            gte(actionLog.createdAt, sql`NOW() - INTERVAL 1 WEEK`),
          ),
        }),
      ]);
      // Derived
      const previousSent = records?.reduce((acc, curr) => acc + curr.relatedValue, 0);
      // Guards
      if (user.rank !== "ELDER") return errorResponse("Must be an elder");
      if (user.villageId !== kage.villageId) return errorResponse("Wrong village");
      if (input.amount <= 0) return errorResponse("Invalid amount");
      if (previousSent + input.amount > KAGE_MAX_WEEKLY_PRESTIGE_SEND) {
        return errorResponse(
          `You have already sent ${previousSent} prestige this week. You can only send ${KAGE_MAX_WEEKLY_PRESTIGE_SEND - previousSent} more.`,
        );
      }
      if (user.villagePrestige < input.amount) {
        return errorResponse("Not enough prestige");
      }
      // Create transfer request
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({
            villagePrestige: sql`${userData.villagePrestige} - ${input.amount}`,
          })
          .where(eq(userData.userId, ctx.userId)),
        ctx.drizzle
          .update(userData)
          .set({
            villagePrestige: sql`${userData.villagePrestige} + ${input.amount}`,
          })
          .where(eq(userData.userId, input.kageId)),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          changes: [`${input.amount} prestige sent to ${kage.username}`],
          relatedId: input.kageId,
          relatedMsg: `Sent ${input.amount} prestige to ${kage.username}`,
          relatedImage: user.avatarLight,
          relatedValue: input.amount,
        }),
      ]);
      return {
        success: true,
        message: `Sent ${input.amount} prestige to ${kage.username}`,
      };
    }),
  takeKage: protectedProcedure
    .output(baseServerResponse)
    .input(
      z.object({
        reason: z
          .string()
          .min(10, "Reason must be at least 10 characters")
          .transform((val) => val.trim()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });

      // Guards
      if (!user) return errorResponse("User not found");

      // Fetch village data for logging
      if (user.anbuId) return errorResponse("Cannot be kage while in ANBU");
      if (user.village?.type !== "VILLAGE") return errorResponse("Only for villages");
      if (!canTakeKage(user.role)) return errorResponse("Not staff");
      // Update
      const [result] = await Promise.all([
        ctx.drizzle
          .update(village)
          .set({ kageId: user.userId, leaderUpdatedAt: new Date(), kageSchedule: null })
          .where(eq(village.id, user.villageId ?? "")),
        // The outgoing kage keeps their village prestige: a staff takeover is an
        // administrative action and must not cost the displaced player anything.
        ctx.drizzle
          .update(userData)
          .set({
            rank: sql`CASE WHEN ${userData.rank} = 'ELDER' THEN 'JONIN' ELSE ${userData.rank} END`,
            villagePrestige:
              user.villagePrestige > KAGE_DEFAULT_PRESTIGE
                ? user.villagePrestige
                : KAGE_DEFAULT_PRESTIGE,
          })
          .where(eq(userData.userId, user.userId)),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          relatedId: user.userId,
          relatedMsg: `Staff took kage position in ${user?.village?.name || "Unknown Village"}`,
          changes: [
            `Previous KageId: ${user?.village?.kageId}`,
            `Reason: ${input.reason}`,
          ],
        }),
      ]);
      if (result.rowsAffected === 0) return errorResponse("No village found");
      return { success: true, message: "You have taken the kage position" };
    }),
  upsertNotice: protectedProcedure
    .meta({
      mcp: { description: "Update village notice as kage" },
    })
    .input(z.object({ content: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      const village = user?.village;
      // Apply 24-hour lockout to all kages (villages, hideouts, and strongholds)
      const lockout = KAGE_DELAY_SECS;
      // Guards
      if (!user) return errorResponse("User not found");
      if (!village) return errorResponse("Village not found");
      if (user.isBanned) return errorResponse("User is banned");
      if (user.isSilenced) return errorResponse("User is silenced");
      if (village.kageId !== ctx.userId) return errorResponse("Not kage");
      if (secondsFromDate(lockout, village.leaderUpdatedAt) > new Date()) {
        return errorResponse("Must have been kage for 5 days");
      }
      // Update
      return updateNindo(ctx.drizzle, village.id, input.content, "kageOrder");
    }),
  getElders: protectedProcedure
    .meta({ mcp: { description: "Get village elders" } })
    .input(z.object({ villageId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await fetchElders(ctx.drizzle, input.villageId);
    }),
  upgradeStructure: protectedProcedure
    .meta({
      mcp: { description: "Upgrade village structure as kage" },
    })
    .input(structureUpgradeSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, userVillage, clanData] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchVillage(ctx.drizzle, input.villageId),
        input.clanId ? fetchClan(ctx.drizzle, input.clanId) : null,
      ]);

      // Derived
      const structure = userVillage?.structures.find((s) => s.id === input.structureId);
      const isHideoutOrStronghold = ["HIDEOUT", "STRONGHOLD"].includes(
        userVillage?.type ?? "",
      );
      const lockout = isHideoutOrStronghold ? KAGE_DELAY_SECS : 0;

      // Guards
      if (!user) return errorResponse("User not found");
      if (!userVillage) return errorResponse("Village not found");
      if (!structure) return errorResponse("Structure not found");
      if (isHideoutOrStronghold && !clanData) return errorResponse("Faction not found");
      if (userVillage.kageId !== user.userId) return errorResponse("Not the leader");
      if (structure.level === 0) return errorResponse("Can't upgrade from lvl 0 yet");
      if (structure.level >= structure.maxLevel)
        return errorResponse("Structure is already at its maximum level");
      if (user.isBanned) return errorResponse("You are banned");
      if (userVillage.type === "VILLAGE" && userVillage.structureMaintenanceDue > 0)
        return errorResponse("Pay outstanding structure maintenance before upgrading");
      if (user.villageId !== structure.villageId) return errorResponse("Wrong village");
      if (!["VILLAGE", "STRONGHOLD"].includes(userVillage.type)) {
        return errorResponse("Only for villages");
      }
      if (clanData && clanData.id !== user.clanId) {
        return errorResponse("Not in faction");
      }
      if (secondsFromDate(lockout, userVillage.leaderUpdatedAt) > new Date()) {
        return errorResponse("Must have been in charge for 24 hours");
      }
      // Guard on cost & mutate
      const { total } = calcStructureUpgrade(structure, userVillage);
      if (
        isHideoutOrStronghold && clanData
          ? clanData.points < total
          : userVillage.tokens < total
      ) {
        return errorResponse(
          isHideoutOrStronghold ? "Not enough clan points" : "Not enough tokens",
        );
      }
      const fundingClan = isHideoutOrStronghold ? clanData : null;
      const balance = fundingClan ? clan.points : village.tokens;
      const guards = and(
        eq(villageStructure.id, input.structureId),
        eq(villageStructure.villageId, input.villageId),
        eq(villageStructure.level, structure.level),
        gte(villageStructure.maxLevel, structure.level + 1),
        eq(village.kageId, ctx.userId),
        eq(village.type, userVillage.type),
        gte(balance, total),
        fundingClan
          ? lte(village.leaderUpdatedAt, new Date(Date.now() - lockout * 1000))
          : eq(village.structureMaintenanceDue, 0),
        exists(
          ctx.drizzle
            .select({ userId: userData.userId })
            .from(userData)
            .where(
              and(
                eq(userData.userId, ctx.userId),
                eq(userData.villageId, village.id),
                eq(userData.isBanned, false),
                fundingClan ? eq(userData.clanId, fundingClan.id) : undefined,
              ),
            ),
        ),
      );
      // Drizzle has no multi-table UPDATE builder. A joined write debits funds and
      // upgrades the guarded level together, without a transaction or partial payment.
      const result = await retryOnDeadlock(() =>
        ctx.drizzle.execute(sql`
          UPDATE ${villageStructure}
          INNER JOIN ${village} ON ${village.id} = ${villageStructure.villageId}
          ${fundingClan ? sql`INNER JOIN ${clan} ON ${clan.id} = ${fundingClan.id}` : sql``}
          SET ${balance} = ${balance} - ${total},
              ${villageStructure.level} = ${structure.level + 1},
              ${villageStructure.lastUpgradedAt} = ${new Date()}
          WHERE ${guards}
        `),
      );
      if (result.rowsAffected === 0)
        return errorResponse("Structure or funds changed; refresh and try again");

      return { success: true, message: "Structure upgraded" };
    }),
  payStructureMaintenance: protectedProcedure
    .input(villageMaintenancePaymentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.drizzle
        .update(village)
        .set({
          tokens: sql`${village.tokens} - ${village.structureMaintenanceDue}`,
          structureMaintenanceDue: 0,
        })
        .where(
          and(
            eq(village.id, input.villageId),
            eq(village.type, "VILLAGE"),
            eq(village.kageId, ctx.userId),
            sql`${village.structureMaintenanceDue} > 0`,
            gte(village.tokens, village.structureMaintenanceDue),
            exists(
              ctx.drizzle
                .select({ userId: userData.userId })
                .from(userData)
                .where(
                  and(
                    eq(userData.userId, ctx.userId),
                    eq(userData.villageId, village.id),
                    eq(userData.isBanned, false),
                  ),
                ),
            ),
          ),
        );
      return result.rowsAffected > 0
        ? { success: true, message: "Structure maintenance paid" }
        : errorResponse(
            "Only the village Kage can pay an outstanding bill, and the village must have enough tokens",
          );
    }),
  // Elders can initiate removal once the current kage's protected tenure has passed.
  initiateKageRemovalVote: protectedProcedure
    .meta({
      mcp: {
        description: "Initiate a vote to remove the current kage",
      },
    })
    .input(kageRemovalSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      return (
        (await withKageDefense(ctx.drizzle, input.villageId, async (tx, hall) => {
          const [user, elders, failedVotes] = await queryInTransaction([
            tx.query.userData.findFirst({ where: eq(userData.userId, ctx.userId) }),
            tx.query.userData.findMany({
              columns: { userId: true },
              where: and(
                eq(userData.villageId, input.villageId),
                eq(userData.rank, "ELDER"),
                eq(userData.isAi, false),
                eq(userData.isBanned, false),
              ),
            }),
            tx.query.villageElderVote.findMany({
              where: and(
                eq(villageElderVote.villageId, input.villageId),
                eq(villageElderVote.type, "KAGE_REMOVAL"),
                eq(villageElderVote.status, "REJECTED"),
              ),
              orderBy: [desc(villageElderVote.resolvedAt)],
              limit: 1,
            }),
          ]);
          const v = hall.village;
          if (
            user?.rank !== "ELDER" ||
            user.isAi ||
            user.isBanned ||
            user.villageId !== input.villageId
          )
            return errorResponse(
              "Only serving village elders can initiate a removal vote",
            );
          if (!v.kageId || ctx.userId === v.kageId)
            return errorResponse(
              "Choose the village's current Kage; you cannot remove yourself",
            );
          if (
            hall.now.getTime() <
            v.leaderUpdatedAt.getTime() + KAGE_ELDER_REMOVAL_LOCK_SECS * 1000
          )
            return errorResponse(
              `The Kage is protected for ${KAGE_ELDER_REMOVAL_LOCK_SECS / 86400} days after taking office`,
            );
          const failed = failedVotes[0];
          if (
            failed?.resolvedAt &&
            failed.targetId === v.kageId &&
            (!failed.tenure ||
              failed.tenure.getTime() === v.leaderUpdatedAt.getTime()) &&
            failed.resolvedAt >= v.leaderUpdatedAt &&
            failed.resolvedAt > secondsFromNow(-KAGE_REMOVAL_COOLDOWN_DAYS * 86400)
          )
            return errorResponse(
              `The village must wait ${KAGE_REMOVAL_COOLDOWN_DAYS} days after a failed removal vote`,
            );
          const eligibleElders = elders.filter((e) => e.userId !== v.kageId);
          if (eligibleElders.length < ELDER_MIN_VOTING_COUNT)
            return errorResponse(
              `At least ${ELDER_MIN_VOTING_COUNT} elders are required`,
            );
          const inserted = await tx
            .insert(villageElderVote)
            .values({
              id: nanoid(),
              villageId: v.id,
              type: "KAGE_REMOVAL",
              initiatedByUserId: ctx.userId,
              targetId: v.kageId,
              tenure: v.leaderUpdatedAt,
              reason: input.reason,
              endsAt: secondsFromNow(ELDER_KAGE_REMOVAL_VOTE_DAYS * 86400),
            })
            .onDuplicateKeyUpdate({ set: { id: sql`id` } });
          if (!inserted.rowsAffected)
            return errorResponse("There is already a pending Kage removal vote");
          const recipients = eligibleElders.map((e) => e.userId);
          // Notification is a shared announcement; unread counters select its recipients.
          await tx.insert(notification).values({
            userId: user.userId,
            content: `${user.username} proposed removing the ${v.name} Kage: ${input.reason} Vote at Town Hall.`,
          });
          await tx
            .update(userData)
            .set({ unreadNotifications: sql`${userData.unreadNotifications} + 1` })
            .where(inArray(userData.userId, recipients));
          return {
            success: true,
            message: `Removal vote published. Elders have ${ELDER_KAGE_REMOVAL_VOTE_DAYS} days to vote.`,
          };
        })) ?? errorResponse("Village not found")
      );
    }),

  // Cast a vote on a kage removal motion (elder-only)
  voteOnKageRemoval: protectedProcedure
    .meta({
      mcp: {
        description: "Vote on a pending kage removal motion",
      },
    })
    .input(kageVoteSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const motion = await fetchElderVote(ctx.drizzle, input.voteId);
      if (motion?.type !== "KAGE_REMOVAL")
        return errorResponse("Removal vote not found");
      const recorded = await withKageDefense(
        ctx.drizzle,
        motion.villageId,
        async (tx, hall) => {
          const [user, current, elders] = await queryInTransaction([
            tx.query.userData.findFirst({ where: eq(userData.userId, ctx.userId) }),
            tx.query.villageElderVote.findFirst({
              where: eq(villageElderVote.id, input.voteId),
              with: { entries: true },
            }),
            tx.query.userData.findMany({
              columns: { userId: true },
              where: and(
                eq(userData.villageId, motion.villageId),
                eq(userData.rank, "ELDER"),
                eq(userData.isAi, false),
                eq(userData.isBanned, false),
              ),
            }),
          ]);
          if (
            user?.rank !== "ELDER" ||
            user.isAi ||
            user.isBanned ||
            user.villageId !== motion.villageId
          )
            return errorResponse("Only serving village elders can vote");
          if (current?.status !== "PENDING" || hall.now >= current.endsAt)
            return errorResponse("The voting period has ended");
          if (ctx.userId === current.targetId)
            return errorResponse("The Kage cannot vote on their own removal");
          const count = elders.filter((e) => e.userId !== current.targetId).length;
          if (count < ELDER_MIN_VOTING_COUNT)
            return errorResponse(
              `At least ${ELDER_MIN_VOTING_COUNT} eligible elders are required`,
            );
          const inserted = await castElderVoteEntry(
            tx,
            input.voteId,
            ctx.userId,
            input.vote,
            count,
          );
          return inserted
            ? { success: true, message: "Vote recorded" }
            : errorResponse("You have already voted");
        },
      );
      if (!recorded?.success) return recorded ?? errorResponse("Village not found");
      return settleKageRemoval(ctx.drizzle, input.voteId);
    }),

  getRemovalHistory: protectedProcedure
    .input(kageVillageSchema)
    .query(async ({ ctx, input }) => {
      const votes = await ctx.drizzle.query.villageElderVote.findMany({
        where: and(
          eq(villageElderVote.villageId, input.villageId),
          eq(villageElderVote.type, "KAGE_REMOVAL"),
        ),
        with: { entries: true },
        orderBy: [desc(villageElderVote.createdAt)],
        limit: 20,
      });
      return votes.map(({ entries, ...vote }) => ({
        ...vote,
        yes: entries.filter((e) => e.vote === "YES").length,
        no: entries.filter((e) => e.vote === "NO").length,
      }));
    }),
  nominateKage: protectedProcedure
    .input(kageNominationSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const motion = input.voteId
        ? await ctx.drizzle.query.villageElderVote.findFirst({
            where: eq(villageElderVote.id, input.voteId),
          })
        : null;
      if (
        input.voteId &&
        (motion?.type !== "KAGE_REMOVAL" ||
          motion.status !== "APPROVED" ||
          !motion.resolvedAt ||
          motion.villageId !== input.villageId)
      )
        return errorResponse("A successful removal vote for this village is required");
      return (
        (await withKageDefense(ctx.drizzle, input.villageId, async (tx, hall) => {
          const [elder, candidate] = await queryInTransaction([
            tx.query.userData.findFirst({ where: eq(userData.userId, ctx.userId) }),
            tx.query.userData.findFirst({ where: eq(userData.userId, input.userId) }),
          ]);
          if (
            elder?.rank !== "ELDER" ||
            elder.isBanned ||
            elder.isAi ||
            elder.userId === hall.state.vacancy?.removedUserId ||
            elder.villageId !== input.villageId
          )
            return errorResponse("Only serving elders may nominate the successor");
          if (!candidate) return errorResponse("Candidate not found");
          const reason = getKageEligibility(candidate, input.villageId);
          if (reason) return errorResponse(reason);
          if (candidate.userId === hall.state.vacancy?.removedUserId)
            return errorResponse("Nominate a different villager than the removed Kage");
          if (
            hall.village.kageId ||
            !hall.state.vacancy ||
            (motion &&
              hall.village.leaderUpdatedAt.getTime() !== motion.resolvedAt?.getTime())
          )
            return errorResponse("The vacancy has already been filled");
          if (motion) {
            const claim = await tx
              .update(villageElderVote)
              .set({ successorId: candidate.userId })
              .where(
                and(
                  eq(villageElderVote.id, motion.id),
                  isNull(villageElderVote.successorId),
                ),
              );
            if (!claim.rowsAffected)
              return errorResponse("A successor has already been nominated");
          }
          if (candidate.rank === "ELDER")
            await tx
              .update(userData)
              .set({ rank: "JONIN" })
              .where(eq(userData.userId, candidate.userId));
          await tx
            .update(village)
            .set({
              kageId: candidate.userId,
              leaderUpdatedAt: new Date(),
              kageSchedule: null,
            })
            .where(eq(village.id, input.villageId));
          return {
            success: true,
            message: `${candidate.username} appointed Kage. Publish a schedule within ${KAGE_DEFENSE_SETUP_HOURS} hours.`,
          };
        })) ?? errorResponse("Village not found")
      );
    }),
});

/**
 * Fetches the elders from the user data table based on the provided village ID.
 * @param client - The DrizzleClient instance used for querying the database.
 * @param villageId - The ID of the village to fetch elders from.
 * @returns A Promise that resolves to an array of elder user data objects.
 */
export const fetchElders = async (client: DrizzleClient, villageId: string) => {
  return await client.query.userData.findMany({
    columns: {
      username: true,
      userId: true,
      villageId: true,
      avatar: true,
      level: true,
      rank: true,
      isOutlaw: true,
      updatedAt: true,
    },
    where: and(
      eq(userData.villageId, villageId),
      eq(userData.rank, "ELDER"),
      eq(userData.isAi, false),
    ),
  });
};

/**
 * Fetches a kage replacement from the user data table based on the provided village ID and current kage ID.
 * @param client - The DrizzleClient instance used for querying the database.
 * @param villageId - The ID of the village to fetch a replacement from.
 * @param currentKageId - The ID of the current kage.
 * @returns A Promise that resolves to a user data object representing the replacement kage.
 */
export const fetchKageReplacement = async (
  client: DrizzleClient,
  villageId: string,
  currentKageId: string,
) => {
  const elders = await client.query.userData.findMany({
    where: and(
      eq(userData.villageId, villageId),
      eq(userData.rank, "ELDER"),
      ne(userData.userId, currentKageId),
      isNull(userData.anbuId),
      or(
        gte(userData.villagePrestige, KAGE_PRESTIGE_REQUIREMENT),
        eq(userData.isAi, true),
      ),
    ),
  });
  const userElders = elders.filter((e) => !e.isAi);
  if (userElders.length > 0) {
    return userElders[randomInt(userElders.length)];
  }
  if (elders.length === 0) return undefined;
  return elders[randomInt(elders.length)];
};
