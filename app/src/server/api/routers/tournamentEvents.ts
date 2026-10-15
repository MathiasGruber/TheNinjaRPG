import { randomInt } from "node:crypto";
import { and, eq, gte, inArray, isNull, notExists, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  EVENT_TOURNAMENT_LAUNCH_RECOVERY_SECONDS,
  EVENT_TOURNAMENT_READY_SECONDS,
  EVENT_TOURNAMENT_RETENTION_DAYS,
  IMG_MANUAL_COMBAT,
  JUTSU_TRAIN_LEVEL_CAP,
  MAP_WAKE_ISLAND_SECTOR,
  RANKED_PVP_STATS,
} from "@/drizzle/constants";
import {
  battle,
  rankedLoadout,
  tournament,
  tournamentMatch,
  tournamentRewardClaim,
  userData,
  userJutsu,
} from "@/drizzle/schema";
import { getExpBracket } from "@/libs/profile";
import { getServerPusher } from "@/libs/pusher";
import { postProcessRewards } from "@/libs/quest";
import {
  advanceEvent,
  beginEventRound,
  completeEventGame,
  createEventState,
  eligibilityFailures,
  eventRewardFor,
  generateEventBracket,
} from "@/libs/tournament/events";
import { initiateBattle } from "@/routers/combat";
import { updateRewards } from "@/routers/quests";
import { errorResponse, protectedProcedure } from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { isMysqlDuplicateKeyError, retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { cleanRankedProhibitedSelections } from "@/server/utils/ranked";
import { canManageTournaments } from "@/utils/permissions";
import { ObjectiveReward } from "@/validators/rewards";
import {
  type EventParticipant,
  type EventSeries,
  type EventTournamentState,
  eventTournamentActionSchema,
  eventTournamentIdSchema,
  eventTournamentPlayerSchema,
  eventTournamentSaveSchema,
} from "@/validators/tournament";

export const eventTournamentProcedures = {
  getEventNotices: protectedProcedure.query(async ({ ctx }) => {
    const events = await ctx.drizzle.query.tournament.findMany({
      where: and(
        eq(tournament.type, "EVENT"),
        inArray(tournament.status, ["OPEN", "IN_PROGRESS"]),
      ),
      columns: { id: true, eventData: true },
      limit: 100,
    });
    return events.flatMap((row) => {
      const event = row.eventData;
      const seat = event?.participants.find(
        (p) => p.userId === ctx.userId && !p.withdrawn,
      );
      if (!event || !seat) return [];
      const ready = event.series.find(
        (s) =>
          !s.complete &&
          s.seats.includes(seat.id) &&
          s.games.at(-1)?.status === "READY" &&
          (s.games.at(-1)?.opensAt ?? Infinity) <= Date.now() &&
          (s.games.at(-1)?.deadline ?? 0) > Date.now() &&
          !s.games.at(-1)?.accepted.includes(ctx.userId),
      );
      if (ready)
        return [
          {
            tournamentId: row.id,
            name: event.config.name,
            message: "Your tournament match is ready",
            deadline: ready.games.at(-1)!.deadline,
          },
        ];
      if (
        !seat.accepted &&
        event.status === "REGISTRATION" &&
        event.config.registrationClosesAt > Date.now()
      )
        return [
          {
            tournamentId: row.id,
            name: event.config.name,
            message: "You have a tournament invitation",
            deadline: event.config.registrationClosesAt,
          },
        ];
      return [];
    });
  }),
  listEvents: protectedProcedure.query(async ({ ctx }) => {
    const [events, user] = await Promise.all([
      ctx.drizzle.query.tournament.findMany({
        where: eq(tournament.type, "EVENT"),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: 100,
      }),
      ctx.drizzle.query.userData.findFirst({
        where: eq(userData.userId, ctx.userId),
        columns: { role: true },
      }),
    ]);
    return events
      .filter(
        (e) =>
          e.eventData &&
          (e.eventData.status !== "DRAFT" ||
            canManageTournaments(user?.role ?? "USER")),
      )
      .map((e) => {
        const state = e.eventData;
        return {
          id: e.id,
          eventData: state
            ? {
                status: state.status,
                participantCount: state.participants.filter((p) => !p.withdrawn).length,
                config: {
                  name: state.config.name,
                  description: state.config.description,
                  format: state.config.format,
                  rules: state.config.rules,
                  capacity: state.config.capacity,
                  registrationClosesAt: state.config.registrationClosesAt,
                },
              }
            : null,
        };
      });
  }),
  getEvent: protectedProcedure
    .input(eventTournamentIdSchema)
    .query(async ({ ctx, input }) => {
      const [user, initial] = await Promise.all([
        fetchEventUser(ctx.drizzle, ctx.userId),
        fetchEvent(ctx.drizzle, input.tournamentId),
      ]);
      if (
        !initial?.eventData ||
        !user ||
        (initial.eventData.status === "DRAFT" && !canManageTournaments(user.role))
      )
        return null;
      await syncEventTournament(ctx.drizzle, input.tournamentId);
      const row = await fetchEvent(ctx.drizzle, input.tournamentId);
      if (!row?.eventData) return null;
      const participant = row.eventData.participants.find(
        (p) => p.userId === ctx.userId && !p.withdrawn,
      );
      const { matches: _matches, ...publicRow } = row;
      return {
        ...publicRow,
        eligibility: eligibilityFailures(row.eventData.config, snapshotFor(user)),
        participantId: participant?.id ?? null,
      };
    }),
  saveEvent: protectedProcedure
    .input(eventTournamentSaveSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.drizzle.query.userData.findFirst({
        where: eq(userData.userId, ctx.userId),
        columns: { role: true },
      });
      if (!canManageTournaments(user?.role ?? "USER"))
        return errorResponse("Tournament staff access required");
      if (input.config.registrationClosesAt <= Date.now())
        return errorResponse("Registration must close in the future");
      if (input.tournamentId)
        return editEvent(ctx.drizzle, input.tournamentId, (event) => {
          if (event.status !== "DRAFT") return "Only drafts can be edited";
          event.config = input.config;
          audit(event, ctx.userId, "Updated draft");
        });
      const id = nanoid();
      const eventData = createEventState(input.config);
      audit(eventData, ctx.userId, "Created draft");
      await ctx.drizzle.insert(tournament).values({
        id,
        type: "EVENT",
        name: `${input.config.name} (${id})`,
        description: input.config.description,
        image: IMG_MANUAL_COMBAT,
        rewards: ObjectiveReward.parse({}),
        eventData,
      });
      return { success: true, message: "Tournament draft created", tournamentId: id };
    }),
  manageEvent: protectedProcedure
    .input(eventTournamentActionSchema)
    .mutation(async ({ ctx, input }) => {
      const [user, target] = await Promise.all([
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
          columns: { role: true },
        }),
        input.userId ? fetchEventUser(ctx.drizzle, input.userId) : undefined,
      ]);
      if (!canManageTournaments(user?.role ?? "USER"))
        return errorResponse("Tournament staff access required");
      await syncEventTournament(ctx.drizzle, input.tournamentId);
      const result = await editEvent(ctx.drizzle, input.tournamentId, (event) => {
        const now = Date.now();
        if (
          event.status === "COMPLETED" ||
          (event.status === "CANCELLED" &&
            (input.action !== "CANCEL" || event.payRewards || !input.payRewards))
        )
          return "Tournament has ended";
        if (input.action === "PUBLISH") {
          if (event.status !== "DRAFT" || now >= event.config.registrationClosesAt)
            return "Registration cannot be opened";
          event.status = "REGISTRATION";
        } else if (input.action === "SEED") {
          if (event.status !== "REGISTRATION")
            return "Open registration before generating the bracket";
          const entrants = event.participants.filter((p) => p.accepted && !p.withdrawn);
          if (entrants.length < 2)
            return "At least two accepted participants are required to start early";
          const shuffled = entrants.map((p) => p.id);
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = randomInt(i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
          }
          generateEventBracket(event, shuffled);
        } else if (input.action === "BEGIN") {
          if (!["PREPARED", "RUNNING"].includes(event.status))
            return "Generate the bracket before beginning matches";
          if (input.scheduledAt) {
            if (input.scheduledAt <= now || input.scheduledAt >= event.config.endsAt)
              return "Choose a future time before the event ends";
            if (event.config.scheduling === "SEQUENTIAL" && input.seriesId) {
              const series = event.series.find((s) => s.id === input.seriesId);
              const round = Math.min(
                ...event.series.filter((s) => !s.complete).map((s) => s.round),
              );
              if (
                !series ||
                !series.resolved ||
                series.complete ||
                series.begun ||
                series.round !== round
              )
                return "Series is not ready in the current round";
              series.scheduledAt = input.scheduledAt;
            } else event.scheduledRoundAt = input.scheduledAt;
          } else {
            const error = beginEventRound(event, now, input.seriesId);
            if (error) return error;
          }
        } else if (input.action === "CANCEL") {
          if (
            event.series.some((s) =>
              s.games.some((g) => ["STARTING", "FIGHTING"].includes(g.status)),
            )
          )
            return "Wait for active games to finish before cancelling";
          event.status = "CANCELLED";
          event.finishedAt ??= now;
          event.payRewards = input.payRewards ?? false;
        } else if (input.action === "INVITE") {
          if (
            event.status !== "REGISTRATION" ||
            now >= event.config.registrationClosesAt
          )
            return "Invitations require open registration";
          if (!target || target.isAi || target.isBanned)
            return "An eligible player account is required";
          const failures = eligibilityFailures(event.config, snapshotFor(target));
          if (failures.length) return failures.join(". ");
          if (
            event.participants.some((p) => !p.withdrawn && p.userId === target.userId)
          )
            return "Player already has a reserved slot";
          const replacing = input.seatId
            ? event.participants.find(
                (p) =>
                  p.id === input.seatId && p.invited && !p.accepted && !p.withdrawn,
              )
            : undefined;
          if (input.seatId && !replacing)
            return "Only pending invitations can be overwritten";
          if (!replacing && occupiedSeats(event) >= event.config.capacity)
            return "Tournament is full, including reserved invitations";
          if (replacing)
            event.participants.splice(event.participants.indexOf(replacing), 1);
          event.participants = event.participants.filter(
            (p) => p.userId !== target.userId,
          );
          event.participants.push(makeParticipant(target, true, false));
        } else if (input.action === "REMOVE_INVITE") {
          if (event.status !== "REGISTRATION")
            return "Invitations can only be withdrawn during registration";
          const participant = event.participants.find(
            (p) => p.id === input.seatId && p.invited,
          );
          if (!participant) return "Invitation not found";
          participant.withdrawn = true;
        } else if (input.action === "SUBSTITUTE") {
          if (!["PREPARED", "RUNNING"].includes(event.status))
            return "Substitutions require a generated bracket";
          const seat = event.participants.find(
            (p) => p.id === input.seatId && p.accepted,
          );
          if (!seat || !target || target.isAi || target.isBanned)
            return "Participant or replacement not found";
          if (
            event.participants.some(
              (p) =>
                p.userId === target.userId ||
                p.previousUsers.some((u) => u.userId === target.userId),
            )
          )
            return "Replacement has already participated";
          if (
            event.series.some(
              (s) =>
                s.seats.includes(seat.id) &&
                s.games.some((g) => ["STARTING", "FIGHTING"].includes(g.status)),
            )
          )
            return "Wait for this participant's active game to finish";
          if (!event.series.some((s) => !s.complete && s.seats.includes(seat.id)))
            return "This seat has already been eliminated";
          const failures = eligibilityFailures(event.config, snapshotFor(target));
          if (failures.length) return failures.join(". ");
          const originalId = seat.userId;
          seat.previousUsers.push({ userId: seat.userId, username: seat.username });
          seat.userId = target.userId;
          seat.username = target.username;
          seat.snapshot = snapshotFor(target);
          seat.withdrawn = false;
          for (const s of event.series.filter(
            (s) => !s.complete && s.seats.includes(seat.id),
          )) {
            const game = s.games.at(-1);
            if (game?.status === "READY") {
              game.accepted = [];
              game.userIds = game.userIds.map((id) =>
                id === originalId ? target.userId : id,
              );
              game.opensAt = now;
              game.deadline = now + EVENT_TOURNAMENT_READY_SECONDS * 1000;
            }
          }
        } else if (input.action === "RECOVER") {
          // Launch recovery is handled by sync: never relaunch a battle with the same ID.
          return "Recovery synchronized; unfinished battles remain under combat ownership";
        }
        audit(
          event,
          ctx.userId,
          `${input.action}${input.userId ? ` ${input.userId}` : ""}${input.seatId ? ` seat ${input.seatId}` : ""}${input.scheduledAt ? ` at ${new Date(input.scheduledAt).toISOString()}` : ""}${input.action === "CANCEL" ? ` rewards=${event.payRewards}` : ""}`,
        );
      });
      if (result.success) await syncEventTournament(ctx.drizzle, input.tournamentId);
      return result;
    }),
  participateEvent: protectedProcedure
    .input(eventTournamentPlayerSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchEventUser(ctx.drizzle, ctx.userId);
      if (!user || user.isAi || user.isBanned)
        return errorResponse("An active player account is required");
      await syncEventTournament(ctx.drizzle, input.tournamentId);
      const result = await editEvent(ctx.drizzle, input.tournamentId, (event) => {
        const now = Date.now();
        const seat = event.participants.find(
          (p) => p.userId === user.userId && !p.withdrawn,
        );
        if (["DRAFT", "COMPLETED", "CANCELLED"].includes(event.status))
          return "Tournament is not accepting player actions";
        if (input.action === "JOIN") {
          if (
            event.status !== "REGISTRATION" ||
            now >= event.config.registrationClosesAt
          )
            return "Registration is closed";
          if (user.sector !== MAP_WAKE_ISLAND_SECTOR || user.status !== "AWAKE")
            return "Register while awake at Wake Island";
          if (seat?.accepted) return "Already registered";
          if (event.config.registration === "INVITE_ONLY" && !seat?.invited)
            return "A staff invitation is required";
          const failures = eligibilityFailures(event.config, snapshotFor(user));
          if (failures.length) return failures.join(". ");
          if (seat) {
            seat.accepted = true;
            seat.snapshot = snapshotFor(user);
          } else {
            if (occupiedSeats(event) >= event.config.capacity)
              return "Tournament is full, including reserved invitations";
            event.participants = event.participants.filter(
              (p) => p.userId !== user.userId,
            );
            event.participants.push(makeParticipant(user, false, true));
          }
        } else if (input.action === "WITHDRAW" || input.action === "DECLINE") {
          if (!seat) return "No registration or invitation found";
          seat.withdrawn = true;
        } else {
          const series = event.series.find(
            (s) => s.id === input.seriesId && !s.complete,
          );
          const game = series?.games.at(-1);
          if (!seat || !series || !game || !series.seats.includes(seat.id))
            return "Ready check not found";
          if (game.status !== "READY" || now < game.opensAt || now >= game.deadline)
            return "Ready check is not open";
          if (
            user.status !== "AWAKE" ||
            user.battleId ||
            user.sector !== MAP_WAKE_ISLAND_SECTOR
          )
            return "Ready check failed: be awake and available at Wake Island, outside combat, travel, hospital or queues";
          if (!game.accepted.includes(user.userId)) game.accepted.push(user.userId);
        }
      });
      if (result.success) await syncEventTournament(ctx.drizzle, input.tournamentId);
      return result;
    }),
};

