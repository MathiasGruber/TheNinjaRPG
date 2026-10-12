import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { QUEST_PARTY_MAX_MEMBERS, QUEST_PARTY_TYPES } from "@/drizzle/constants";
import type { Quest } from "@/drizzle/schema";
import {
  quest,
  questHistory,
  questParty,
  user2conversation,
  userData,
} from "@/drizzle/schema";
import { questCoopParty, transitionCoopParty } from "@/libs/coop";
import { isQuestComplete } from "@/libs/objectives";
import {
  getActiveObjectives,
  getNewTrackers,
  isAvailableUserQuests,
  isObjectiveLocationSatisfied,
  isQuestRankAllowed,
  type QuestConsequence,
  questTypeConcurrentBlockMessage,
  questUiAccessBlockMessage,
} from "@/libs/quest";
import { initiateBattle } from "@/routers/combat";
import type { UserWithRelations } from "@/routers/profile";
import { fetchUpdatedUser } from "@/routers/profile";
import {
  assignQuestToUser,
  fetchUserQuestByQuestId,
  incrementDailyQuestCounter,
} from "@/routers/quests";
import { fetchSectorVillage } from "@/routers/village";
import { createTRPCRouter, errorResponse, protectedProcedure } from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { claimUserSnapshot } from "@/server/utils/concurrency";
import {
  cleanupCoopBattleStart,
  joinCoopChat,
  launchCoopEncounter,
  leaveCoopChat,
} from "@/server/utils/coop";
import {
  questPartyRelations,
  saveQuestPartyMember,
  synchronizeQuestParty,
} from "@/server/utils/questParty";
import { secondsPassed } from "@/utils/time";
import { QuestTracker } from "@/validators/objectives";
import {
  questPartyCreateSchema,
  questPartyIdSchema,
  questPartyInviteSchema,
} from "@/validators/questParty";

