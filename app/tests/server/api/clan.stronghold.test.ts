import { beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { STRONGHOLD_REESTABLISH_COST } from "@/drizzle/constants";
import { actionLog, clan, userData, village } from "@/drizzle/schema";
import * as moderator from "@/libs/moderator";
import { clanRouter } from "@/server/api/routers/clan";
import { profileRouter } from "@/server/api/routers/profile";
import { syncStrongholdMembership } from "@/server/utils/faction";
import { insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const seedFaction = async (type: "HIDEOUT" | "STRONGHOLD", wasDowngraded = true) => {
  const db = await getTestDatabase();
  await db.insert(village).values({ id: "stronghold", name: "Stronghold", sector: 301, kageId: "leader", type, wasDowngraded });
  await db.insert(clan).values({ id: "faction", name: "Faction", image: "/clan.webp", villageId: "stronghold", founderId: "leader", leaderId: "leader", leaderOrderId: "leader-order", hasHideout: true, bank: STRONGHOLD_REESTABLISH_COST * 2 });
  await insertUsers(Array.from({ length: 30 }, (_, i) => ({ userId: i === 0 ? "leader" : `member-${i}`, username: `Member${i}`, villageId: "stronghold", clanId: "faction", isOutlaw: true })) as never);
};

describeWithDatabase("Stronghold membership and restoration", () => {
  beforeEach(async () => { await resetTables(actionLog, clan, userData, village); });

  it("starts immediately, resets on recovery, and downgrades after 72 hours", async () => {
    await seedFaction("STRONGHOLD", false);
    const db = await getTestDatabase();
    await db.update(userData).set({ villageId: null, clanId: null }).where(eq(userData.userId, "member-29"));
    await syncStrongholdMembership(db, "stronghold");
    let [settlement] = await db.select().from(village);
    expect(settlement?.type).toBe("STRONGHOLD");
    expect(settlement?.belowMemberMinimumSince).toBeInstanceOf(Date);
    await db.update(userData).set({ villageId: "stronghold", clanId: "faction" }).where(eq(userData.userId, "member-29"));
    await syncStrongholdMembership(db, "stronghold");
    [settlement] = await db.select().from(village);
    expect(settlement?.belowMemberMinimumSince).toBeNull();
    await db.update(userData).set({ villageId: null, clanId: null }).where(eq(userData.userId, "member-29"));
    await db.update(village).set({ belowMemberMinimumSince: new Date(Date.now() - 73 * 3600_000) }).where(eq(village.id, "stronghold"));
    await syncStrongholdMembership(db, "stronghold");
    [settlement] = await db.select().from(village);
    expect(settlement).toMatchObject({ type: "HIDEOUT", wasDowngraded: true });
  });

  it("counts faction members despite a staff-assigned unaffiliated resident and AI member", async () => {
    await seedFaction("STRONGHOLD", false);
    const db = await getTestDatabase();
    await db.insert(village).values({ id: "origin", name: "Origin", sector: 302, kageId: "staff" });
    await insertUsers([
      { userId: "staff", username: "Staff", role: "CODING-ADMIN", villageId: "origin" },
      { userId: "outsider", username: "Outsider", villageId: "origin", clanId: null, rank: "GENIN", status: "AWAKE" },
      { userId: "ai-member", username: "AiMember", villageId: "stronghold", clanId: "faction", isAi: true },
    ]);
    const approveReason = vi.spyOn(moderator, "validateUserUpdateReason").mockResolvedValue({ allowUpdate: true, comment: "" });
    try {
      const result = await (await callerFor(profileRouter, "staff")).updateUser({
        id: "outsider",
        data: { username: "Outsider", villageId: "stronghold", bloodlineId: null, sageModeId: null, role: "USER", rank: "GENIN", staffAccount: false, reason: "Repair the account's village assignment" },
      });
      expect(result.success).toBe(true);
    } finally {
      approveReason.mockRestore();
    }
    await db.update(userData).set({ clanId: null, villageId: null }).where(eq(userData.userId, "member-29"));
    await syncStrongholdMembership(db, "stronghold");
    let settlement = await db.query.village.findFirst({ where: eq(village.id, "stronghold") });
    expect(settlement?.belowMemberMinimumSince).toBeInstanceOf(Date);
    const graceStartedAt = new Date(Date.now() - 3600_000);
    await db.update(village).set({ belowMemberMinimumSince: graceStartedAt }).where(eq(village.id, "stronghold"));
    await syncStrongholdMembership(db, "stronghold");
    settlement = await db.query.village.findFirst({ where: eq(village.id, "stronghold") });
    expect(settlement?.belowMemberMinimumSince).toEqual(graceStartedAt);
    await db.update(village).set({ belowMemberMinimumSince: new Date(Date.now() - 73 * 3600_000) }).where(eq(village.id, "stronghold"));
    await syncStrongholdMembership(db, "stronghold");
    settlement = await db.query.village.findFirst({ where: eq(village.id, "stronghold") });
    expect(settlement).toMatchObject({ type: "HIDEOUT", wasDowngraded: true });
    const restore = await (await callerFor(clanRouter, "leader")).upgradeHideoutToStronghold({ clanId: "faction" });
    expect(restore.success).toBe(false);
    await db.update(userData).set({ clanId: "faction", villageId: "stronghold" }).where(eq(userData.userId, "member-29"));
    expect((await (await callerFor(clanRouter, "leader")).upgradeHideoutToStronghold({ clanId: "faction" })).success).toBe(true);
    settlement = await db.query.village.findFirst({ where: eq(village.id, "stronghold") });
    expect(settlement).toMatchObject({ type: "STRONGHOLD", belowMemberMinimumSince: null });
  });

  it("disables new upgrades and charges only once for concurrent restoration", async () => {
    await seedFaction("HIDEOUT", false);
    const caller = await callerFor(clanRouter, "leader");
    expect((await caller.upgradeHideoutToStronghold({ clanId: "faction" })).success).toBe(false);
    const db = await getTestDatabase();
    await db.update(village).set({ wasDowngraded: true }).where(eq(village.id, "stronghold"));
    const results = await Promise.all([caller.upgradeHideoutToStronghold({ clanId: "faction" }), caller.upgradeHideoutToStronghold({ clanId: "faction" })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const [faction] = await db.select().from(clan);
    expect(faction?.bank).toBe(STRONGHOLD_REESTABLISH_COST);
    const [settlement] = await db.select().from(village);
    expect(settlement).toMatchObject({ type: "STRONGHOLD", belowMemberMinimumSince: null });
  });

  it("uses the same pricing for faction boosts and rejects stale duplicate purchases", async () => {
    await seedFaction("HIDEOUT");
    const caller = await callerFor(clanRouter, "leader");
    const results = await Promise.all([caller.purchaseBoost({ clanId: "faction", boostType: "trainingBoost" }), caller.purchaseBoost({ clanId: "faction", boostType: "trainingBoost" })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const db = await getTestDatabase();
    const [faction] = await db.select().from(clan);
    expect(faction?.trainingBoost).toBe(2);
    expect(faction?.bank).toBe(STRONGHOLD_REESTABLISH_COST * 2 - 100000);
  });
});