export const fetchEvent = (client: DrizzleClient, id: string) =>
  client.query.tournament.findFirst({
    where: and(eq(tournament.id, id), eq(tournament.type, "EVENT")),
    with: { matches: true },
  });

type EventRow = NonNullable<Awaited<ReturnType<typeof fetchEvent>>>;

/** Whole-event CAS serializes roster, bracket and score changes without missing-row locks. */
const saveEventState = async (
  client: DrizzleClient,
  row: EventRow,
  event: EventTournamentState,
) => {
  const saved = await client
    .update(tournament)
    .set({
      eventData: event,
      version: sql`${tournament.version} + 1`,
      status: ["COMPLETED", "CANCELLED"].includes(event.status)
        ? "COMPLETED"
        : event.series.length
          ? "IN_PROGRESS"
          : "OPEN",
    })
    .where(and(eq(tournament.id, row.id), eq(tournament.version, row.version)));
  return saved.rowsAffected === 1;
};

const editEvent = async (
  client: DrizzleClient,
  id: string,
  edit: (event: EventTournamentState) => string | undefined,
) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await fetchEvent(client, id);
    if (!row?.eventData) return errorResponse("Tournament not found");
    const event = structuredClone(row.eventData);
    const message = edit(event);
    if (message) return errorResponse(message);
    if (await saveEventState(client, row, event))
      return { success: true, message: "Tournament updated" };
  }
  return errorResponse("Tournament changed; please try again");
};

