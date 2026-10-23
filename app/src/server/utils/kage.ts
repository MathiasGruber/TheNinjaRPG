import { and, asc, desc, eq, exists, gte, inArray, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  ACTION_LOG_RELATED_MSG_MAX_LENGTH,
  KAGE_CHALLENGER_DAILY_LIMIT,
  KAGE_CHALLENGER_WEEKLY_LIMIT,
  KAGE_DEFENSE_CHECK_IN_MINUTES,
  KAGE_DEFENSE_GRACE_MINUTES,
  KAGE_DEFENSE_MAX_NO_SHOWS,
  KAGE_DEFENSE_NOTICE_HOURS,
  KAGE_DEFENSE_PUBLIC_SYNC_SECONDS,
  KAGE_DEFENSE_SETUP_HOURS,
  KAGE_DEFENSE_SLOT_MINUTES,
  TERR_BOT_ID,
} from "@/drizzle/constants";
import {
  actionLog,
  battle,
  type KageDefendedChallenge,
  kageDefendedChallenges,
  notification,
  userData,
  village,
  war,
} from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { queryInTransaction } from "@/server/utils/concurrency";
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { getKageEligibility, getKageSlots } from "@/utils/kage";
import { periodStart, secondsFromDate } from "@/utils/time";
import type { KageDefenseSchedule } from "@/validators/kage";

/** States that retain a challenger's unique active entry and FIFO queue position. */
export const activeKageMatchStatuses = [
  "QUEUED",
  "SCHEDULED",
  "STARTING",
  "BATTLE",
] as const;

/**
 * Serialize changes to a village's schedule, queue and leadership using its existing row.
 * A single guarded update cannot calculate FIFO assignments and commit their queue rows
 * with attendance strikes or a new tenure. Callbacks must use the supplied client;
 * combat preload stays outside this transaction and revalidates at its atomic launch.
 * Returns null when the village does not support title defenses.
 */
export const withKageDefense = async <T>(
  client: DrizzleClient,
  villageId: string,
  callback: (tx: DrizzleClient, hall: KageDefenseHall) => Promise<T>,
) =>
  retryOnDeadlock(() =>
    client.transaction(async (transaction) => {
      const tx = transaction as unknown as DrizzleClient;
      await tx
        .update(village)
        .set({ kageScheduleVersion: sql`${village.kageScheduleVersion} + 1` })
        .where(eq(village.id, villageId));
      const hall = await loadKageDefense(tx, villageId);
      if (hall?.village.type !== "VILLAGE") return null;
      return callback(tx, hall);
    }),
  );

