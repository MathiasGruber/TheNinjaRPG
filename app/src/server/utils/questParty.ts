import { and, eq, ne } from "drizzle-orm";
import type { Quest, QuestParty, UserData } from "@/drizzle/schema";
import { questParty, userData } from "@/drizzle/schema";
import { mergePartyProgress, projectPartyTracker } from "@/libs/questParty";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { DrizzleClient } from "@/server/db";
import { claimUserSnapshot } from "@/server/utils/concurrency";
import type { QuestTrackerType } from "@/validators/objectives";

/** Canonical progress plus the member snapshots needed for synchronization and encounter guards. */
export type LoadedQuestParty = QuestParty & {
  quest: Quest;
  members: Pick<
    UserData,
    | "userId"
    | "username"
    | "questData"
    | "updatedAt"
    | "status"
    | "sector"
    | "longitude"
    | "latitude"
    | "defaultAutoCombat"
    | "battleId"
  >[];
};

/** Preload synchronization inputs with the character query, avoiding per-member round trips. */
export const questPartyRelations = {
  quest: true,
  members: {
    columns: {
      userId: true,
      username: true,
      questData: true,
      updatedAt: true,
      status: true,
      sector: true,
      longitude: true,
      latitude: true,
      defaultAutoCombat: true,
      battleId: true,
    },
  },
} as const;

/**
 * Merge preloaded contributions through party CAS, rereading only after contention.
 * A committed member may have departed since preload; include that accepted progress once
 * without restoring their membership. Return the synchronized party with its live roster.
 */
export const synchronizeQuestParty = async (
  client: DrizzleClient,
  loaded: LoadedQuestParty,
  committedMember?: LoadedQuestParty["members"][number],
): Promise<LoadedQuestParty> => {
  let party = loaded;
  for (let attempt = 0; attempt < 5; attempt++) {
    const liveMembers = party.members.filter((member) =>
      party.memberIds.includes(member.userId),
    );
    const members = committedMember
      ? [
          ...liveMembers.filter((member) => member.userId !== committedMember.userId),
          committedMember,
        ]
      : liveMembers;
    const memberIds = party.memberIds.filter((id) =>
      liveMembers.some((member) => member.userId === id),
    );
    const leaderId = memberIds.includes(party.leaderId)
      ? party.leaderId
      : (memberIds[0] ?? party.leaderId);
    const next = mergePartyProgress(party, members, party.quest);
    const isFreshClaim =
      party.battleId?.startsWith("claiming:") &&
      Number(party.battleId.split(":")[1]) > Date.now() - 60_000;
    // A failed publication retains the encoded reservation. The preloaded members prove
    // whether that exact battle committed, without another database fetch.
    const reservedBattleId = party.battleId?.startsWith("claiming:")
      ? party.battleId.split(":")[2]
      : undefined;
    const boundBattleId =
      reservedBattleId &&
      party.members.some((member) => member.battleId === reservedBattleId)
        ? reservedBattleId
        : undefined;
    const battleId =
      boundBattleId ??
      (party.battleId &&
      !isFreshClaim &&
      !party.members.some(
        (member) => member.battleId === (reservedBattleId ?? party.battleId),
      )
        ? null
        : party.battleId);
    if (
      memberIds.length === party.memberIds.length &&
      battleId === party.battleId &&
      JSON.stringify(next.tracker) === JSON.stringify(party.tracker) &&
      JSON.stringify(next.contributions) === JSON.stringify(party.contributions)
    )
      return { ...party, members: liveMembers };
    const saved = await client
      .update(questParty)
      .set({ ...next, battleId, memberIds, leaderId, version: party.version + 1 })
      .where(and(eq(questParty.id, party.id), eq(questParty.version, party.version)));
    if (saved.rowsAffected === 1)
      return {
        ...party,
        ...next,
        battleId,
        memberIds,
        leaderId,
        members: liveMembers,
        version: party.version + 1,
      };
    const fresh = await client.query.questParty.findFirst({
      where: eq(questParty.id, party.id),
      with: questPartyRelations,
    });
    if (!fresh) return party;
    party = fresh;
  }
  throw new Error("Quest team changed repeatedly; please try again");
};

/** Publish the guarded member snapshot; retained contributions allow a later sync to retry. */
export const publishQuestPartyProgress = async (
  client: DrizzleClient,
  user: NonNullable<UserWithRelations>,
  trackers: QuestTrackerType[],
) => {
  if (!user.questParty) return;
  const members = user.questParty.members.map((member) =>
    member.userId === user.userId ? { ...member, questData: trackers } : member,
  );
  user.questParty = await synchronizeQuestParty(
    client,
    {
      ...user.questParty,
      members,
    },
    members.find((member) => member.userId === user.userId),
  );
};

/**
 * Publish the caller's post-reset personal tracker with a new shared generation via CAS.
 * Clear acknowledged contributions and mark removed goals so unrelated receipts survive.
 * Adopt a concurrently advanced generation instead of applying the same reset twice.
 */