/** Reads progress only games/rounds that staff have explicitly begun or scheduled. */
export const syncEventTournament = async (client: DrizzleClient, id: string) => {
  const row = await fetchEvent(client, id);
  if (!row?.eventData) return;
  const event = structuredClone(row.eventData);
  const now = Date.now();
  if (["COMPLETED", "CANCELLED"].includes(event.status)) {
    await payEventRewards(client, row);
    return;
  }
  if (event.status === "DRAFT" || event.status === "REGISTRATION") return;
  for (const series of event.series.filter((s) => !s.complete)) {
    const game = series.games.at(-1);
    if (!game) continue;
    const activeUserIds = event.participants
      .filter((p) => series.seats.includes(p.id) && !p.withdrawn)
      .map((p) => p.userId);
    const saved = row.matches.find((m) => m.id === game.id);
    if (saved?.state === "PLAYED") {
      const withdrawn = series.seats.some(
        (sid) => event.participants.find((p) => p.id === sid)?.withdrawn,
      );
      completeEventGame(
        event,
        series,
        saved.winnerId,
        saved.winnerId ? "BATTLE" : "DRAW",
        now,
        withdrawn,
      );
      if (withdrawn) {
        series.winnerId =
          series.seats.find(
            (sid) => sid && !event.participants.find((p) => p.id === sid)?.withdrawn,
          ) ?? null;
        series.loserId = null;
        series.winnerUserId =
          event.participants.find((p) => p.id === series.winnerId)?.userId ?? null;
      }
    } else if (
      game.status === "READY" &&
      game.accepted.length < 2 &&
      now >= game.deadline
    ) {
      const ready = game.accepted.filter((uid) => activeUserIds.includes(uid));
      completeEventGame(
        event,
        series,
        ready.length === 1 ? ready[0]! : null,
        ready.length === 1 ? "NO_SHOW" : "DOUBLE_NO_SHOW",
        now,
      );
    } else if (
      game.status === "READY" &&
      series.seats.some(
        (sid) => event.participants.find((p) => p.id === sid)?.withdrawn,
      )
    ) {
      game.accepted = game.userIds.filter((uid) => activeUserIds.includes(uid));
      completeEventGame(
        event,
        series,
        game.accepted[0] ?? null,
        game.accepted.length ? "NO_SHOW" : "DOUBLE_NO_SHOW",
        now,
        true,
      );
      // Withdrawal is an immediate series forfeit, including best-of formats.
      series.complete = true;
      series.winnerId =
        series.seats.find(
          (sid) => sid && !event.participants.find((p) => p.id === sid)?.withdrawn,
        ) ?? null;
      series.loserId = null;
      series.winnerUserId =
        event.participants.find((p) => p.id === series.winnerId)?.userId ?? null;
    } else if (
      ["STARTING", "FIGHTING"].includes(game.status) &&
      now > game.deadline + EVENT_TOURNAMENT_LAUNCH_RECOVERY_SECONDS * 1000
    ) {
      const running = await client.query.battle.findFirst({
        where: eq(battle.id, game.battleId),
        columns: { id: true },
      });
      if (running) game.status = "FIGHTING";
      else {
        // Revoke the launch token before a fresh ready check can be created. A delayed
        // initiator's user claim verifies this row and compensates its own empty battle.
        const revoked = saved
          ? await client
              .update(tournamentMatch)
              .set({ state: "NO_SHOW" })
              .where(
                and(
                  eq(tournamentMatch.id, game.id),
                  eq(tournamentMatch.state, "WAITING"),
                  isNull(tournamentMatch.winnerId),
                  notExists(
                    client
                      .select({ id: battle.id })
                      .from(battle)
                      .where(eq(battle.id, game.battleId)),
                  ),
                ),
              )
          : undefined;
        if (saved?.state === "NO_SHOW" || revoked?.rowsAffected === 1)
          completeEventGame(event, series, null, "DRAW", now);
      }
    }
  }
  advanceEvent(event, now);
  if (
    !["COMPLETED", "CANCELLED"].includes(event.status) &&
    now >= event.config.endsAt
  ) {
    if (
      !event.series.some((s) =>
        s.games.some((g) => ["STARTING", "FIGHTING"].includes(g.status)),
      )
    ) {
      event.status = "CANCELLED";
      event.finishedAt = now;
      event.payRewards = false;
      audit(event, "system", "Event deadline reached; cancelled without rewards");
    }
  } else if (event.scheduledRoundAt && now >= event.scheduledRoundAt)
    beginEventRound(event, now);
  for (const s of event.series)
    if (s.scheduledAt && now >= s.scheduledAt) beginEventRound(event, now, s.id);
  const changed = JSON.stringify(event) !== JSON.stringify(row.eventData);
  if (changed && !(await saveEventState(client, row, event))) return;
  if (["COMPLETED", "CANCELLED"].includes(event.status)) {
    await payEventRewards(client, { ...row, eventData: event });
    return;
  }
  // Each launch first claims the event version. Acceptance never starts a second battle.
  for (const series of event.series.filter((s) => !s.complete)) {
    const game = series.games.at(-1);
    if (game?.status === "READY" && game.accepted.length === 2 && now >= game.opensAt)
      await launchEventGame(client, id, series.id);
  }
};