/** Load a tenure-consistent working snapshot after acquiring the village row lock. */
const loadKageDefense = async (client: DrizzleClient, villageId: string) => {
  const now = new Date();
  const [v, rows, wars] = await queryInTransaction([
    client.query.village.findFirst({
      where: eq(village.id, villageId),
      with: { kage: true },
    }),
    client
      .select({
        match: kageDefendedChallenges,
        user: userData,
        liveBattleId: battle.id,
      })
      .from(kageDefendedChallenges)
      .innerJoin(userData, eq(kageDefendedChallenges.userId, userData.userId))
      .leftJoin(battle, eq(kageDefendedChallenges.battleId, battle.id))
      .where(
        and(
          eq(kageDefendedChallenges.villageId, villageId),
          inArray(kageDefendedChallenges.status, activeKageMatchStatuses),
        ),
      )
      .orderBy(asc(kageDefendedChallenges.createdAt), asc(kageDefendedChallenges.id)),
    client.query.war.findMany({
      columns: { id: true, status: true, startedAt: true, endedAt: true },
      where: and(
        eq(war.type, "VILLAGE_WAR"),
        or(eq(war.attackerVillageId, villageId), eq(war.defenderVillageId, villageId)),
      ),
    }),
  ]);
  if (!v) return null;
  const sameTenure =
    v.kageSchedule?.kageId === v.kageId &&
    v.kageSchedule?.tenure === v.leaderUpdatedAt.toISOString();
  const state: KageDefenseSchedule =
    sameTenure && v.kageSchedule
      ? { ...v.kageSchedule }
      : {
          kageId: v.kageId,
          tenure: v.leaderUpdatedAt.toISOString(),
          windows: [],
          publishedAt: null,
          missedStarts: 0,
          paused: false,
          observedAt: new Date(
            Math.max(v.leaderUpdatedAt.getTime(), v.kageScheduleAvailableAt.getTime()),
          ).toISOString(),
        };
  // An NPC incumbent cannot publish a schedule. Public daily windows let villagers contest it.
  if (v.kage?.isAi && !state.publishedAt) {
    state.windows = Array.from({ length: 7 }, (_, day) => ({ day, hour: 12 }));
    state.publishedAt = now.toISOString();
  }
  const paused = wars.some((w) => w.status === "ACTIVE");
  // An idle observation can race a war's commit; either boundary reveals a missed pause.
  const observedAt = new Date(state.observedAt);
  const warInterrupted = wars.some(
    (w) => w.startedAt > observedAt || (w.endedAt && w.endedAt > observedAt),
  );
  const lastWarEndedAt = wars.reduce<Date | null>(
    (latest, w) => (w.endedAt && (!latest || w.endedAt > latest) ? w.endedAt : latest),
    null,
  );
  return {
    village: v,
    rows,
    state,
    now,
    paused,
    warInterrupted,
    lastWarEndedAt,
    resetAssignments: !sameTenure || paused || state.paused || warInterrupted,
  };
};
/** Mutable snapshot shared by reconciliation and assignments within one village transaction. */
export type KageDefenseHall = NonNullable<Awaited<ReturnType<typeof loadKageDefense>>>;

/** Persist schedule JSON only for the tenure loaded under the village lock. */
export const saveKageSchedule = (client: DrizzleClient, hall: KageDefenseHall) =>
  client
    .update(village)
    .set({ kageSchedule: hall.state })
    .where(
      and(
        eq(village.id, hall.village.id),
        eq(village.kageId, hall.village.kageId),
        eq(village.leaderUpdatedAt, hall.village.leaderUpdatedAt),
      ),
    );

/** Reconcile deadlines and assign waiting matches in one village transaction. */
export const syncKageDefense = (client: DrizzleClient, villageId: string) =>
  withKageDefense(client, villageId, syncLockedKageDefense);

/**
 * Recover interruptions, settle attendance and assign the queue under an existing lock.
 * Updates the working snapshot alongside writes; false means leadership changed and
 * callers must stop using the old tenure. Never call with an autocommit client.
 */