export const resetQuestPartyProgress = async (
  client: DrizzleClient,
  user: NonNullable<UserWithRelations>,
) => {
  const party = user.questParty;
  if (!party) return;
  const personal = user.questData?.find((entry) => entry.id === party.questId);
  const tracker: QuestTrackerType = {
    ...(personal ?? {
      id: party.questId,
      startAt: new Date().toISOString(),
      goals: [],
    }),
    generation: (party.tracker.generation ?? 0) + 1,
    resetGenerations: {
      ...party.tracker.resetGenerations,
      ...Object.fromEntries(
        party.quest.content.objectives
          .filter(
            (objective) => !personal?.goals.some((goal) => goal.id === objective.id),
          )
          .map((objective) => [objective.id, (party.tracker.generation ?? 0) + 1]),
      ),
    },
    party: undefined,
  };
  let current = party;
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((current.tracker.generation ?? 0) !== (party.tracker.generation ?? 0)) {
      user.questParty = current;
      return;
    }
    const saved = await client
      .update(questParty)
      .set({ tracker, contributions: {}, version: current.version + 1 })
      .where(and(eq(questParty.id, party.id), eq(questParty.version, current.version)));
    if (saved.rowsAffected === 1) {
      user.questParty = {
        ...current,
        tracker,
        contributions: {},
        version: current.version + 1,
      };
      return;
    }
    const fresh = await client.query.questParty.findFirst({
      where: eq(questParty.id, party.id),
      with: questPartyRelations,
    });
    if (!fresh) return;
    current = fresh;
  }
  throw new Error("Quest team reset changed repeatedly; please try again");
};

/**
 * Project shared progress onto the hydrated user in memory, retaining personal receipts.
 * Closed lifetime-completed helpers receive a synthetic zero-reward active quest;
 * their persisted history is never reopened by this projection.
 */
export const applyQuestParty = (
  user: NonNullable<UserWithRelations>,
  party: LoadedQuestParty,
) => {
  if (!party.quest || !party.memberIds.includes(user.userId)) return;
  const personal = user.questData?.find((entry) => entry.id === party.questId);
  const completed = user.completedQuests.some(
    (entry) => entry.questId === party.questId,
  );
  if (
    !user.userQuests.some((entry) => entry.questId === party.questId) &&
    completed &&
    !party.tracker.failed
  ) {
    // A completed helper has a temporary active projection, never a reopened reward receipt.
    user.userQuests.push({
      id: `party-${party.id}`,
      userId: user.userId,
      questId: party.questId,
      questType: party.quest.questType,
      startedAt: party.createdAt,
      endAt: null,
      completed: 0,
      previousAttempts: 0,
      previousCompletes: 0,
      quest: structuredClone(party.quest),
    });
  }
  if (user.userQuests.some((entry) => entry.questId === party.questId))
    user.questData = [
      ...(user.questData ?? []).filter((entry) => entry.id !== party.questId),
      projectPartyTracker(party, personal),
    ];
};

/**
 * Save canonical progress and personal receipts through the character snapshot guard.
 * Detachment releases membership in the same write; false defers it until combat settles.
 * Already-detached or missing members are successful no-ops, making cleanup retryable.
 */
export const saveQuestPartyMember = async (
  client: DrizzleClient,
  party: Pick<QuestParty, "id" | "questId" | "tracker"> &
    Partial<Pick<QuestParty, "contributions">> & { quest?: Quest | null },
  userId: string,
  detach = false,
) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const member = await client.query.userData.findFirst({
      where: eq(userData.userId, userId),
      columns: { questData: true, questPartyId: true, updatedAt: true, status: true },
    });
    if (!member || member.questPartyId !== party.id) return true;
    // Settlement would replace a detached tracker with the battle's older party copy.
    if (detach && member.status === "BATTLE") return false;
    // Keep a contribution accepted after the roster/disband claim in this player's
    // solo continuation, even if its publication has not reached the party snapshot.
    const progress =
      detach && party.quest && party.contributions
        ? {
            ...party,
            ...mergePartyProgress(
              party as QuestParty,
              [{ userId, questData: member.questData }],
              party.quest,
            ),
          }
        : party;
    const tracker = projectPartyTracker(
      progress,
      member.questData?.find((entry) => entry.id === party.questId),
    );
    if (detach) delete tracker.party;
    const saved = await claimUserSnapshot({
      client,
      userId,
      updatedAt: member.updatedAt,
      where: [
        eq(userData.questPartyId, party.id),
        ...(detach ? [ne(userData.status, "BATTLE")] : []),
      ],
      set: {
        questData: [
          ...(member.questData ?? []).filter((entry) => entry.id !== party.questId),
          tracker,
        ],
        ...(detach ? { questPartyId: null } : {}),
      },
    });
    if (saved.success) return true;
  }
  throw new Error("Character changed repeatedly; please try again");
};
