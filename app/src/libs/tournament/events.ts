import { nanoid } from "nanoid";
import {
  EVENT_TOURNAMENT_GAME_DELAY_SECONDS,
  EVENT_TOURNAMENT_READY_SECONDS,
} from "@/drizzle/constants";
import { collapseRewards } from "@/libs/rewards";
import type {
  EventParticipant,
  EventSeries,
  EventSlot,
  EventTournamentConfig,
  EventTournamentState,
} from "@/validators/tournament";

export const createEventState = (
  config: EventTournamentConfig,
): EventTournamentState => ({
  config,
  status: "DRAFT",
  participants: [],
  series: [],
  activeRound: null,
  scheduledRoundAt: null,
  finishedAt: null,
  payRewards: false,
  standings: [],
  audit: [],
});

export const eligibilityFailures = (
  config: EventTournamentConfig,
  snapshot: EventParticipant["snapshot"],
) => [
  ...(snapshot.bracket < config.minBracket || snapshot.bracket > config.maxBracket
    ? [`Requires PvP bracket ${config.minBracket}–${config.maxBracket}`]
    : []),
  ...(snapshot.pvpWins < config.minPvpWins
    ? [`Requires ${config.minPvpWins} PvP wins`]
    : []),
  ...(snapshot.winRate < config.minWinRate
    ? [`Requires ${config.minWinRate}% PvP win rate`]
    : []),
  ...(snapshot.masteredJutsu < config.minMasteredJutsu
    ? [`Requires ${config.minMasteredJutsu} mastered jutsu`]
    : []),
];

/** Seed order comes from the server's random permutation or frozen PvP-win ranking. */
export const generateEventBracket = (
  event: EventTournamentState,
  shuffledIds: string[],
) => {
  const entrants = event.participants.filter((p) => p.accepted && !p.withdrawn);
  const ordered =
    event.config.seeding === "PVP_WINS"
      ? [...entrants].sort(
          (a, b) =>
            b.snapshot.pvpWins - a.snapshot.pvpWins || a.userId.localeCompare(b.userId),
        )
      : shuffledIds
          .map((id) => entrants.find((p) => p.id === id))
          .filter((p): p is EventParticipant => !!p);
  ordered.forEach((p, i) => {
    p.seed = i + 1;
  });
  const makeSeries = (
    round: number,
    bracket: EventSeries["bracket"],
    slots: EventSeries["slots"],
  ) => {
    const series: EventSeries = {
      id: nanoid(),
      round,
      bracket,
      slots,
      seats: [null, null],
      resolved: false,
      complete: false,
      winnerId: null,
      loserId: null,
      winnerUserId: null,
      bestOf: event.config.roundBestOf[round - 1] ?? event.config.bestOf,
      scores: [0, 0],
      dodges: [0, 0],
      games: [],
      begun: false,
      scheduledAt: null,
    };
    event.series.push(series);
    return series;
  };
  if (event.config.format === "ROUND_ROBIN") {
    const rotation: (EventParticipant | null)[] = [...ordered];
    if (rotation.length % 2) rotation.push(null);
    for (let round = 1; round < rotation.length; round++) {
      for (let i = 0; i < rotation.length / 2; i++) {
        const a = rotation[i];
        const b = rotation[rotation.length - 1 - i];
        if (a && b) makeSeries(round, "LEAGUE", [{ seatId: a.id }, { seatId: b.id }]);
      }
      rotation.splice(1, 0, rotation.pop() ?? null);
    }
  } else {
    const size = 2 ** Math.ceil(Math.log2(ordered.length));
    // Standard seed positions separate the highest seeds and distribute empty slots as byes.
    let seeds = [1, 2];
    while (seeds.length < size)
      seeds = seeds.flatMap((n) => [n, seeds.length * 2 + 1 - n]);
    const slots: EventSlot[] = seeds.map((n) =>
      ordered[n - 1] ? { seatId: ordered[n - 1]!.id } : null,
    );
    const winners: EventSeries[][] = [];
    const source = (series: EventSeries, result: "WINNER" | "LOSER"): EventSlot => ({
      seriesId: series.id,
      result,
    });
    for (let r = 0; 2 ** r < size; r++) {
      const round = r < 2 ? r + 1 : r * 2;
      const previous = winners[r - 1];
      const inputs = previous ? previous.map((s) => source(s, "WINNER")) : slots;
      const current: EventSeries[] = [];
      for (let i = 0; i < inputs.length; i += 2)
        current.push(
          makeSeries(
            event.config.format === "DOUBLE_ELIMINATION" ? round : r + 1,
            "WINNERS",
            [inputs[i] ?? null, inputs[i + 1] ?? null],
          ),
        );
      winners.push(current);
    }
    if (event.config.format === "DOUBLE_ELIMINATION") {
      let lower: EventSeries[] = [];
      const first = winners[0]!;
      for (let i = 0; i < first.length; i += 2) {
        if (first[i + 1])
          lower.push(
            makeSeries(2, "LOSERS", [
              source(first[i]!, "LOSER"),
              source(first[i + 1]!, "LOSER"),
            ]),
          );
      }
      for (let r = 1; r < winners.length; r++) {
        const dropping = winners[r]!;
        lower = dropping.map((s, i) =>
          makeSeries(r * 2 + 1, "LOSERS", [
            source(lower[i]!, "WINNER"),
            source(dropping[dropping.length - 1 - i] ?? s, "LOSER"),
          ]),
        );
        if (r < winners.length - 1) {
          const joined: EventSeries[] = [];
          for (let i = 0; i < lower.length; i += 2)
            joined.push(
              makeSeries(r * 2 + 2, "LOSERS", [
                source(lower[i]!, "WINNER"),
                source(lower[i + 1]!, "WINNER"),
              ]),
            );
          lower = joined;
        }
      }
      const final = winners.at(-1)![0]!;
      const lowerSource = lower[0]
        ? source(lower[0], "WINNER")
        : source(final, "LOSER");
      makeSeries(Math.max(...event.series.map((s) => s.round)) + 1, "FINAL", [
        source(final, "WINNER"),
        lowerSource,
      ]);
    }
  }
  event.status = "PREPARED";
  resolveEventSlots(event);
};