const launchEventGame = async (client: DrizzleClient, id: string, seriesId: string) => {
  const row = await fetchEvent(client, id);
  const event = row?.eventData;
  const series = event?.series.find((s) => s.id === seriesId && !s.complete);
  const game = series?.games.at(-1);
  if (
    !row ||
    !event ||
    !series ||
    !game ||
    game.status !== "READY" ||
    game.accepted.length !== 2 ||
    Date.now() >= event.config.endsAt
  )
    return;
  game.status = "STARTING";
  const claimed = await retryOnDeadlock(() =>
    client.transaction(async (tx) => {
      const database = tx as unknown as DrizzleClient;
      if (!(await saveEventState(database, row, event))) return false;
      // Publish STARTING and its revocable combat token together. A crashed claimant
      // cannot leave an event that recovery advances before the token appears.
      await database.insert(tournamentMatch).values({
        id: game.id,
        tournamentId: id,
        round: series.round,
        match: series.games.length,
        userId1: game.userIds[0] ?? "",
        userId2: game.userIds[1] ?? "",
        battleId: game.battleId,
        startedAt: new Date(),
      });
      return true;
    }),
  );
  if (!claimed) return;
  const [users, loadouts] = await Promise.all([
    client.query.userData.findMany({
      where: inArray(userData.userId, game.userIds),
      columns: {
        userId: true,
        status: true,
        battleId: true,
        sector: true,
        isBanned: true,
      },
    }),
    event.config.rules === "RANKED"
      ? client.query.rankedLoadout.findMany({
          where: inArray(rankedLoadout.userId, game.userIds),
        })
      : [],
  ]);
  const available = users.filter(
    (u) =>
      u.status === "AWAKE" &&
      !u.battleId &&
      !u.isBanned &&
      u.sector === MAP_WAKE_ISLAND_SECTOR,
  );
  if (available.length !== 2) {
    await recordLaunchFailure(
      client,
      id,
      seriesId,
      game.id,
      available.map((u) => u.userId),
    );
    return;
  }
  const cleaned = await Promise.all(
    loadouts.map((l) => cleanRankedProhibitedSelections(client, l)),
  );
  if (
    event.config.rules === "RANKED" &&
    (cleaned.length !== 2 ||
      cleaned.some(
        (l) =>
          !l.loadout.loadout.jutsuIds.length &&
          !l.loadout.loadout.weaponIds.length &&
          !l.loadout.loadout.consumableIds.length,
      ))
  ) {
    await recordLaunchFailure(
      client,
      id,
      seriesId,
      game.id,
      [],
      "Ranked loadouts must contain allowed equipped selections",
    );
    return;
  }
  const result = await initiateBattle(
    {
      client,
      userIds: [game.userIds[0]!],
      targetIds: [game.userIds[1]!],
      biome: "arena",
      tournamentGame: {
        id: game.id,
        battleId: game.battleId,
        aiOnly: event.config.rules === "AI",
      },
      userStatDistribution:
        event.config.rules === "RANKED" ? RANKED_PVP_STATS : undefined,
      targetStatDistribution:
        event.config.rules === "RANKED" ? RANKED_PVP_STATS : undefined,
      forceLoadouts: cleaned.map((l) => l.loadout),
      autoCombatUserIds: event.config.rules === "AI" ? game.userIds : undefined,
    },
    event.config.rules === "RANKED" ? "RANKED_SPARRING" : "SPARRING",
    0,
  );
  if (!result.success) {
    await recordLaunchFailure(client, id, seriesId, game.id, [], result.message);
    return;
  }
  await editEvent(client, id, (e) => {
    const g = e.series
      .find((s) => s.id === seriesId)
      ?.games.find((g) => g.id === game.id);
    if (g?.status === "STARTING") g.status = "FIGHTING";
  });
};