export const questPartyRouter = createTRPCRouter({
  disband: protectedProcedure
    .input(questPartyIdSchema)
    .mutation(async ({ ctx, input }) => {
      const loaded = await ctx.drizzle.query.questParty.findFirst({
        where: eq(questParty.id, input.partyId),
        with: questPartyRelations,
      });
      const party = loaded?.quest
        ? await synchronizeQuestParty(ctx.drizzle, loaded)
        : loaded;
      if (!party) return errorResponse("Quest team not found");
      const transition = transitionCoopParty(
        "quest",
        questCoopParty(party),
        ctx.userId,
        "disband",
      );
      if (!transition.success) return errorResponse(transition.message);
      // Include attached members whose roster removal still awaits personal detachment.
      const members = [...(loaded?.members ?? []), ...party.members];
      if (members.some((member) => member.status === "BATTLE"))
        return errorResponse("Finish all members' battles before disbanding the team");
      const claimId = `claiming:${Date.now()}:${nanoid()}`;
      const claimed = await ctx.drizzle
        .update(questParty)
        .set({ battleId: claimId, version: party.version + 1 })
        .where(
          and(
            eq(questParty.id, party.id),
            eq(questParty.version, party.version),
            isNull(questParty.battleId),
          ),
        );
      if (claimed.rowsAffected !== 1)
        return errorResponse("The team changed. Please try again");
      // Keep canonical progress until every member has atomically saved it and detached.
      // A concurrent update to another quest retries from that member's fresh snapshot.
      try {
        const detached = await Promise.all(
          [...new Set(members.map((member) => member.userId))].map((userId) =>
            saveQuestPartyMember(ctx.drizzle, party, userId, true),
          ),
        );
        if (detached.some((saved) => !saved)) {
          await ctx.drizzle
            .update(questParty)
            .set({ battleId: null, version: sql`${questParty.version} + 1` })
            .where(and(eq(questParty.id, party.id), eq(questParty.battleId, claimId)));
          return errorResponse(
            "Finish all members' battles before disbanding the team",
          );
        }
        await ctx.drizzle
          .delete(questParty)
          .where(and(eq(questParty.id, party.id), eq(questParty.battleId, claimId)));
        await ctx.drizzle
          .delete(user2conversation)
          .where(eq(user2conversation.conversationId, party.id));
      } catch (error) {
        await ctx.drizzle
          .update(questParty)
          .set({ battleId: null, version: sql`${questParty.version} + 1` })
          .where(and(eq(questParty.id, party.id), eq(questParty.battleId, claimId)));
        throw error;
      }
      return {
        success: true,
        message: "Quest team disbanded. Members can continue their own quests",
      };
    }),
  startEncounter: protectedProcedure
    .input(questPartyIdSchema)
    .mutation(async ({ ctx, input }) => {
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      return startQuestPartyEncounter({
        client: ctx.drizzle,
        user,
        userId: ctx.userId,
        partyId: input.partyId,
      });
    }),
  overview: protectedProcedure.query(async ({ ctx }) => {
    const [{ user }, parties] = await Promise.all([
      fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
        allowQuestPartySyncFallback: true,
      }),
      ctx.drizzle.query.questParty.findMany({
        where: or(
          eq(questParty.isPublic, true),
          sql`JSON_CONTAINS(${questParty.invitedUserIds}, JSON_QUOTE(${ctx.userId}))`,
          sql`JSON_CONTAINS(${questParty.memberIds}, JSON_QUOTE(${ctx.userId}))`,
        ),
        with: {
          quest: {
            columns: {
              name: true,
              image: true,
              teamEnabled: true,
              hidden: true,
              content: true,
              consecutiveObjectives: true,
            },
          },
          members: {
            columns: { userId: true, username: true, status: true, sector: true },
          },
        },
        orderBy: [
          desc(
            sql`JSON_CONTAINS(${questParty.invitedUserIds}, JSON_QUOTE(${ctx.userId})) OR JSON_CONTAINS(${questParty.memberIds}, JSON_QUOTE(${ctx.userId}))`,
          ),
          desc(questParty.createdAt),
        ],
        limit: 100,
      }),
    ]);
    return {
      current: user?.questParty
        ? {
            id: user.questParty.id,
            version: user.questParty.version,
            questId: user.questParty.questId,
            name: user.questParty.quest.name,
            leaderId: user.questParty.leaderId,
            isPublic: user.questParty.isPublic,
            members: user.questParty.members.map(
              ({ userId, username, sector, status }) => ({
                userId,
                username,
                sector,
                status,
              }),
            ),
            battleId: user.questParty.battleId,
            // Failed terminal goals are done but do not entitle members to final rewards.
            completed:
              !user.questParty.tracker.failed &&
              isQuestComplete(user.questParty.quest, user.questParty.tracker),
            failed: user.questParty.tracker.failed ?? false,
          }
        : null,
      teams: parties
        .filter(
          (party) =>
            party.quest?.teamEnabled &&
            !party.tracker.failed &&
            !isQuestComplete(party.quest, party.tracker) &&
            (!party.quest.hidden ||
              party.memberIds.includes(ctx.userId) ||
              party.invitedUserIds.includes(ctx.userId)),
        )
        .map((party) => ({
          id: party.id,
          questId: party.questId,
          name: party.quest.name,
          isPublic: party.isPublic,
          leaderId: party.leaderId,
          members: party.members,
          battleId: party.battleId,
          invited: party.invitedUserIds.includes(ctx.userId),
        })),
    };
  }),
  create: protectedProcedure
    .input(questPartyCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const [{ user }, definition, history] = await Promise.all([
        fetchUpdatedUser({ client: ctx.drizzle, userId: ctx.userId }),
        ctx.drizzle.query.quest.findFirst({ where: eq(quest.id, input.questId) }),
        fetchUserQuestByQuestId(ctx.drizzle, ctx.userId, input.questId),
      ]);
      if (!user) return errorResponse("User not found");
      const block = teamQuestBlock(user, definition);
      if (block) return errorResponse(block);
      if (!definition) return errorResponse("Quest not found");
      const partyId = nanoid();
      const reserved = await claimUserSnapshot({
        client: ctx.drizzle,
        userId: ctx.userId,
        updatedAt: user.updatedAt,
        set: { questPartyId: partyId },
        where: [isNull(userData.questPartyId), eq(userData.status, "AWAKE")],
      });
      if (!reserved.success)
        return errorResponse("You already have a quest team or your status changed");
      user.questPartyId = partyId;
      user.updatedAt = reserved.claimedAt;
      try {
        const result = await acceptTeamQuest(ctx.drizzle, user, definition, history);
        if (!result.success) {
          await releaseTeamSlot(ctx.drizzle, ctx.userId, partyId);
          return result;
        }
        const personal =
          user.questData?.find((tracker) => tracker.id === definition.id) ??
          QuestTracker.parse({ id: definition.id });
        const tracker = {
          ...personal,
          party: undefined,
          goals: personal.goals.map((goal) => ({ ...goal, collected: false })),
        };
        await ctx.drizzle.insert(questParty).values({
          id: partyId,
          questId: definition.id,
          leaderId: ctx.userId,
          isPublic: input.isPublic,
          memberIds: [ctx.userId],
          invitedUserIds: [],
          tracker,
          contributions: {},
        });
        await Promise.all([
          saveQuestPartyMember(
            ctx.drizzle,
            { id: partyId, questId: definition.id, tracker },
            ctx.userId,
          ),
          joinCoopChat(
            ctx.drizzle,
            partyId,
            `${definition.name} Quest Team`,
            ctx.userId,
          ),
        ]);
        return { success: true, message: "Quest team formed" };
      } catch (error) {
        await releaseTeamSlot(ctx.drizzle, ctx.userId, partyId);
        await ctx.drizzle.delete(questParty).where(eq(questParty.id, partyId));
        throw error;
      }
    }),
  join: protectedProcedure
    .input(questPartyIdSchema)
    .mutation(async ({ ctx, input }) => {
      const [{ user }, loaded] = await Promise.all([
        fetchUpdatedUser({ client: ctx.drizzle, userId: ctx.userId }),
        ctx.drizzle.query.questParty.findFirst({
          where: eq(questParty.id, input.partyId),
          with: questPartyRelations,
        }),
      ]);
      if (!user || !loaded) return errorResponse("Quest team not found");
      const block = teamQuestBlock(user, loaded.quest);
      if (block) return errorResponse(block);
      const party = await synchronizeQuestParty(ctx.drizzle, loaded);
      if (party.tracker.failed || isQuestComplete(party.quest, party.tracker))
        return errorResponse(
          "This team has finished its quest. Form a new team to play again",
        );
      const transition = transitionCoopParty(
        "quest",
        questCoopParty(party),
        ctx.userId,
        "join",
      );
      if (!transition.success) return errorResponse(transition.message);
      const joinClaimId = `claiming:${Date.now()}:${nanoid()}`;
      const [history, reserved] = await Promise.all([
        fetchUserQuestByQuestId(ctx.drizzle, ctx.userId, party.questId),
        claimUserSnapshot({
          client: ctx.drizzle,
          userId: ctx.userId,
          updatedAt: user.updatedAt,
          set: { questPartyId: party.id },
          where: [isNull(userData.questPartyId), eq(userData.status, "AWAKE")],
        }),
      ]);
      if (!reserved.success)
        return errorResponse("You already have a quest team or your status changed");
      user.questPartyId = party.id;
      user.updatedAt = reserved.claimedAt;
      // One roster CAS enforces capacity and prevents joins while an encounter is starting.
      const joined = await ctx.drizzle
        .update(questParty)
        .set({
          memberIds: transition.party.memberIds,
          invitedUserIds: transition.party.invitedIds,
          battleId: joinClaimId,
          version: party.version + 1,
        })
        .where(
          and(
            eq(questParty.id, party.id),
            eq(questParty.version, party.version),
            isNull(questParty.battleId),
            sql`JSON_LENGTH(${questParty.memberIds}) < ${QUEST_PARTY_MAX_MEMBERS}`,
          ),
        );
      if (joined.rowsAffected !== 1) {
        await releaseTeamSlot(ctx.drizzle, ctx.userId, party.id);
        return errorResponse(
          "The team changed or is full. Please refresh and try again",
        );
      }
      try {
        const result = await acceptTeamQuest(ctx.drizzle, user, party.quest, history);
        if (!result.success) {
          await removeMember(ctx.drizzle, party.id, ctx.userId, joinClaimId);
          return result;
        }
        await Promise.all([
          saveQuestPartyMember(ctx.drizzle, party, ctx.userId),
          joinCoopChat(
            ctx.drizzle,
            party.id,
            `${party.quest.name} Quest Team`,
            ctx.userId,
          ),
        ]);
        await ctx.drizzle
          .update(questParty)
          .set({ battleId: null, version: sql`${questParty.version} + 1` })
          .where(
            and(eq(questParty.id, party.id), eq(questParty.battleId, joinClaimId)),
          );
        return {
          success: true,
          message: "Joined quest team. All objectives are shared",
        };
      } catch (error) {
        await removeMember(ctx.drizzle, party.id, ctx.userId, joinClaimId);
        throw error;
      }
    }),
  invite: protectedProcedure
    .input(questPartyInviteSchema)
    .mutation(async ({ ctx, input }) => {
      const [party, invited, inviter] = await Promise.all([
        ctx.drizzle.query.questParty.findFirst({
          where: eq(questParty.id, input.partyId),
        }),
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.username, input.username),
          columns: { userId: true, isBanned: true, isAi: true },
        }),
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
          columns: { isBanned: true, questPartyId: true },
        }),
      ]);
      if (
        !party ||
        party.leaderId !== ctx.userId ||
        inviter?.questPartyId !== party.id ||
        inviter.isBanned
      )
        return errorResponse("Only the team leader can invite players");
      if (!invited || invited.isBanned || invited.isAi)
        return errorResponse("Player not available");
      const transition = transitionCoopParty(
        "quest",
        questCoopParty(party),
        ctx.userId,
        "invite",
        invited.userId,
      );
      if (!transition.success) return errorResponse(transition.message);
      const saved = await ctx.drizzle
        .update(questParty)
        .set({
          invitedUserIds: transition.party.invitedIds,
          version: party.version + 1,
        })
        .where(and(eq(questParty.id, party.id), eq(questParty.version, party.version)));
      return saved.rowsAffected === 1
        ? {
            success: true,
            message: "Invitation sent. The player can accept on the Quest Teams page",
          }
        : errorResponse("Team changed. Please try again");
    }),
  leave: protectedProcedure
    .input(questPartyIdSchema)
    .mutation(async ({ ctx, input }) => {
      const loaded = await ctx.drizzle.query.questParty.findFirst({
        where: eq(questParty.id, input.partyId),
        with: questPartyRelations,
      });
      if (!loaded) return errorResponse("You are not in this team");
      if (!loaded.memberIds.includes(ctx.userId)) {
        const member = loaded.members.find((entry) => entry.userId === ctx.userId);
        const isEmptyLeader =
          !loaded.memberIds.length && loaded.leaderId === ctx.userId;
        // The last leader can finish empty-team cleanup after personal detachment.
        // Otherwise a saved tracker proves membership; an unsaved join keeps its grace period.
        if (
          !isEmptyLeader &&
          (!member ||
            (!member.questData?.some((entry) => entry.party?.id === loaded.id) &&
              secondsPassed(member.updatedAt) <= 60))
        )
          return errorResponse("You are not in this team");
        if (isEmptyLeader && loaded.quest)
          await synchronizeQuestParty(ctx.drizzle, loaded);
        return removeMember(ctx.drizzle, input.partyId, ctx.userId);
      }
      const party = loaded.quest
        ? await synchronizeQuestParty(ctx.drizzle, loaded)
        : loaded;
      if (party.battleId)
        return errorResponse("Finish the team's encounter before leaving");
      return removeMember(ctx.drizzle, input.partyId, ctx.userId);
    }),
});

