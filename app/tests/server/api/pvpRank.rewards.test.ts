import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { rankedSeason, rankedUserRewards, userData, village } from "@/drizzle/schema";
import { pvpRankRouter } from "@/server/api/routers/pvprank";
import { ObjectiveReward } from "@/validators/rewards";
import { insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

describeWithDatabase("ranked season reward loyalty", () => {
  beforeEach(async () => {
    await resetTables(rankedUserRewards, rankedSeason, userData, village);
    const db = await getTestDatabase();
    await db.insert(village).values({ id: "reward-village", name: "Reward village", kageId: "", tokens: 0 });
    await insertUsers([{ userId: "claimant", villageId: "reward-village", joinedVillageAt: new Date(Date.now() - 100 * 86_400_000), villagePrestige: 0, money: 0 }]);
    await db.insert(rankedSeason).values({ id: "season", name: "Season", description: "", startDate: new Date(0), endDate: new Date(0), rewards: [{ division: "Wood", rewards: ObjectiveReward.parse({ reward_tokens: 1000, reward_prestige: 1000, reward_money: 1000 }) }] });
    await db.insert(rankedUserRewards).values({ id: "prize", userId: "claimant", seasonId: "season", division: "Wood" });
  });

  it.each([false, true])("scales earned prestige and tokens once, with outlaw=%s", async (isOutlaw) => {
    const db = await getTestDatabase();
    await db.update(userData).set({ isOutlaw }).where(eq(userData.userId, "claimant"));
    const caller = await callerFor(pvpRankRouter, "claimant");
    const amount = isOutlaw ? 1000 : 1130;
    const result = await caller.claimSeasonRewards();
    expect(result).toMatchObject({ success: true, rewards: { reward_tokens: amount, reward_prestige: amount, reward_money: 1000 } });
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "claimant") })).toMatchObject({ villagePrestige: amount, money: 1000 });
    expect(await db.query.village.findFirst({ where: eq(village.id, "reward-village") })).toMatchObject({ tokens: amount });
    expect((await caller.claimSeasonRewards()).success).toBe(false);
    expect(await db.query.village.findFirst({ where: eq(village.id, "reward-village") })).toMatchObject({ tokens: amount });
  });
});