const recordLaunchFailure = async (
  client: DrizzleClient,
  id: string,
  seriesId: string,
  gameId: string,
  available: string[],
  message?: string,
) => {
  await client
    .update(tournamentMatch)
    .set({ state: "NO_SHOW" })
    .where(and(eq(tournamentMatch.id, gameId), eq(tournamentMatch.state, "WAITING")));
  await editEvent(client, id, (event) => {
    const series = event.series.find((s) => s.id === seriesId);
    const game = series?.games.at(-1);
    if (!series || !game || game.id !== gameId || game.status !== "STARTING")
      return "Game already changed";
    if (message) {
      // Setup failures do not count as a player dodge. Staff can repair loadouts and begin again.
      game.status = "COMPLETE";
      game.outcome = "DRAW";
      series.begun = false;
      audit(event, "system", `Game setup failed: ${message}`);
    } else {
      game.accepted = available;
      completeEventGame(
        event,
        series,
        available.length === 1 ? available[0]! : null,
        available.length === 1 ? "NO_SHOW" : "DOUBLE_NO_SHOW",
        Date.now(),
      );
    }
  });
};

const payEventRewards = async (client: DrizzleClient, row: EventRow) => {
  const event = row.eventData;
  if (!event?.payRewards) return;
  const users = [
    ...new Set(
      event.participants
        .filter((p) => p.accepted && p.seed > 0)
        .flatMap((p) => [p.userId, ...p.previousUsers.map((u) => u.userId)]),
    ),
  ];
  const receipts = await client.query.tournamentRewardClaim.findMany({
    where: eq(tournamentRewardClaim.tournamentId, row.id),
  });
  for (const userId of users.filter((id) => !receipts.some((r) => r.userId === id))) {
    try {
      await retryOnDeadlock(() =>
        client.transaction(async (tx) => {
          const database = tx as unknown as DrizzleClient;
          // Claim the still-retained terminal event, preventing cleanup from removing receipts
          // while a delayed payer is in flight. The version increment also fences deletion.
          const retained = await database
            .update(tournament)
            .set({ version: sql`${tournament.version} + 1` })
            .where(
              and(
                eq(tournament.id, row.id),
                eq(tournament.type, "EVENT"),
                eq(tournament.status, "COMPLETED"),
              ),
            );
          if (retained.rowsAffected !== 1) return;
          // Unique receipt and all grants roll back together; a duplicate never grants twice.
          await database
            .insert(tournamentRewardClaim)
            .values({ id: `${row.id}:${userId}`, tournamentId: row.id, userId });
          const user = await database.query.userData.findFirst({
            where: eq(userData.userId, userId),
          });
          // Deleted entrants are nonpayable; retain their receipt so payout can finish.
          if (!user) return;
          const rewards = eventRewardFor(event, userId);
          if (!rewards) return;
          await updateRewards({
            client: database,
            inTransaction: true,
            user,
            rewards: postProcessRewards(rewards, user),
            reason: `TOURNAMENT_${row.id}`,
            persistQuestData: false,
          });
        }),
      );
    } catch (error) {
      if (!isMysqlDuplicateKeyError(error)) throw error;
    }
  }
};