const teamQuestBlock = (
  user: NonNullable<UserWithRelations>,
  definition: Quest | undefined,
) => {
  if (user.isBanned || user.isAi) return "You cannot join quest teams";
  if (user.status !== "AWAKE") return "You must be awake to join a quest team";
  if (
    !definition?.teamEnabled ||
    !QUEST_PARTY_TYPES.some((type) => type === definition.questType)
  )
    return "Content staff have not enabled teams for this quest";
  return null;
};

/**
 * Accept a quest after the caller reserves membership: reuse an active attempt,
 * consume an attempt for a closed completed helper without reopening its reward receipt,
 * or assign a new attempt through the existing UI eligibility guards.
 */
const acceptTeamQuest = async (
  client: DrizzleClient,
  user: NonNullable<UserWithRelations>,
  definition: Quest,
  history: Awaited<ReturnType<typeof fetchUserQuestByQuestId>>,
) => {
  if (user.userQuests.some((entry) => entry.questId === definition.id && !entry.endAt))
    return { success: true, message: "Using your active quest attempt" };
  const sectorVillage = await fetchSectorVillage(client, user.sector);
  if (history && ((history.previousCompletes ?? 0) > 0 || history.completed)) {
    // Helpers still meet rank, prerequisites, dates, location and concurrent quest limits.
    // Their existing completion receipt stays closed, preventing any additional reward payout.
    const availability = isAvailableUserQuests(
      { ...definition, completed: 0, previousAttempts: 0, previousCompletes: 0 },
      user,
    );
    const guard =
      questUiAccessBlockMessage(definition, user, sectorVillage) ??
      questTypeConcurrentBlockMessage(definition, user);
    if (!availability.check || guard || !isQuestRankAllowed(definition, user))
      return errorResponse(guard ?? availability.message ?? "Rank not allowed");
    if (history?.pendingRewardChoice)
      return errorResponse("Claim your pending quest reward choice first");
    await Promise.all([
      client
        .update(questHistory)
        .set({ previousAttempts: sql`${questHistory.previousAttempts} + 1` })
        .where(eq(questHistory.id, history.id)),
      incrementDailyQuestCounter(client, user, definition.questType),
    ]);
    user.userQuests.push({
      id: `party-${user.questPartyId}`,
      userId: user.userId,
      questId: definition.id,
      questType: definition.questType,
      startedAt: new Date(),
      endAt: null,
      completed: 0,
      previousAttempts: 0,
      previousCompletes: 0,
      quest: structuredClone(definition),
    });
    user.questData = getNewTrackers(user, [{ task: "any" }]).trackers;
    return {
      success: true,
      message: "Joining as a helper; this completed quest pays no rewards",
    };
  }
  return assignQuestToUser({
    client,
    user,
    quest: definition,
    source: "ui",
    sectorVillage,
    prevAttempt: history,
  });
};

