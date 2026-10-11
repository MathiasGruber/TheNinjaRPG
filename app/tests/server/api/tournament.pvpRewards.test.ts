import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { clan, tournament, tournamentMatch, tournamentRecord, userData } from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { updateRewards } from "@/server/api/routers/quests";
import { syncTournamentState, tournamentRouter } from "@/server/api/routers/tournament";
import { ObjectiveReward, PostProcessedRewardSchema } from "@/validators/rewards";
import { insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

describeWithDatabase("tournament PvP reward boost", () => {
  beforeEach(async () => {
    await resetTables(tournamentRecord, tournamentMatch, tournament, clan, userData);
    await insertUsers([
      { userId: "prize-winner", username: "prize-winner", clanId: "prize-clan", pvpExperience: 1400, money: 0 },
      { userId: "prize-other", username: "prize-other", pvpExperience: 600 },
    ]);
    await (await getTestDatabase()).insert(clan).values({ id: "prize-clan", name: "Prize clan", image: "", villageId: "", founderId: "prize-winner", leaderId: "prize-winner", leaderOrderId: "", bank: 1000 });
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("transfers the clan treasury exactly once without boosting its principal", async () => {
    const db = await getTestDatabase();
    const caller = await callerFor(tournamentRouter, "prize-winner");
    expect((await caller.createTournament({ id: "prize-clan", name: "Prize tournament", image: "", description: "Prize tournament", type: "CLAN", rewards: ObjectiveReward.parse({}) })).success).toBe(true);
    expect(await db.query.clan.findFirst({ where: eq(clan.id, "prize-clan") })).toMatchObject({ bank: 0 });
    await db.update(tournament).set({ status: "IN_PROGRESS", roundStartedAt: new Date(0) }).where(eq(tournament.id, "prize-clan"));
    await db.insert(tournamentMatch).values({ id: "prize-final", tournamentId: "prize-clan", round: 1, match: 1, userId1: "prize-winner", winnerId: "prize-winner", startedAt: new Date(0) });
    expect((await syncTournamentState(db, "prize-clan", updateRewards)).success).toBe(true);
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "prize-winner") })).toMatchObject({ money: 1000 });
    expect(await db.query.tournamentRecord.findFirst({ where: eq(tournamentRecord.id, "prize-clan") })).toMatchObject({ winnerId: "prize-winner", rewards: { reward_money: 1000 } });
    await syncTournamentState(db, "prize-clan", updateRewards);
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "prize-winner") })).toMatchObject({ money: 1000 });
  });

  it("keeps generated prizes eligible for the shared multiplier", async () => {
    const db = await getTestDatabase();
    const winner = (await db.query.userData.findFirst({ where: eq(userData.userId, "prize-winner") }))!;
    await updateRewards({ client: db, user: winner, rewards: PostProcessedRewardSchema.parse({ reward_money: 1000 }), reason: "TOURNAMENT" });
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "prize-winner") })).toMatchObject({ money: 1150 });
    expect(await db.query.clan.findFirst({ where: eq(clan.id, "prize-clan") })).toMatchObject({ bank: 1000 });
  });
});