/** Null winners carry double no-shows through the graph, without creating phantom opponents. */
export const resolveEventSlots = (event: EventTournamentState) => {
  for (const series of event.series) {
    if (series.resolved) continue;
    const ready = series.slots.every(
      (slot) =>
        !slot ||
        "seatId" in slot ||
        event.series.find((s) => s.id === slot.seriesId)?.complete,
    );
    if (!ready) continue;
    series.seats = series.slots.map((slot) => {
      if (!slot) return null;
      if ("seatId" in slot) return slot.seatId;
      const source = event.series.find((s) => s.id === slot.seriesId);
      return (slot.result === "WINNER" ? source?.winnerId : source?.loserId) ?? null;
    }) as EventSeries["seats"];
    series.resolved = true;
    const active = series.seats.filter(
      (id) => id && !event.participants.find((p) => p.id === id)?.withdrawn,
    );
    if (active.length < 2) {
      series.complete = true;
      series.winnerId = active[0] ?? null;
      series.loserId = null;
    }
  }
};

export const openEventGame = (
  event: EventTournamentState,
  series: EventSeries,
  now: number,
  delay = 0,
) => {
  const userIds = series.seats
    .map((id) => event.participants.find((p) => p.id === id)?.userId)
    .filter((id): id is string => !!id);
  series.games.push({
    id: nanoid(),
    battleId: nanoid(),
    status: "READY",
    opensAt: now + delay,
    deadline: now + delay + EVENT_TOURNAMENT_READY_SECONDS * 1000,
    accepted: [],
    userIds,
    winnerId: null,
    outcome: null,
  });
};

export const beginEventRound = (
  event: EventTournamentState,
  now: number,
  seriesId?: string,
) => {
  resolveEventSlots(event);
  const round = Math.min(
    ...event.series.filter((s) => !s.complete).map((s) => s.round),
  );
  if (!Number.isFinite(round)) return "No matches remain";
  const candidates = event.series.filter(
    (s) => s.round === round && s.resolved && !s.complete && !s.begun,
  );
  if (event.config.scheduling === "SEQUENTIAL") {
    if (event.series.some((s) => s.begun && !s.complete))
      return "Another series is in progress";
    const selected =
      candidates.find((s) => s.id === seriesId) ??
      (!seriesId ? candidates[0] : undefined);
    if (!selected) return "Series is not ready in this round";
    selected.begun = true;
    selected.scheduledAt = null;
    openEventGame(event, selected, now);
  } else {
    if (!candidates.length) return "This round has already begun";
    for (const s of candidates) {
      s.begun = true;
      openEventGame(event, s, now);
    }
  }
  event.activeRound = round;
  event.status = "RUNNING";
  event.scheduledRoundAt = null;
  return null;
};