const releaseTeamSlot = (client: DrizzleClient, userId: string, partyId: string) =>
  client
    .update(userData)
    .set({
      questPartyId: null,
      updatedAt: sql`GREATEST(NOW(3), DATE_ADD(${userData.updatedAt}, INTERVAL 1000 MICROSECOND))`,
    })
    .where(and(eq(userData.userId, userId), eq(userData.questPartyId, partyId)));

const removeMember = async (
  client: DrizzleClient,
  partyId: string,
  userId: string,
  joinClaimId?: string,
) => {
  // The roster and leader move in one CAS; no missing-row locks or transactions.
  for (let attempt = 0; attempt < 5; attempt++) {
    const [party, member] = await Promise.all([
      client.query.questParty.findFirst({
        where: eq(questParty.id, partyId),
        with: { quest: true },
      }),
      client.query.userData.findFirst({
        where: eq(userData.userId, userId),
        columns: { questPartyId: true, status: true },
      }),
    ]);
    if (!party) return { success: true, message: "Already left quest team" };
    if (member?.questPartyId === party.id && member.status === "BATTLE")
      return errorResponse("Finish your battle before leaving the quest team");
    if (!party.memberIds.includes(userId)) {
      // The roster CAS may have committed before the personal save failed.
      if (!(await saveQuestPartyMember(client, party, userId, true)))
        return errorResponse("Finish your battle before leaving the quest team");
      await leaveCoopChat(client, partyId, userId);
      if (!party.memberIds.length) {
        const deleted = await client
          .delete(questParty)
          .where(
            and(
              eq(questParty.id, partyId),
              eq(questParty.version, party.version),
              isNull(questParty.battleId),
            ),
          );
        if (deleted.rowsAffected !== 1) continue;
      }
      return { success: true, message: "Already left quest team" };
    }
    if (party.battleId && party.battleId !== joinClaimId)
      return errorResponse("Finish the team's encounter before leaving");
    const battleGuard = joinClaimId
      ? eq(questParty.battleId, joinClaimId)
      : isNull(questParty.battleId);
    const transition = transitionCoopParty(
      "quest",
      questCoopParty({ ...party, battleId: null }),
      userId,
      "leave",
    );
    if (!transition.success) return errorResponse(transition.message);
    const members = transition.party.memberIds;
    const departureClaimId = members.length
      ? null
      : `claiming:${Date.now()}:${nanoid()}`;
    // Retain the last roster and canonical progress while its personal save commits.
    const saved = await client
      .update(questParty)
      .set({
        memberIds: members.length ? members : party.memberIds,
        battleId: departureClaimId,
        leaderId: transition.party.leaderId,
        invitedUserIds: transition.party.invitedIds,
        version: party.version + 1,
      })
      .where(
        and(
          eq(questParty.id, partyId),
          eq(questParty.version, party.version),
          battleGuard,
        ),
      );
    if (saved.rowsAffected !== 1) continue;
    try {
      const detached = await saveQuestPartyMember(client, party, userId, true);
      if (!detached) {
        if (departureClaimId)
          await client
            .update(questParty)
            .set({ battleId: null, version: sql`${questParty.version} + 1` })
            .where(
              and(
                eq(questParty.id, partyId),
                eq(questParty.battleId, departureClaimId),
              ),
            );
        return errorResponse("Finish your battle before leaving the quest team");
      }
      await leaveCoopChat(client, partyId, userId);
      if (departureClaimId)
        await client
          .delete(questParty)
          .where(
            and(eq(questParty.id, partyId), eq(questParty.battleId, departureClaimId)),
          );
    } catch (error) {
      if (departureClaimId)
        await client
          .update(questParty)
          .set({ battleId: null, version: sql`${questParty.version} + 1` })
          .where(
            and(eq(questParty.id, partyId), eq(questParty.battleId, departureClaimId)),
          );
      throw error;
    }
    return {
      success: true,
      message: "Left quest team. Remaining members keep the shared progress",
    };
  }
  return errorResponse("Team changed. Please try again");
};