export const maintainEventTournaments = async (client: DrizzleClient) => {
  const rows = await client.query.tournament.findMany({
    where: eq(tournament.type, "EVENT"),
  });
  for (const row of rows) {
    const event = row.eventData;
    if (!event) continue;
    if (
      event.finishedAt &&
      Date.now() - event.finishedAt > EVENT_TOURNAMENT_RETENTION_DAYS * 86400_000
    ) {
      // Finish any interrupted payout before removing its event and receipts.
      await syncEventTournament(client, row.id);
      const removed = await client
        .delete(tournament)
        .where(and(eq(tournament.id, row.id), eq(tournament.version, row.version)));
      if (removed.rowsAffected !== 1) continue;
      await Promise.all([
        client.delete(tournamentMatch).where(eq(tournamentMatch.tournamentId, row.id)),
        client
          .delete(tournamentRewardClaim)
          .where(eq(tournamentRewardClaim.tournamentId, row.id)),
      ]);
    } else await syncEventTournament(client, row.id);
  }
};

const fetchEventUser = async (client: DrizzleClient, id: string) => {
  const [user, mastered] = await Promise.all([
    client.query.userData.findFirst({ where: eq(userData.userId, id) }),
    client.query.userJutsu.findMany({
      where: and(eq(userJutsu.userId, id), gte(userJutsu.level, JUTSU_TRAIN_LEVEL_CAP)),
      columns: { jutsuId: true },
    }),
  ]);
  return user
    ? { ...user, masteredJutsu: new Set(mastered.map((j) => j.jutsuId)).size }
    : null;
};
const snapshotFor = (
  user: NonNullable<Awaited<ReturnType<typeof fetchEventUser>>>,
): EventParticipant["snapshot"] => ({
  bracket: getExpBracket(user.experience, user.rank),
  pvpWins: user.pvpWins,
  winRate:
    user.pvpWins + user.pvpLosses
      ? (user.pvpWins / (user.pvpWins + user.pvpLosses)) * 100
      : 0,
  masteredJutsu: user.masteredJutsu,
});
const makeParticipant = (
  user: NonNullable<Awaited<ReturnType<typeof fetchEventUser>>>,
  invited: boolean,
  accepted: boolean,
): EventParticipant => ({
  id: nanoid(),
  userId: user.userId,
  username: user.username,
  invited,
  accepted,
  withdrawn: false,
  seed: 0,
  snapshot: snapshotFor(user),
  previousUsers: [],
});
const occupiedSeats = (event: EventTournamentState) =>
  event.participants.filter((p) => !p.withdrawn).length;
const audit = (event: EventTournamentState, userId: string, action: string) => {
  event.audit.push({ userId, action, at: Date.now() });
};