/** Apply a game once; battle results and forfeits share the same score/dodge policy. */
export const completeEventGame = (
  event: EventTournamentState,
  series: EventSeries,
  winnerUserId: string | null,
  outcome: NonNullable<EventSeries["games"][number]["outcome"]>,
  now: number,
  forceSeries = false,
) => {
  const game = series.games.at(-1);
  if (!game || game.status === "COMPLETE") return;
  game.status = "COMPLETE";
  game.winnerId = winnerUserId;
  game.outcome = outcome;
  const winnerIndex = game.userIds.indexOf(winnerUserId ?? "");
  if (winnerIndex >= 0) series.scores[winnerIndex as 0 | 1]++;
  if (outcome === "NO_SHOW" || outcome === "DOUBLE_NO_SHOW") {
    for (const i of [0, 1] as const)
      if (!game.accepted.includes(game.userIds[i] ?? "")) series.dodges[i]++;
  }
  const required = Math.ceil(series.bestOf / 2);
  const eliminated = series.dodges.map((n) => n >= Math.min(2, required));
  const doubleNoShow = outcome === "DOUBLE_NO_SHOW";
  if (
    forceSeries ||
    doubleNoShow ||
    eliminated.some(Boolean) ||
    series.scores.some((n) => n >= required)
  ) {
    series.complete = true;
    const index = forceSeries
      ? winnerIndex
      : doubleNoShow
        ? -1
        : eliminated[0]
          ? 1
          : eliminated[1]
            ? 0
            : series.scores[0] >= required
              ? 0
              : 1;
    series.winnerId = index < 0 ? null : (series.seats[index as 0 | 1] ?? null);
    series.loserId = index < 0 ? null : (series.seats[1 - index] ?? null);
    series.winnerUserId = index < 0 ? null : (game.userIds[index] ?? null);
  } else openEventGame(event, series, now, EVENT_TOURNAMENT_GAME_DELAY_SECONDS * 1000);
};

export const advanceEvent = (event: EventTournamentState, now: number) => {
  resolveEventSlots(event);
  // A lower-bracket finalist must beat the undefeated finalist twice.
  const final = event.series.find((s) => s.bracket === "FINAL");
  if (
    final?.complete &&
    final.seats[0] &&
    final.winnerId &&
    final.winnerId === final.seats[1] &&
    event.series.filter((s) => s.bracket === "FINAL").length === 1
  ) {
    event.series.push({
      ...final,
      id: nanoid(),
      round: final.round + 1,
      slots: final.seats.map((id) =>
        id ? { seatId: id } : null,
      ) as EventSeries["slots"],
      complete: false,
      winnerId: null,
      loserId: null,
      winnerUserId: null,
      scores: [0, 0],
      dodges: [0, 0],
      games: [],
      begun: false,
      scheduledAt: null,
    });
  }
  if (event.series.length && event.series.every((s) => s.complete)) {
    const championship = event.series.at(-1)!;
    event.standings =
      event.config.format === "ROUND_ROBIN"
        ? leagueStandings(event)
        : eliminationStandings(event, championship);
    event.status = "COMPLETED";
    event.finishedAt = now;
    event.payRewards = true;
    event.activeRound = null;
  } else if (
    event.activeRound !== null &&
    event.series.filter((s) => s.round === event.activeRound).every((s) => s.complete)
  ) {
    event.status = "PREPARED";
    event.activeRound = null;
  }
};

export const leagueStandings = (event: EventTournamentState) => {
  const entrants = event.participants.filter((p) => p.accepted && !p.withdrawn);
  const wins = (id: string) => event.series.filter((s) => s.winnerId === id).length;
  const gameWins = (id: string) =>
    event.series.reduce((sum, s) => sum + (s.scores[s.seats.indexOf(id)] ?? 0), 0);
  // Stable, published tiebreaks: series wins, game wins, then original seed.
  return entrants
    .sort(
      (a, b) =>
        wins(b.id) - wins(a.id) || gameWins(b.id) - gameWins(a.id) || a.seed - b.seed,
    )
    .map((p) => p.id);
};

const eliminationStandings = (event: EventTournamentState, final: EventSeries) => {
  const leaders = [final.winnerId, final.loserId];
  const eliminated = [...event.series]
    .sort((a, b) => b.round - a.round)
    .flatMap((s) => (s.loserId ? [s.loserId] : []));
  return [...leaders, ...new Set(eliminated.filter((id) => !leaders.includes(id)))];
};

/** Attribute a decided series to the player who won it, even after later substitutions. */
export const eventRewardFor = (event: EventTournamentState, userId: string) => {
  const seeded = event.participants.some(
    (p) =>
      p.seed > 0 &&
      (p.userId === userId || p.previousUsers.some((u) => u.userId === userId)),
  );
  if (!seeded) return null;
  const position = event.standings.findIndex(
    (id) => id && event.participants.find((p) => p.id === id)?.userId === userId,
  );
  const rewards = [event.config.rewards.participation];
  if (event.status === "COMPLETED" && position >= 0 && position < 4)
    rewards.push(
      position === 0
        ? event.config.rewards.winner
        : position === 1
          ? event.config.rewards.runnerUp
          : event.config.rewards.semifinalist,
    );
  for (const series of event.series)
    if (series.complete && series.winnerUserId === userId)
      rewards.push(event.config.rewards.perWin);
  return collapseRewards(rewards);
};
