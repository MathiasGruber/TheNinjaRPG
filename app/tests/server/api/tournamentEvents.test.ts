import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import {
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
  userData,
  userQueue,
} from "@/drizzle/schema";
import { updateUser } from "@/libs/combat/database";
import { calcBattleResult } from "@/libs/combat/util";
import { getServerPusher, Pusher } from "@/libs/pusher";
import { createEventState } from "@/libs/tournament/events";
import { initiateBattle } from "@/server/api/routers/combat";
import {
  maintainEventTournaments,
  syncEventTournament,
} from "@/server/api/routers/tournamentEvents";
import { eventTournamentConfigSchema } from "@/validators/tournament";
import { ObjectiveReward } from "@/validators/rewards";
import { insertUsers } from "../../setup/factories";
import { queueEnergy } from "../../setup/queues";
import {
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

  const completedEvent = (id: string) => {
    const event = createEventState(
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
        registrationClosesAt: 1,
        endsAt: Date.now() + 86400_000,
        rewards: {
          winner: {},
          runnerUp: {},
          semifinalist: {},
          participation: { reward_money: 10 },
          perWin: {},
        },
      }),
    );
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
