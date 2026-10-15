import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import {
  EVENT_TOURNAMENT_LAUNCH_RECOVERY_SECONDS,
  EVENT_TOURNAMENT_RETENTION_DAYS,
  MAP_WAKE_ISLAND_SECTOR,
  RANKED_PVP_STATS,
  REGEN_SECONDS,
} from "@/drizzle/constants";
import {
  aiProfile,
  battle,
  battleHistory,
  tournament,
  tournamentMatch,
  tournamentRewardClaim,
  trainingLog,
  userData,
  userQueue,
} from "@/drizzle/schema";
import { updateUser } from "@/libs/combat/database";
import { calcBattleResult } from "@/libs/combat/util";
import { getServerPusher, Pusher } from "@/libs/pusher";
import {
  beginEventRound,
  createEventState,
  generateEventBracket,
} from "@/libs/tournament/events";
import { initiateBattle } from "@/server/api/routers/combat";
import { tournamentRouter } from "@/server/api/routers/tournament";
import {
  fetchEvent,
  maintainEventTournaments,
  syncEventTournament,
} from "@/server/api/routers/tournamentEvents";
import type { DrizzleClient } from "@/server/db";
import { eventTournamentConfigSchema } from "@/validators/tournament";
import { ObjectiveReward } from "@/validators/rewards";
import { insertUsers } from "../../setup/factories";
import { queueEnergy } from "../../setup/queues";
import { beforeStatements } from "../../setup/statements";
import {
  callerFor,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

describeWithDatabase("event tournament persistence", () => {
  beforeEach(async () => {
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    await resetTables(
      tournamentRewardClaim,
      tournamentMatch,
      tournament,
      battleHistory,
      battle,
      aiProfile,
      trainingLog,
      userQueue,
      userData,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  for (const battleType of ["SPARRING", "RANKED_SPARRING"] as const) {
    for (const queued of [false, true]) {
      it(`preserves real entry recovery through ${battleType} settlement (queued=${queued})`, async () => {
        const database = await getTestDatabase();
        const regenAt = new Date(Date.now() - 10 * REGEN_SECONDS * 1000 - 1000);
        await insertUsers(
          ["hero", "foe"].map((userId) => ({
            userId,
            status: "AWAKE",
            rank: "JONIN",
            level: 50,
            isOutlaw: true,
            sector: MAP_WAKE_ISLAND_SECTOR,
            regeneration: 10,
            regenAt,
            curHealth: 100,
            curChakra: 100,
            curStamina: 100,
            maxHealth: 1000,
            maxChakra: 1000,
            maxStamina: 1000,
            curEnergy: 100,
          })),
        );
        if (queued) await queueEnergy("hero", [{ stat: "strength", energy: 50 }]);
        await database
          .insert(aiProfile)
          .values({ id: "Default", userId: "ai", rules: [] });
        await database.insert(tournamentMatch).values({
          id: "game",
          tournamentId: "event",
          round: 1,
          match: 1,
          userId1: "hero",
          userId2: "foe",
          battleId: "exhibition",
          startedAt: new Date(),
        });
        const distribution =
          battleType === "RANKED_SPARRING" ? RANKED_PVP_STATS : undefined;
        const started = await initiateBattle(
          {
            client: database,
            userIds: ["hero"],
            targetIds: ["foe"],
            tournamentGame: { id: "game", battleId: "exhibition", aiOnly: false },
            userStatDistribution: distribution,
            targetStatDistribution: distribution,
          },
          battleType,
        );
        expect(started.success, started.message).toBe(true);
        const entry = (await database.query.userData.findFirst({
          where: eq(userData.userId, "hero"),
        }))!;
        expect([entry.curHealth, entry.curChakra, entry.curStamina]).toEqual([
          200, 200, 200,
        ]);
        expect(entry.regenAt.getTime()).toBe(
          regenAt.getTime() + 10 * REGEN_SECONDS * 1000,
        );
        expect(entry.curEnergy).toBe(queued ? 150 : 200);
        const snapshot = (await database.query.battle.findFirst({
          where: eq(battle.id, "exhibition"),
        }))!;
        if (battleType === "RANKED_SPARRING")
          expect(
            snapshot.usersState.find((u) => u.userId === "hero")!.curHealth,
          ).toBeGreaterThan(200);
        snapshot.usersState.find((u) => u.userId === "hero")!.curHealth = 1;
        snapshot.usersState.find((u) => u.userId === "hero")!.curChakra = 1;
        snapshot.usersState.find((u) => u.userId === "hero")!.curStamina = 1;
        snapshot.usersState.find((u) => u.userId === "foe")!.curHealth = 0;
        const result = calcBattleResult(snapshot, "hero", []);
        expect(result).not.toBeNull();
        await updateUser(database, getServerPusher(), snapshot, result, "hero");
        const settled = (await database.query.userData.findFirst({
          where: eq(userData.userId, "hero"),
        }))!;
        expect(settled.status).toBe("AWAKE");
        expect(settled.battleId).toBeNull();
        expect([settled.curHealth, settled.curChakra, settled.curStamina]).toEqual([
          200, 200, 200,
        ]);
        expect(settled.curEnergy).toBeGreaterThanOrEqual(entry.curEnergy);
        expect(settled.curEnergy).toBeLessThan(entry.curEnergy + 10);
      });
    }
  }

  const eventConfig = (id: string) =>
    eventTournamentConfigSchema.parse({
      name: id,
      description: "Wake Island event",
      registration: "OPEN",
      format: "SINGLE_ELIMINATION",
      seeding: "RANDOM",
      rules: "OPEN",
      scheduling: "SIMULTANEOUS",
      capacity: 8,
      bestOf: 1,
      roundBestOf: [],
      minBracket: 0,
      maxBracket: 7,
      minPvpWins: 0,
      minWinRate: 0,
      minMasteredJutsu: 0,
      registrationClosesAt: Date.now() + 3600_000,
      endsAt: Date.now() + 86400_000,
      rewards: {
        winner: {},
        runnerUp: {},
        semifinalist: {},
        participation: { reward_money: 10 },
        perWin: {},
      },
    });

  const readyEvent = async () => {
    const database = await getTestDatabase();
    await insertUsers(
      ["hero", "foe"].map((userId) => ({
        userId,
        username: userId,
        status: "AWAKE",
        rank: "JONIN",
        level: 50,
        isOutlaw: true,
        sector: MAP_WAKE_ISLAND_SECTOR,
        regeneration: 10,
        regenAt: new Date(Date.now() - 10 * REGEN_SECONDS * 1000 - 1000),
        curHealth: 100,
        curChakra: 100,
        curStamina: 100,
        maxHealth: 1000,
        maxChakra: 1000,
        maxStamina: 1000,
        curEnergy: 100,
      })),
    );
    await database.insert(aiProfile).values({ id: "Default", userId: "ai", rules: [] });
    const event = createEventState(eventConfig("Launch race"));
    event.participants = ["hero", "foe"].map((userId, i) => ({
      id: `seat-${i}`,
      userId,
      username: userId,
      invited: false,
      accepted: true,
      withdrawn: false,
      seed: 0,
      snapshot: { bracket: 1, pvpWins: 0, winRate: 0, masteredJutsu: 0 },
      previousUsers: [],
    }));
    generateEventBracket(
      event,
      event.participants.map((p) => p.id),
    );
    beginEventRound(event, Date.now());
    const series = event.series[0]!;
    const game = series.games[0]!;
    game.accepted = [game.userIds[0]!];
    await database.insert(tournament).values({
      id: "launch",
      name: "Launch race",
      description: "Wake Island event",
      image: "",
      type: "EVENT",
      status: "IN_PROGRESS",
      eventData: event,
      rewards: ObjectiveReward.parse({}),
    });
    const accept = (userId: string, client = database) =>
      tournamentRouter
        .createCaller({ drizzle: client, userId } as never)
        .participateEvent({
          tournamentId: "launch",
          action: "ACCEPT",
          seriesId: series.id,
        });
    return { database, game, accept };
  };

  it("recovers a stalled launch without exposing claims or allowing its late battle", async () => {
    const { database, game, accept } = await readyEvent();
    const reached = deferred();
    const release = deferred();
    const stalled = beforeLaunchWrite(database, battle, async () => {
      reached.resolve();
      await release.promise;
    });
    const launching = accept(game.userIds[1]!, stalled);
    try {
      await reached.promise;
      expect(await database.query.userData.findMany()).toMatchObject([
        { status: "AWAKE", battleId: null },
        { status: "AWAKE", battleId: null },
      ]);
      expect(await database.query.battle.findMany()).toHaveLength(0);
      expect(await database.query.battleHistory.findMany()).toHaveLength(0);
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(
          game.deadline + (EVENT_TOURNAMENT_LAUNCH_RECOVERY_SECONDS + 1) * 1000,
        );
      await syncEventTournament(database, "launch");
      const recovered = (await fetchEvent(database, "launch"))!.eventData!;
      expect(recovered.series[0]!.games).toHaveLength(2);
      expect((await database.query.tournamentMatch.findFirst())?.state).toBe("NO_SHOW");
      release.resolve();
      await launching;
      expect(await database.query.battle.findMany()).toHaveLength(0);
      expect(await database.query.battleHistory.findMany()).toHaveLength(0);
      const next = recovered.series[0]!.games.at(-1)!;
      clock.mockReturnValue(next.opensAt + 1);
      for (const userId of next.userIds)
        expect((await accept(userId)).success).toBe(true);
      expect(await database.query.battle.findMany()).toMatchObject([
        { id: next.battleId },
      ]);
      expect(await database.query.userData.findMany()).toMatchObject([
        { status: "BATTLE", battleId: next.battleId },
        { status: "BATTLE", battleId: next.battleId },
      ]);
    } finally {
      release.resolve();
      await launching;
    }
  });

  for (const inFlight of [false, true]) {
    it(`arbitrates launch against recovery's stale missing-battle read (inFlight=${inFlight})`, async () => {
      const { database, game, accept } = await readyEvent();
      const reached = deferred();
      const release = deferred();
      const revoking = deferred();
      const releaseRecovery = deferred();
      const stalled = beforeLaunchWrite(database, battleHistory, async () => {
        reached.resolve();
        await release.promise;
      });
      const launching = accept(game.userIds[1]!, stalled);
      let recovering: Promise<void> | undefined;
      try {
        await reached.promise;
        // Let independently dispatched siblings settle before checking atomic visibility.
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(await database.query.battle.findMany()).toHaveLength(0);
        expect(await database.query.userData.findMany()).toMatchObject([
          { status: "AWAKE", battleId: null },
          { status: "AWAKE", battleId: null },
        ]);
        vi.spyOn(Date, "now").mockReturnValue(
          game.deadline + (EVENT_TOURNAMENT_LAUNCH_RECOVERY_SECONDS + 1) * 1000,
        );
        recovering = syncEventTournament(
          beforeStatements(database, tournamentMatch, [
            async () => {
              revoking.resolve();
              if (!inFlight) await releaseRecovery.promise;
            },
          ]),
          "launch",
        );
        await revoking.promise;
        if (inFlight) await database.query.tournament.findFirst();
        release.resolve();
        await launching;
        releaseRecovery.resolve();
        await recovering;
        const event = (await fetchEvent(database, "launch"))!.eventData!;
        const match = (await database.query.tournamentMatch.findFirst())!;
        if (inFlight && match.state === "NO_SHOW") {
          expect(event.series[0]!.games).toHaveLength(2);
          expect(event.series[0]!.games.at(-1)?.status).toBe("READY");
          expect(await database.query.battle.findMany()).toHaveLength(0);
          expect(await database.query.battleHistory.findMany()).toHaveLength(0);
          expect(await database.query.userData.findMany()).toMatchObject([
            { status: "AWAKE", battleId: null },
            { status: "AWAKE", battleId: null },
          ]);
        } else {
          expect(event.series[0]!.games).toHaveLength(1);
          expect(event.series[0]!.games[0]?.status).toBe("FIGHTING");
          expect(match.state).toBe("WAITING");
          expect(await database.query.battle.findMany()).toMatchObject([
            { id: game.battleId },
          ]);
          expect(await database.query.battleHistory.findMany()).toHaveLength(1);
          expect(await database.query.userData.findMany()).toMatchObject([
            { status: "BATTLE", battleId: game.battleId },
            { status: "BATTLE", battleId: game.battleId },
          ]);
        }
      } finally {
        release.resolve();
        releaseRecovery.resolve();
        await Promise.all([launching, recovering]);
      }
    });
  }

  it("rolls back battle, history, recovery and training when only one participant is claimed", async () => {
    const { database, game } = await readyEvent();
    await queueEnergy("foe", [{ stat: "strength", energy: 50 }]);
    const before = (await database.query.userData.findFirst({
      where: eq(userData.userId, "foe"),
    }))!;
    await database.insert(tournamentMatch).values({
      id: game.id,
      tournamentId: "launch",
      round: 1,
      match: 1,
      userId1: game.userIds[0]!,
      userId2: game.userIds[1]!,
      battleId: game.battleId,
      startedAt: new Date(),
    });
    const raced = beforeLaunchWrite(database, battle, async () => {
      await database
        .update(userData)
        .set({ status: "ASLEEP" })
        .where(eq(userData.userId, "hero"));
    });
    const result = await initiateBattle(
      {
        client: raced,
        userIds: [game.userIds[0]!],
        targetIds: [game.userIds[1]!],
        tournamentGame: { id: game.id, battleId: game.battleId, aiOnly: false },
      },
      "SPARRING",
    );
    expect(result.success).toBe(false);
    expect(await database.query.battle.findMany()).toHaveLength(0);
    expect(await database.query.battleHistory.findMany()).toHaveLength(0);
    expect(
      await database.query.userData.findFirst({ where: eq(userData.userId, "foe") }),
    ).toEqual(before);
    expect(await database.query.trainingLog.findMany()).toHaveLength(0);
    expect(
      (await database.query.userData.findFirst({ where: eq(userData.userId, "hero") }))
        ?.status,
    ).toBe("ASLEEP");
    await database
      .update(userData)
      .set({ status: "AWAKE" })
      .where(eq(userData.userId, "hero"));
    expect(
      (
        await initiateBattle(
          {
            client: database,
            userIds: [game.userIds[0]!],
            targetIds: [game.userIds[1]!],
            tournamentGame: { id: game.id, battleId: game.battleId, aiOnly: false },
          },
          "SPARRING",
        )
      ).success,
    ).toBe(true);
    const retried = (await database.query.userData.findFirst({
      where: eq(userData.userId, "foe"),
    }))!;
    expect(retried.energyQueueHead).toBe(1);
    expect(retried.experience).toBeGreaterThan(before.experience);
    expect(retried.curEnergy).toBe(150);
  });

  const completedEvent = (id: string) => {
    const event = createEventState(eventConfig(id));
    event.status = "COMPLETED";
    event.finishedAt = Date.now();
    event.payRewards = true;
    event.participants = ["deleted", "remaining"].map((userId, i) => ({
      id: `seat-${i}`,
      userId,
      username: userId,
      invited: false,
      accepted: true,
      withdrawn: false,
      seed: i + 1,
      snapshot: { bracket: 1, pvpWins: 0, winRate: 0, masteredJutsu: 0 },
      previousUsers: [],
    }));
    return {
      id,
      name: id,
      description: "event",
      image: "",
      type: "EVENT" as const,
      status: "COMPLETED" as const,
      rewards: ObjectiveReward.parse({}),
      eventData: event,
    };
  };

  for (const published of [false, true]) {
    it(`applies the event deadline and retention only after publication (published=${published})`, async () => {
      const database = await getTestDatabase();
      await insertUsers([{ userId: "staff", role: "CODER" }]);
      const staff = await callerFor(tournamentRouter, "staff");
      const config = eventConfig("Unseeded event");
      const created = await staff.saveEvent({ config });
      if (!("tournamentId" in created)) throw new Error(created.message);
      const { tournamentId } = created;
      if (published)
        expect(
          (await staff.manageEvent({ tournamentId, action: "PUBLISH" })).success,
        ).toBe(true);
      const clock = vi.spyOn(Date, "now").mockReturnValue(config.endsAt - 1);
      await maintainEventTournaments(database);
      expect((await fetchEvent(database, tournamentId))?.eventData?.status).toBe(
        published ? "REGISTRATION" : "DRAFT",
      );
      clock.mockReturnValue(config.endsAt);
      await maintainEventTournaments(database);
      const ended = (await fetchEvent(database, tournamentId))!;
      expect(ended.eventData?.status).toBe(published ? "CANCELLED" : "DRAFT");
      expect(ended.eventData?.finishedAt).toBe(published ? config.endsAt : null);
      expect(ended.eventData?.payRewards).toBe(false);
      expect(await database.query.tournamentRewardClaim.findMany()).toHaveLength(0);
      clock.mockReturnValue(
        config.endsAt + EVENT_TOURNAMENT_RETENTION_DAYS * 86400_000 + 1,
      );
      await maintainEventTournaments(database);
      const retained = await fetchEvent(database, tournamentId);
      if (published) expect(retained).toBeUndefined();
      else expect(retained?.eventData?.status).toBe("DRAFT");
    });
  }

  it("pays the final bye as a championship after both upper finalists no-show", async () => {
    const database = await getTestDatabase();
    const entrants = ["first", "second", "third", "fourth"];
    await insertUsers(
      ["staff", ...entrants].map((userId) => ({
        userId,
        role: userId === "staff" ? "CODER" : "USER",
        status: "AWAKE",
        sector: MAP_WAKE_ISLAND_SECTOR,
        money: 0,
      })),
    );
    const staff = await callerFor(tournamentRouter, "staff");
    const config = eventConfig("Final bye");
    config.format = "DOUBLE_ELIMINATION";
    config.rewards.participation.reward_money = 0;
    config.rewards.winner.reward_money = 100;
    config.rewards.runnerUp.reward_money = 20;
    const created = await staff.saveEvent({ config });
    if (!("tournamentId" in created)) throw new Error(created.message);
    const { tournamentId } = created;
    expect((await staff.manageEvent({ tournamentId, action: "PUBLISH" })).success).toBe(
      true,
    );
    for (const userId of entrants) {
      const player = await callerFor(tournamentRouter, userId);
      expect(
        (await player.participateEvent({ tournamentId, action: "JOIN" })).success,
      ).toBe(true);
    }
    expect((await staff.manageEvent({ tournamentId, action: "SEED" })).success).toBe(
      true,
    );
    let champion = "";
    let championSeat = "";
    for (const round of [1, 2]) {
      expect((await staff.manageEvent({ tournamentId, action: "BEGIN" })).success).toBe(
        true,
      );
      const event = (await fetchEvent(database, tournamentId))!.eventData!;
      for (const series of event.series.filter((s) => s.begun && !s.complete)) {
        if (round === 1 || series.bracket === "LOSERS") {
          const userId = series.games.at(-1)!.userIds[0]!;
          const player = await callerFor(tournamentRouter, userId);
          expect(
            (
              await player.participateEvent({
                tournamentId,
                action: "ACCEPT",
                seriesId: series.id,
              })
            ).success,
          ).toBe(true);
          if (round === 2) {
            champion = userId;
            championSeat = series.seats[0]!;
          }
        }
      }
      const accepted = (await fetchEvent(database, tournamentId))!.eventData!;
      for (const series of accepted.series.filter((s) => s.begun && !s.complete))
        series.games.at(-1)!.deadline = Date.now() - 1;
      await database
        .update(tournament)
        .set({ eventData: accepted })
        .where(eq(tournament.id, tournamentId));
      await syncEventTournament(database, tournamentId);
    }
    const finished = (await fetchEvent(database, tournamentId))!.eventData!;
    expect(finished.status).toBe("COMPLETED");
    expect(finished.standings[0]).toBe(championSeat);
    expect(finished.series.filter((s) => s.bracket === "FINAL")).toHaveLength(1);
    await syncEventTournament(database, tournamentId);
    expect(
      (
        await database.query.userData.findFirst({
          where: eq(userData.userId, champion),
        })
      )?.money,
    ).toBe(100);
    expect(await database.query.tournamentRewardClaim.findMany()).toHaveLength(4);
  });

  for (const registration of ["OPEN", "INVITE_ONLY"] as const) {
    for (const resolution of ["deadline", "withdrawal"] as const) {
      it(`keeps a rejoined ${registration} entrant's current seat through ${resolution}`, async () => {
        const database = await getTestDatabase();
        await insertUsers(
          ["staff", "returning", "opponent"].map((userId) => ({
            userId,
            role: userId === "staff" ? "CODER" : "USER",
            status: "AWAKE",
            sector: MAP_WAKE_ISLAND_SECTOR,
          })),
        );
        const staff = await callerFor(tournamentRouter, "staff");
        const returning = await callerFor(tournamentRouter, "returning");
        const opponent = await callerFor(tournamentRouter, "opponent");
        const created = await staff.saveEvent({
          config: { ...eventConfig("Rejoin"), registration },
        });
        if (!("tournamentId" in created)) throw new Error(created.message);
        const { tournamentId } = created;
        expect(
          (await staff.manageEvent({ tournamentId, action: "PUBLISH" })).success,
        ).toBe(true);
        const invite = async (userId: string) => {
          if (registration === "INVITE_ONLY")
            expect(
              (await staff.manageEvent({ tournamentId, action: "INVITE", userId }))
                .success,
            ).toBe(true);
        };
        await invite("returning");
        expect(
          (await returning.participateEvent({ tournamentId, action: "JOIN" })).success,
        ).toBe(true);
        expect(
          (await returning.participateEvent({ tournamentId, action: "WITHDRAW" }))
            .success,
        ).toBe(true);
        await invite("returning");
        expect(
          (await returning.participateEvent({ tournamentId, action: "JOIN" })).success,
        ).toBe(true);
        await invite("opponent");
        expect(
          (await opponent.participateEvent({ tournamentId, action: "JOIN" })).success,
        ).toBe(true);
        const joined = (await returning.getEvent({ tournamentId }))!;
        expect(
          joined.eventData!.participants.filter((p) => p.userId === "returning"),
        ).toHaveLength(1);
        const seat = joined.eventData!.participants.find(
          (p) => p.id === joined.participantId,
        )!;
        expect(seat.withdrawn).toBe(false);
        expect(
          (await staff.manageEvent({ tournamentId, action: "SEED" })).success,
        ).toBe(true);
        expect(
          (await staff.manageEvent({ tournamentId, action: "BEGIN" })).success,
        ).toBe(true);
        const event = (await fetchEvent(database, tournamentId))!.eventData!;
        const seriesId = event.series[0]!.id;
        if (resolution === "deadline") {
          expect(
            (
              await returning.participateEvent({
                tournamentId,
                action: "ACCEPT",
                seriesId,
              })
            ).success,
          ).toBe(true);
          const accepted = (await fetchEvent(database, tournamentId))!.eventData!;
          accepted.series[0]!.games[0]!.deadline = Date.now() - 1;
          await database
            .update(tournament)
            .set({ eventData: accepted })
            .where(eq(tournament.id, tournamentId));
          await syncEventTournament(database, tournamentId);
        } else {
          expect(
            (await opponent.participateEvent({ tournamentId, action: "WITHDRAW" }))
              .success,
          ).toBe(true);
        }
        const finished = (await fetchEvent(database, tournamentId))!.eventData!;
        expect(finished.series[0]!.games[0]!.outcome).toBe("NO_SHOW");
        expect(finished.series[0]!.winnerId).toBe(seat.id);
        expect(finished.series[0]!.winnerUserId).toBe("returning");
        expect(finished.series[0]!.scores.reduce((sum, score) => sum + score, 0)).toBe(
          1,
        );
        expect(finished.standings[0]).toBe(seat.id);
      });
    }
  }

  it("reinvites withdrawn users and overwrites pending invitations without duplicate seats", async () => {
    const database = await getTestDatabase();
    await insertUsers(
      ["staff", "first", "replacement"].map((userId) => ({
        userId,
        role: userId === "staff" ? "CODER" : "USER",
      })),
    );
    const staff = await callerFor(tournamentRouter, "staff");
    const first = await callerFor(tournamentRouter, "first");
    const created = await staff.saveEvent({
      config: { ...eventConfig("Invites"), registration: "INVITE_ONLY" },
    });
    if (!("tournamentId" in created)) throw new Error(created.message);
    const { tournamentId } = created;
    expect((await staff.manageEvent({ tournamentId, action: "PUBLISH" })).success).toBe(
      true,
    );
    expect(
      (await staff.manageEvent({ tournamentId, action: "INVITE", userId: "first" }))
        .success,
    ).toBe(true);
    let event = (await fetchEvent(database, tournamentId))!.eventData!;
    expect(
      (
        await staff.manageEvent({
          tournamentId,
          action: "REMOVE_INVITE",
          seatId: event.participants[0]!.id,
        })
      ).success,
    ).toBe(true);
    expect(
      (await staff.manageEvent({ tournamentId, action: "INVITE", userId: "first" }))
        .success,
    ).toBe(true);
    event = (await fetchEvent(database, tournamentId))!.eventData!;
    expect(event.participants).toHaveLength(1);
    expect((await first.getEvent({ tournamentId }))?.participantId).toBe(
      event.participants[0]!.id,
    );
    expect(
      (
        await staff.manageEvent({
          tournamentId,
          action: "INVITE",
          userId: "replacement",
          seatId: event.participants[0]!.id,
        })
      ).success,
    ).toBe(true);
    event = (await fetchEvent(database, tournamentId))!.eventData!;
    expect(event.participants.map((p) => p.userId)).toEqual(["replacement"]);
    expect((await first.getEvent({ tournamentId }))?.participantId).toBeNull();
  });

  it("keeps event drafts private through the clan reader and preserves published event and clan reads", async () => {
    const database = await getTestDatabase();
    await insertUsers([{ userId: "reader" }, { userId: "staff", role: "CODER" }]);
    const reader = await callerFor(tournamentRouter, "reader");
    const staff = await callerFor(tournamentRouter, "staff");
    const created = await staff.saveEvent({ config: eventConfig("Private draft") });
    if (!("tournamentId" in created)) throw new Error(created.message);
    const { tournamentId } = created;
    expect(await reader.listEvents()).toHaveLength(0);
    expect(await reader.getEvent({ tournamentId })).toBeNull();
    expect((await staff.getEvent({ tournamentId }))?.eventData?.status).toBe("DRAFT");
    expect(await reader.getTournament({ tournamentId })).toBeNull();
    expect((await staff.manageEvent({ tournamentId, action: "PUBLISH" })).success).toBe(
      true,
    );
    expect(await reader.listEvents()).toHaveLength(1);
    expect((await reader.getEvent({ tournamentId }))?.eventData?.status).toBe(
      "REGISTRATION",
    );
    expect(await reader.getTournament({ tournamentId })).toBeNull();
    await database
      .insert(tournament)
      .values({
        id: "clan",
        name: "Clan tournament",
        type: "CLAN",
        image: "",
        description: "Clan event",
        rewards: ObjectiveReward.parse({}),
      });
    expect((await reader.getTournament({ tournamentId: "clan" }))?.type).toBe("CLAN");
  });

  it("commits absent recipients' receipts and pays remaining entrants exactly once", async () => {
    const database = await getTestDatabase();
    await insertUsers([{ userId: "remaining", money: 0 }]);
    await database.insert(tournament).values(completedEvent("event"));
    await Promise.all([
      syncEventTournament(database, "event"),
      syncEventTournament(database, "event"),
    ]);
    const receipts = await database.query.tournamentRewardClaim.findMany();
    expect(receipts.map((r) => r.userId).sort()).toEqual(["deleted", "remaining"]);
    expect((await database.query.userData.findFirst())?.money).toBe(10);
    await insertUsers([{ userId: "deleted", username: "deleted", money: 0 }]);
    await syncEventTournament(database, "event");
    expect(
      (
        await database.query.userData.findFirst({
          where: eq(userData.userId, "deleted"),
        })
      )?.money,
    ).toBe(0);
    expect(
      (
        await database.query.userData.findFirst({
          where: eq(userData.userId, "remaining"),
        })
      )?.money,
    ).toBe(10);
  });

  it("continues maintenance and retention after an absent recipient", async () => {
    const database = await getTestDatabase();
    await insertUsers([{ userId: "remaining", money: 0 }]);
    const expired = completedEvent("expired");
    expired.eventData.finishedAt =
      Date.now() - (EVENT_TOURNAMENT_RETENTION_DAYS + 1) * 86400_000;
    expired.eventData.payRewards = false;
    await database
      .insert(tournament)
      .values([completedEvent("first"), completedEvent("later"), expired]);
    await maintainEventTournaments(database);
    expect((await database.query.userData.findFirst())?.money).toBe(20);
    expect(await database.query.tournamentRewardClaim.findMany()).toHaveLength(4);
    expect(
      await database.query.tournament.findFirst({
        where: eq(tournament.id, "expired"),
      }),
    ).toBeUndefined();
    await maintainEventTournaments(database);
    expect((await database.query.userData.findFirst())?.money).toBe(20);
  });
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

/** Interleave the same real SQL write whether launch uses a transaction or independent writes. */
const beforeLaunchWrite = (
  client: DrizzleClient,
  table: object,
  hook: () => Promise<void>,
) => {
  let pending = true;
  const once = async () => {
    if (!pending) return;
    pending = false;
    await hook();
  };
  return new Proxy(beforeStatements(client, table, [once]), {
    get(target, property, receiver) {
      if (property === "transaction")
        return (callback: Parameters<typeof client.transaction>[0]) =>
          client.transaction((tx) =>
            callback(
              beforeStatements(tx as unknown as DrizzleClient, table, [
                once,
              ]) as typeof tx,
            ),
          );
      return Reflect.get(target, property, receiver);
    },
  });
};