export const syncLockedKageDefense = async (
  client: DrizzleClient,
  hall: KageDefenseHall,
) => {
  const { now, state, village: v } = hall;
  const priorObservation = new Date(state.observedAt);
  const initialSetupDeadline = secondsFromDate(
    KAGE_DEFENSE_SETUP_HOURS * 3600,
    new Date(
      Math.max(v.leaderUpdatedAt.getTime(), v.kageScheduleAvailableAt.getTime()),
    ),
  );
  state.setupDueAt ??= initialSetupDeadline.toISOString();
  const missedObservation =
    now.getTime() - priorObservation.getTime() > KAGE_DEFENSE_GRACE_MINUTES * 60_000;
  // The publication deadline freezes while war or service interruptions prevent participation.
  if (
    !state.publishedAt &&
    (hall.paused || state.paused || hall.warInterrupted || missedObservation)
  ) {
    state.setupDueAt = new Date(
      new Date(state.setupDueAt).getTime() +
        Math.max(0, now.getTime() - priorObservation.getTime()),
    ).toISOString();
  }
  // A war consumes the incumbent's attention, so a full setup window follows its end.
  if (!state.publishedAt && hall.lastWarEndedAt) {
    const postWarDeadline = secondsFromDate(
      KAGE_DEFENSE_SETUP_HOURS * 3600,
      hall.lastWarEndedAt,
    );
    if (postWarDeadline > new Date(state.setupDueAt))
      state.setupDueAt = postWarDeadline.toISOString();
  }
  if (
    v.kage &&
    !v.kage.isAi &&
    !state.publishedAt &&
    now >= new Date(state.setupDueAt) &&
    !hall.paused
  ) {
    await removeAbsentKage(client, hall);
    return false;
  }
  for (const row of hall.rows) {
    const m = row.match;
    if (m.status === "BATTLE" || m.status === "STARTING") {
      // Terminal combat deletes its battle and records completion atomically; a missing
      // battle with an active receipt therefore represents an interrupted launch/result.
      if (!row.liveBattleId) {
        const resolved = await client
          .update(kageDefendedChallenges)
          .set({
            status: "CANCELLED",
            resolvedAt: now,
            // Neutral system recovery releases the start-based daily and weekly allowance.
            startedAt: null,
            outcome: "Battle ended without a recorded result; no prestige charged",
          })
          .where(
            and(
              eq(kageDefendedChallenges.id, m.id),
              eq(kageDefendedChallenges.status, m.status),
            ),
          );
        if (resolved.rowsAffected) m.status = "CANCELLED";
      }
      continue;
    }
    if (getKageEligibility(row.user, v.id) || row.user.userId === v.kageId) {
      await client
        .update(kageDefendedChallenges)
        .set({
          status: "CANCELLED",
          resolvedAt: now,
          outcome: "Challenger no longer eligible",
        })
        .where(eq(kageDefendedChallenges.id, m.id));
      m.status = "CANCELLED";
      continue;
    }
    if (hall.resetAssignments) {
      await resetMatch(client, hall, m, "Schedule renewed; queue priority retained");
      continue;
    }
    if (m.status !== "SCHEDULED" || !m.scheduledAt) continue;
    if (
      (m.hospitalDeferred ||
        now.getTime() >=
          m.scheduledAt.getTime() - KAGE_DEFENSE_CHECK_IN_MINUTES * 60_000) &&
      (row.user.status === "HOSPITALIZED" || v.kage?.status === "HOSPITALIZED")
    ) {
      await client
        .update(kageDefendedChallenges)
        .set({ hospitalDeferred: true, checkedInAt: null })
        .where(eq(kageDefendedChallenges.id, m.id));
      m.hospitalDeferred = true;
      continue;
    }
    if (m.hospitalDeferred) {
      // Resume with a fresh check-in window and move overlapping followers without
      // changing FIFO priority or spending either participant's voluntary reschedule.
      m.scheduledAt = secondsFromDate(KAGE_DEFENSE_CHECK_IN_MINUTES * 60, now);
      m.hospitalDeferred = false;
      m.checkedInAt = null;
      const index = hall.rows.indexOf(row);
      const blockedUntil = secondsFromDate(
        KAGE_DEFENSE_SLOT_MINUTES * 60,
        m.scheduledAt,
      );
      for (const later of hall.rows.slice(index + 1)) {
        if (
          later.match.status === "SCHEDULED" &&
          later.match.scheduledAt &&
          later.match.scheduledAt < blockedUntil
        ) {
          await resetMatch(
            client,
            hall,
            later.match,
            "Match moved after a hospital deferral; priority retained",
          );
          later.match.notBefore = new Date(
            Math.max(later.match.notBefore.getTime(), blockedUntil.getTime()),
          );
          await client
            .update(kageDefendedChallenges)
            .set({ notBefore: later.match.notBefore })
            .where(eq(kageDefendedChallenges.id, later.match.id));
        }
      }

      await client
        .update(kageDefendedChallenges)
        .set({ scheduledAt: m.scheduledAt, hospitalDeferred: false, checkedInAt: null })
        .where(eq(kageDefendedChallenges.id, m.id));
    }
    if (now.getTime() <= m.scheduledAt.getTime() + KAGE_DEFENSE_GRACE_MINUTES * 60_000)
      continue;
    if (
      v.kage?.status === "BATTLE" &&
      hall.rows.some((r) => r.match.id !== m.id && r.match.status === "BATTLE")
    ) {
      await resetMatch(
        client,
        hall,
        m,
        "Another title defense is still in progress; queue priority retained",
      );
      continue;
    }
    // NPC defenses are challenger-started, so an unstarted NPC match never strikes the incumbent.
    if (
      missedObservation ||
      !m.checkedInAt ||
      row.user.status !== "AWAKE" ||
      v.kage?.isAi
    ) {
      if (missedObservation)
        await resetMatch(
          client,
          hall,
          m,
          "Attendance deadline reset after a service interruption",
        );
      else {
        m.status = "FORFEITED";
        await client
          .update(kageDefendedChallenges)
          .set({
            status: "FORFEITED",
            resolvedAt: now,
            outcome: "Challenger absent or unavailable; no prestige charged",
          })
          .where(eq(kageDefendedChallenges.id, m.id));
      }
    } else {
      state.missedStarts += 1;
      m.status = "FORFEITED";
      await client
        .update(kageDefendedChallenges)
        .set({
          status: "FORFEITED",
          resolvedAt: now,
          outcome: "Kage did not start the attended match; attendance strike recorded",
        })
        .where(eq(kageDefendedChallenges.id, m.id));
      if (state.missedStarts >= KAGE_DEFENSE_MAX_NO_SHOWS) {
        await removeAbsentKage(client, hall);
        return false;
      }
    }
  }
  state.paused = hall.paused;
  state.observedAt = now.toISOString();
  // Revoke an invitation when its appointment or mode changes. Expiry never changes
  // attendance, queue priority or the original match's reschedule allowance.
  const invitation = state.instantChallenge;
  if (
    invitation &&
    (hall.resetAssignments ||
      now >= new Date(invitation.expiresAt) ||
      !hall.rows.some(
        ({ match }) =>
          match.id === invitation.matchId &&
          match.status === "SCHEDULED" &&
          !match.hospitalDeferred &&
          match.scheduledAt?.toISOString() === invitation.scheduledAt &&
          (match.aiRequested && match.aiAccepted) === invitation.ai,
      ))
  )
    delete state.instantChallenge;
  if (!hall.paused && state.windows.length && v.kageId)
    await assignKageMatches(client, hall);
  await saveKageSchedule(client, hall);
  return true;
};