/**
 * Start the shared encounter from the lobby, a bound NPC interaction or an authored ambush.
 * Server callers supply trusted selectors; the leader and awake, co-located roster are
 * validated before a versioned claim. Initiation preloads team quest state into combat,
 * and a failed initiation releases only this invocation's claim.
 */
export const startQuestPartyEncounter = async ({
  client,
  user,
  userId,
  partyId,
  objectiveId,
  atPlacementIds,
  ambush,
}: {
  client: DrizzleClient;
  user: UserWithRelations;
  userId: string;
  partyId: string;
  /** Objective selected by an authoritative server interaction, never client input. */
  objectiveId?: string;
  /** Placements verified by the server interaction as satisfying the objective location. */
  atPlacementIds?: ReadonlySet<string>;
  /** Authored quest attackers rolled by the server's travel consequence handler. */
  ambush?: QuestConsequence;
}) => {
  const party = user?.questParty;
  if (!user || !party || party.id !== partyId || party.leaderId !== userId)
    return errorResponse("Only the team leader can start encounters");
  if (user.isBanned || !party.quest.teamEnabled || party.tracker.failed)
    return errorResponse("This team cannot start encounters");
  if (party.battleId)
    return errorResponse("The team's encounter is already starting or in progress");
  const objectiveIds = new Set(party.quest.content.objectives.map((entry) => entry.id));
  const activeObjectives = ambush
    ? []
    : getActiveObjectives(user).filter(
        (entry) =>
          objectiveIds.has(entry.id) &&
          (!objectiveId || entry.id === objectiveId) &&
          (entry.task === "start_battle" || entry.task === "defeat_opponents"),
      );
  const activeObjective = activeObjectives.find(
    (entry) =>
      entry.task === "start_battle" ||
      isObjectiveLocationSatisfied(user, entry, atPlacementIds),
  );
  const objective =
    activeObjective && "opponentAIs" in activeObjective ? activeObjective : undefined;
  if (!ambush && !objective)
    return errorResponse(
      activeObjectives.length > 0
        ? "Travel to the objective location before starting the encounter"
        : "There is no active combat objective",
    );
  if (
    party.members.length !== party.memberIds.length ||
    party.members.some(
      (member) =>
        member.status !== "AWAKE" ||
        member.sector !== user.sector ||
        member.longitude !== user.longitude ||
        member.latitude !== user.latitude,
    )
  )
    return errorResponse("All team members must be awake and on the leader's tile");
  const transition = transitionCoopParty(
    "quest",
    questCoopParty(party),
    userId,
    "start",
  );
  if (!transition.success) return errorResponse(transition.message);
  return launchCoopEncounter({
    reserve: async ({ claimId }) => {
      const claim = await client
        .update(questParty)
        .set({ battleId: claimId, version: party.version + 1 })
        .where(
          and(
            eq(questParty.id, party.id),
            eq(questParty.version, party.version),
            isNull(questParty.battleId),
          ),
        );
      return claim.rowsAffected === 1;
    },
    initiate: ({ battleId }) =>
      initiateBattle(
        {
          client: client,
          userIds: party.memberIds,
          targetIds:
            ambush?.ids ??
            objective?.opponentAIs.flatMap(
              (opponent) =>
                Array(opponent.number).fill(opponent.ids).flat() as string[],
            ) ??
            [],
          allyAiIds:
            objective && "allyAIs" in objective
              ? objective.allyAIs.flatMap(
                  (ally) => Array(ally.number).fill(ally.ids).flat() as string[],
                )
              : [],
          sector: user.sector,
          longitude: user.longitude,
          latitude: user.latitude,
          scaleTarget: ambush?.scaleStats ?? objective?.opponent_scaled_to_user,
          forceKeepPools:
            ambush?.forceKeepPools ?? objective?.keepOriginalPools ?? false,
          autoCombatUserIds: party.members
            .filter((member) => member.defaultAutoCombat)
            .map((member) => member.userId),
          coop: {
            kind: "quest",
            battleId,
            id: party.id,
            quest: party.quest,
            tracker: party.tracker,
          },
        },
        ambush ? "RANDOM_ENCOUNTER" : "QUEST",
        ambush?.scaleGains ?? objective?.scaleGains ?? 1,
      ),
    publish: async ({ claimId }, result) => {
      await client
        .update(questParty)
        .set({
          battleId: result.battleId ?? null,
          version: sql`${questParty.version} + 1`,
        })
        .where(and(eq(questParty.id, party.id), eq(questParty.battleId, claimId)));
    },
    recover: async ({ claimId, battleId }) => {
      await cleanupCoopBattleStart(client, battleId, party.memberIds);
      await client
        .update(questParty)
        .set({ battleId: null, version: sql`${questParty.version} + 1` })
        .where(
          and(
            eq(questParty.id, party.id),
            or(eq(questParty.battleId, claimId), eq(questParty.battleId, battleId)),
          ),
        );
    },
  });
};