/** Requeue with fresh notice and consent while retaining FIFO priority and reschedule usage. */
const resetMatch = async (
  client: DrizzleClient,
  hall: KageDefenseHall,
  m: KageDefendedChallenge,
  outcome: string,
) => {
  const update = {
    status: "QUEUED" as const,
    scheduledAt: null,
    checkedInAt: null,
    hospitalDeferred: false,
    kageId: hall.village.kageId,
    tenure: hall.village.leaderUpdatedAt,
    aiAccepted: false,
    notBefore: secondsFromDate(KAGE_DEFENSE_NOTICE_HOURS * 3600, hall.now),
    outcome,
  };
  Object.assign(m, update);
  await client
    .update(kageDefendedChallenges)
    .set(update)
    .where(eq(kageDefendedChallenges.id, m.id));
};

/**
 * Assign published UTC slots in FIFO order under the village lock, preserving valid slots.
 * Started matches alone consume calendar limits; queue changes and schedule JSON commit together.
 */
export const assignKageMatches = async (
  client: DrizzleClient,
  hall: KageDefenseHall,
) => {
  const pending = hall.rows.filter(
    ({ match: m }) => m.status === "QUEUED" || m.status === "SCHEDULED",
  );
  if (!pending.length) return;
  let history: KageDefendedChallenge[] | undefined;
  const occupied = new Set(
    hall.rows
      .filter(
        ({ match: m }) =>
          m.scheduledAt && (m.status === "BATTLE" || m.status === "STARTING"),
      )
      .map(({ match: m }) => m.scheduledAt?.getTime()),
  );
  let after: Date | null = null;
  for (const { match: m } of pending) {
    if (m.status === "SCHEDULED" && m.scheduledAt) {
      if (!after || m.scheduledAt >= after) {
        after = secondsFromDate(KAGE_DEFENSE_SLOT_MINUTES * 60, m.scheduledAt);
        continue;
      }
      await resetMatch(
        client,
        hall,
        m,
        "Earlier queue entry was reassigned; priority retained",
      );
    }
    // Preserved appointments need no calendar-limit history; share one read for new slots.
    history ??= await client.query.kageDefendedChallenges.findMany({
      where: and(
        inArray(
          kageDefendedChallenges.userId,
          pending.map((r) => r.match.userId),
        ),
        gte(kageDefendedChallenges.startedAt, periodStart("weekly", hall.now)),
      ),
    });
    const challengerHistory = history.filter((h) => h.userId === m.userId);
    const slots = getKageSlots(
      hall.state.windows,
      new Date(
        Math.max(
          after?.getTime() ?? hall.now.getTime(),
          m.notBefore.getTime(),
          hall.now.getTime(),
        ),
      ),
      pending.length * 7 + 14,
    );
    const assigned = slots.find(
      (date) =>
        !occupied.has(date.getTime()) &&
        withinKageChallengeLimits(challengerHistory, date),
    );
    if (!assigned) continue;
    const update = {
      status: "SCHEDULED" as const,
      scheduledAt: assigned,
      kageId: hall.village.kageId,
      tenure: hall.village.leaderUpdatedAt,
    };
    Object.assign(m, update);
    occupied.add(assigned.getTime());
    after = secondsFromDate(KAGE_DEFENSE_SLOT_MINUTES * 60, assigned);
    await client
      .update(kageDefendedChallenges)
      .set(update)
      .where(eq(kageDefendedChallenges.id, m.id));
  }
};

/** Whether another start fits the UTC day and Monday-based week containing the proposed time. */
export const withinKageChallengeLimits = (
  matches: Pick<KageDefendedChallenge, "startedAt">[],
  now: Date,
) => {
  const day = periodStart("daily", now),
    week = periodStart("weekly", now);
  const countSince = (start: Date) =>
    matches.filter((m) => m.startedAt && m.startedAt >= start && m.startedAt <= now)
      .length;
  return (
    countSince(day) < KAGE_CHALLENGER_DAILY_LIMIT &&
    countSince(week) < KAGE_CHALLENGER_WEEKLY_LIMIT
  );
};

/**
 * Replace an absent incumbent with an eligible elder, or leave a public vacancy.
 * Rank, tenure, waiting assignments, the staff audit row and the announcement change
 * together in the caller's village transaction, so retries cannot duplicate them.
 */
const removeAbsentKage = async (client: DrizzleClient, hall: KageDefenseHall) => {
  const { now, village: v } = hall;
  const candidates = await client.query.userData.findMany({
    where: and(eq(userData.villageId, v.id), eq(userData.rank, "ELDER")),
    orderBy: [asc(userData.isAi), asc(userData.userId)],
  });
  const replacement = candidates.find(
    (u) => u.userId !== v.kageId && (u.isAi || !getKageEligibility(u, v.id)),
  );
  const removedUsername = v.kage?.username ?? v.kageId;
  const removal = {
    removedUserId: v.kageId,
    removedUsername,
    removedAt: now.toISOString(),
    reason: hall.state.publishedAt
      ? `Kage removed after ${KAGE_DEFENSE_MAX_NO_SHOWS} missed attended defenses`
      : `Kage removed for not publishing a defense schedule within ${KAGE_DEFENSE_SETUP_HOURS} hours`,
  };
  // An appointed elder starts a fresh tenure that still shows why the title changed hands.
  const nextSchedule: KageDefenseSchedule = {
    kageId: replacement?.userId ?? "",
    tenure: now.toISOString(),
    windows: [],
    publishedAt: null,
    missedStarts: 0,
    paused: false,
    observedAt: now.toISOString(),
    ...(replacement
      ? { predecessor: removal }
      : { vacancy: { removedUserId: removal.removedUserId, reason: removal.reason } }),
  };
  const succession = await client
    .update(village)
    .set({
      kageId: replacement?.userId ?? "",
      leaderUpdatedAt: now,
      kageSchedule: nextSchedule,
    })
    .where(
      and(
        eq(village.id, v.id),
        eq(village.kageId, v.kageId),
        eq(village.leaderUpdatedAt, v.leaderUpdatedAt),
      ),
    );
  if (!succession.rowsAffected) return;
  if (replacement?.rank === "ELDER" && !replacement.isAi)
    await client
      .update(userData)
      .set({ rank: "JONIN" })
      .where(eq(userData.userId, replacement.userId));
  await client
    .update(kageDefendedChallenges)
    .set({
      status: "QUEUED",
      scheduledAt: null,
      checkedInAt: null,
      aiAccepted: false,
      notBefore: secondsFromDate(KAGE_DEFENSE_NOTICE_HOURS * 3600, now),
      outcome: "Kage removed for attendance or missing schedule; priority retained",
    })
    .where(
      and(
        eq(kageDefendedChallenges.villageId, v.id),
        inArray(kageDefendedChallenges.status, ["QUEUED", "SCHEDULED"]),
      ),
    );
  const successor = replacement
    ? `${replacement.username} of the Elder Council is now Kage.`
    : "Elders may nominate an eligible successor at Town Hall.";
  await client.insert(actionLog).values({
    id: nanoid(),
    userId: v.kageId,
    tableName: "village",
    relatedId: v.id,
    relatedMsg: `${removedUsername} removed as Kage of ${v.name}`.slice(
      0,
      ACTION_LOG_RELATED_MSG_MAX_LENGTH,
    ),
    changes: [
      `Removed Kage: ${removedUsername} (${v.kageId})`,
      `Reason: ${removal.reason}`,
      `Tenure started: ${v.leaderUpdatedAt.toISOString()}`,
      hall.state.publishedAt
        ? `Missed attended defenses: ${hall.state.missedStarts}`
        : `Schedule deadline: ${hall.state.setupDueAt ?? "unknown"}`,
      replacement
        ? `Replacement: ${replacement.username} (${replacement.userId})`
        : "Replacement: none; village left vacant",
    ],
  });
  // Publish one system announcement; unread counters determine who receives it.
  await client.insert(notification).values({
    userId: TERR_BOT_ID,
    content: `${removedUsername} was removed as Kage of ${v.name} ${removal.reason.replace(/^Kage removed /, "")}. ${successor}`,
  });
  await client
    .update(userData)
    .set({ unreadNotifications: sql`${userData.unreadNotifications} + 1` })
    .where(
      inArray(
        userData.userId,
        [v.kageId, replacement && !replacement.isAi ? replacement.userId : ""].filter(
          Boolean,
        ),
      ),
    );
};

/** Reuse fresh public state, reconciling stale deadlines or unassigned challengers before display. */
export const getKageDefensePublic = async (
  client: DrizzleClient,
  villageId: string,
) => {
  const current = await readKageDefensePublic(client, villageId);
  if (!current) return null;
  const state = current.schedule;
  // Fresh polls reuse persisted state. Stale reads still recover interruptions before display.
  if (
    state &&
    state.kageId === current.kageId &&
    new Date(state.observedAt) >
      secondsFromDate(-KAGE_DEFENSE_PUBLIC_SYNC_SECONDS, new Date()) &&
    !(
      state.windows.length &&
      !state.paused &&
      current.queue.some((m) => m.status === "QUEUED")
    )
  )
    return current;
  await syncKageDefense(client, villageId);
  return readKageDefensePublic(client, villageId);
};

/** Read the public schedule, FIFO queue and bounded outcome history in parallel. */
const readKageDefensePublic = async (client: DrizzleClient, villageId: string) => {
  const [v, queue, history] = await Promise.all([
    client.query.village.findFirst({
      where: eq(village.id, villageId),
      with: { kage: { columns: { userId: true, username: true, isAi: true } } },
    }),
    client
      .select({
        id: kageDefendedChallenges.id,
        challengerId: kageDefendedChallenges.userId,
        username: userData.username,
        status: kageDefendedChallenges.status,
        scheduledAt: kageDefendedChallenges.scheduledAt,
        checkedInAt: kageDefendedChallenges.checkedInAt,
        rescheduled: kageDefendedChallenges.rescheduled,
        aiRequested: kageDefendedChallenges.aiRequested,
        aiAccepted: kageDefendedChallenges.aiAccepted,
        hospitalDeferred: kageDefendedChallenges.hospitalDeferred,
        battleId: kageDefendedChallenges.battleId,
      })
      .from(kageDefendedChallenges)
      .innerJoin(userData, eq(userData.userId, kageDefendedChallenges.userId))
      .where(
        and(
          eq(kageDefendedChallenges.villageId, villageId),
          inArray(kageDefendedChallenges.status, activeKageMatchStatuses),
        ),
      )
      .orderBy(asc(kageDefendedChallenges.createdAt), asc(kageDefendedChallenges.id)),
    client
      .select({
        id: kageDefendedChallenges.id,
        challengerId: kageDefendedChallenges.userId,
        outcome: kageDefendedChallenges.outcome,
        resolvedAt: kageDefendedChallenges.resolvedAt,
      })
      .from(kageDefendedChallenges)
      .where(
        and(
          eq(kageDefendedChallenges.villageId, villageId),
          inArray(kageDefendedChallenges.status, [
            "COMPLETED",
            "CANCELLED",
            "FORFEITED",
          ]),
        ),
      )
      .orderBy(desc(kageDefendedChallenges.resolvedAt))
      .limit(10),
  ]);
  if (!v) return null;
  return {
    kage: v.kage,
    kageId: v.kageId,
    schedule: v.kageSchedule,
    setupDeadline: v.kageSchedule?.setupDueAt
      ? new Date(v.kageSchedule.setupDueAt)
      : secondsFromDate(
          KAGE_DEFENSE_SETUP_HOURS * 3600,
          new Date(
            Math.max(v.leaderUpdatedAt.getTime(), v.kageScheduleAvailableAt.getTime()),
          ),
        ),
    queue,
    history,
  };
};

/**
 * Keep idle tenures observed without loading combatants or opening transactions.
 * Active matches, expired setup deadlines and interrupted observations retain full
 * reconciliation. The version/tenure guard lets concurrent queue or leadership
 * changes win without overwriting their schedule; the next tick observes them.
 */
export const maintainKageDefenses = async (client: DrizzleClient) => {
  const now = new Date();
  const uninterruptedSince = secondsFromDate(-KAGE_DEFENSE_GRACE_MINUTES * 60, now);
  const villages = await client
    .select({
      id: village.id,
      kageId: village.kageId,
      leaderUpdatedAt: village.leaderUpdatedAt,
      version: village.kageScheduleVersion,
      state: village.kageSchedule,
      hasMatches: exists(
        client
          .select({ id: kageDefendedChallenges.id })
          .from(kageDefendedChallenges)
          .where(
            and(
              eq(kageDefendedChallenges.villageId, village.id),
              inArray(kageDefendedChallenges.status, activeKageMatchStatuses),
            ),
          ),
      ).mapWith(Boolean),
      hasWar: exists(
        client
          .select({ id: war.id })
          .from(war)
          .where(
            and(
              eq(war.type, "VILLAGE_WAR"),
              or(
                eq(war.attackerVillageId, village.id),
                eq(war.defenderVillageId, village.id),
              ),
              or(eq(war.status, "ACTIVE"), gte(war.startedAt, uninterruptedSince)),
            ),
          ),
      ).mapWith(Boolean),
    })
    .from(village)
    .where(eq(village.type, "VILLAGE"));
  await Promise.all(
    villages.map(async (v) => {
      const state = v.state;
      if (
        !state ||
        state.kageId !== v.kageId ||
        state.tenure !== v.leaderUpdatedAt.toISOString() ||
        !state.setupDueAt ||
        state.paused ||
        v.hasMatches ||
        v.hasWar ||
        !(new Date(state.observedAt) >= uninterruptedSince) ||
        (!state.publishedAt && v.kageId && !(now < new Date(state.setupDueAt)))
      ) {
        await syncKageDefense(client, v.id);
        return;
      }
      await client
        .update(village)
        .set({
          kageSchedule: { ...state, observedAt: now.toISOString() },
          kageScheduleVersion: sql`${village.kageScheduleVersion} + 1`,
        })
        .where(
          and(
            eq(village.id, v.id),
            eq(village.kageScheduleVersion, v.version),
            eq(village.kageId, v.kageId),
            eq(village.leaderUpdatedAt, v.leaderUpdatedAt),
          ),
        );
    }),
  );
};
