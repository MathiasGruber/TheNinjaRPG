import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { CLAN_BATTLE_REWARD_POINTS, CLAN_BATTLE_REWARD_RYO } from "@/drizzle/constants";
import {
  actionLog,
  battle,
  battleAction,
  battleHistory,
  clan,
  mpvpBattleQueue,
  mpvpBattleUser,
  userData,
} from "@/drizzle/schema";
import { createAction } from "@/libs/combat/database";
import { clanRouter } from "@/server/api/routers/clan";
import { deleteClanBattle, rewardClanBattleVictory } from "@/server/utils/clanBattle";
import { clanPointConversionSchema } from "@/validators/clan";
import { insertUsers } from "../../setup/factories";
import { beforeStatements, failStatements } from "../../setup/statements";
import {
  callerFor,
  callerForDatabase,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

describe("clan conversion input", () => {
  for (const points of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2147483648]) {
    it(`rejects ${points}`, () =>
      expect(clanPointConversionSchema.safeParse({ clanId: "a", points }).success).toBe(
        false,
      ));
  }
});

describeWithDatabase("clan economy and battle lifecycle", () => {
  beforeEach(async () => {
    await resetTables(
      actionLog,
      battleAction,
      battleHistory,
      battle,
      mpvpBattleUser,
      mpvpBattleQueue,
      clan,
      userData,
    );
    await insertUsers([
      { userId: "leader", clanId: "a", role: "USER" },
      { userId: "co", clanId: "a" },
      { userId: "member", clanId: "a" },
      { userId: "enemy", clanId: "b" },
      { userId: "staff", role: "OWNER" },
      { userId: "outsider", clanId: "c" },
    ]);
    const db = await getTestDatabase();
    await db.insert(clan).values(
      ["a", "b", "c"].map((id) => ({
        id,
        name: id,
        image: "/clan.png",
        villageId: "v",
        founderId: id === "a" ? "leader" : id === "b" ? "enemy" : "outsider",
        leaderId: id === "a" ? "leader" : id === "b" ? "enemy" : "outsider",
        leaderOrderId: id,
        coLeader1: id === "a" ? "co" : null,
        points: 100,
        bank: 50,
      })),
    );
    await db.insert(mpvpBattleQueue).values({
      id: "q",
      attackerEntityId: "a",
      defenderEntityId: "b",
      createdAt: new Date(0),
    });
    await db.insert(mpvpBattleUser).values({
      id: "u",
      clanBattleId: "q",
      userId: "leader",
      side: "ATTACKER",
      slot: 0,
    });
  });

  const storedClan = async () =>
    (await getTestDatabase()).query.clan.findFirst({ where: eq(clan.id, "a") });
  const storedUser = async (id: string) =>
    (await getTestDatabase()).query.userData.findFirst({
      where: eq(userData.userId, id),
    });

  it("credits only the clan bank and preserves activity points", async () => {
    const caller = await callerFor(clanRouter, "co");
    expect((await caller.convertPointsToRyo({ clanId: "a", points: 20 })).success).toBe(
      true,
    );
    expect(await storedClan()).toMatchObject({
      points: 80,
      bank: 4050,
      activityPoints: 0,
    });
    expect((await storedUser("co"))?.money).toBe(1000);
  });

  for (const id of ["member", "enemy", "staff", "outsider"]) {
    it(`denies conversion by ${id}`, async () => {
      expect(
        (
          await (
            await callerFor(clanRouter, id)
          ).convertPointsToRyo({ clanId: "a", points: 20 })
        ).success,
      ).toBe(false);
      expect(await storedClan()).toMatchObject({ points: 100, bank: 50 });
    });
  }

  it("concurrent conversion cannot overspend shared points", async () => {
    const caller = await callerFor(clanRouter, "leader");
    const results = await Promise.all([
      caller.convertPointsToRyo({ clanId: "a", points: 80 }),
      caller.convertPointsToRyo({ clanId: "a", points: 80 }),
    ]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(await storedClan()).toMatchObject({ points: 20, bank: 16050 });
  });

  it("does not pay a revoked leader from a stale snapshot", async () => {
    const db = await getTestDatabase();
    const guarded = beforeStatements(db, clan, [
      () => db.update(clan).set({ coLeader1: null }).where(eq(clan.id, "a")),
    ]);
    expect(
      (
        await callerForDatabase(clanRouter, "co", guarded).convertPointsToRyo({
          clanId: "a",
          points: 20,
        })
      ).success,
    ).toBe(false);
    expect(await storedClan()).toMatchObject({ points: 100, bank: 50 });
  });

  it("pays one shared victory despite concurrent participants and retries", async () => {
    const db = await getTestDatabase();
    await db
      .update(mpvpBattleQueue)
      .set({ battleId: "combat" })
      .where(eq(mpvpBattleQueue.id, "q"));
    expect(
      (
        await Promise.all(
          Array.from({ length: 12 }, () => rewardClanBattleVictory(db, "combat", "a")),
        )
      ).filter(Boolean),
    ).toHaveLength(1);
    expect(await rewardClanBattleVictory(db, "combat", "a")).toBe(false);
    expect(await rewardClanBattleVictory(db, "combat", "b")).toBe(false);
    expect(await storedClan()).toMatchObject({
      points: 100 + CLAN_BATTLE_REWARD_POINTS,
      bank: 50 + CLAN_BATTLE_REWARD_RYO,
      activityPoints: CLAN_BATTLE_REWARD_POINTS,
      pvpActivity: 1,
    });
    expect((await db.query.mpvpBattleQueue.findFirst())?.winnerId).toBe("a");
  });

  it("leaves a victory unclaimed when the winning clan was deleted", async () => {
    const db = await getTestDatabase();
    await db
      .update(mpvpBattleQueue)
      .set({ battleId: "combat" })
      .where(eq(mpvpBattleQueue.id, "q"));
    await db.delete(clan).where(eq(clan.id, "a"));
    expect(await rewardClanBattleVictory(db, "combat", "a")).toBe(false);
    expect((await db.query.mpvpBattleQueue.findFirst())?.winnerId).toBeNull();
    expect(await db.query.clan.findFirst({ where: eq(clan.id, "b") })).toMatchObject({
      points: 100,
      bank: 50,
      activityPoints: 0,
      pvpActivity: 0,
    });
  });

  it("leaves the claim and all balances unchanged when reward credit overflows", async () => {
    const db = await getTestDatabase();
    await db
      .update(mpvpBattleQueue)
      .set({ battleId: "combat" })
      .where(eq(mpvpBattleQueue.id, "q"));
    await db.update(clan).set({ points: 2147483647 }).where(eq(clan.id, "a"));
    await expect(rewardClanBattleVictory(db, "combat", "a")).rejects.toThrow();
    expect((await db.query.mpvpBattleQueue.findFirst())?.winnerId).toBeNull();
    expect(await storedClan()).toMatchObject({
      points: 2147483647,
      bank: 50,
      activityPoints: 0,
      pvpActivity: 0,
    });
  });

  it("does not reward an unrelated clan, missing combat or another battle type", async () => {
    const db = await getTestDatabase();
    await db
      .update(mpvpBattleQueue)
      .set({ battleId: "combat" })
      .where(eq(mpvpBattleQueue.id, "q"));
    expect(await rewardClanBattleVictory(db, "combat", "c")).toBe(false);
    expect(await rewardClanBattleVictory(db, "missing", "a")).toBe(false);
    await db
      .update(mpvpBattleQueue)
      .set({ battleType: "RAID_BATTLE" })
      .where(eq(mpvpBattleQueue.id, "q"));
    expect(await rewardClanBattleVictory(db, "combat", "a")).toBe(false);
    expect((await db.query.mpvpBattleQueue.findFirst())?.winnerId).toBeNull();
    expect(await storedClan()).toMatchObject({
      points: 100,
      bank: 50,
      activityPoints: 0,
      pvpActivity: 0,
    });
    expect(await db.query.clan.findFirst({ where: eq(clan.id, "c") })).toMatchObject({
      points: 100,
      bank: 50,
      activityPoints: 0,
      pvpActivity: 0,
    });
  });

  it("serializes payout against deletion without partial or duplicate rewards", async () => {
    const db = await getTestDatabase();
    for (let attempt = 0; attempt < 40; attempt++) {
      await db
        .update(clan)
        .set({ points: 100, bank: 50, activityPoints: 0, pvpActivity: 0 })
        .where(eq(clan.id, "a"));
      await db.insert(mpvpBattleQueue).values({
        id: "race",
        battleId: "combat",
        attackerEntityId: "a",
        defenderEntityId: "b",
      });
      const [paid, deleted] = await Promise.all([
        rewardClanBattleVictory(db, "combat", "a"),
        deleteClanBattle(db, { id: "race", battleId: "combat" }),
      ]);
      expect(deleted).toBe(true);
      expect(await storedClan()).toMatchObject({
        points: 100 + (paid ? CLAN_BATTLE_REWARD_POINTS : 0),
        bank: 50 + (paid ? CLAN_BATTLE_REWARD_RYO : 0),
        activityPoints: paid ? CLAN_BATTLE_REWARD_POINTS : 0,
        pvpActivity: paid ? 1 : 0,
      });
      expect(
        await db.query.mpvpBattleQueue.findFirst({
          where: eq(mpvpBattleQueue.id, "race"),
        }),
      ).toBeUndefined();
      expect(await rewardClanBattleVictory(db, "combat", "a")).toBe(false);
    }
  });

  for (const id of ["leader", "co", "enemy", "staff"]) {
    it(`allows ${id} to delete a pending battle`, async () => {
      const db = await getTestDatabase();
      await db
        .update(userData)
        .set({ status: "QUEUED" })
        .where(eq(userData.userId, "leader"));
      expect(
        (
          await (
            await callerFor(clanRouter, id)
          ).deleteClanBattle({ clanBattleId: "q" })
        ).success,
      ).toBe(true);
      expect(await storedUser("leader")).toMatchObject({
        status: "AWAKE",
        battleId: null,
      });
      expect(await db.query.mpvpBattleUser.findMany()).toHaveLength(0);
      expect(await db.query.mpvpBattleQueue.findMany()).toHaveLength(0);
    });
  }

  for (const id of ["member", "outsider"]) {
    it(`denies deletion by ${id}`, async () => {
      expect(
        (
          await (
            await callerFor(clanRouter, id)
          ).deleteClanBattle({ clanBattleId: "q" })
        ).success,
      ).toBe(false);
      expect(
        await (await getTestDatabase()).query.mpvpBattleQueue.findMany(),
      ).toHaveLength(1);
    });
  }

  it("wipes active combat and logs while preserving a participant's newer battle", async () => {
    const db = await getTestDatabase();
    await db
      .update(mpvpBattleQueue)
      .set({ battleId: "combat" })
      .where(eq(mpvpBattleQueue.id, "q"));
    await db.insert(battle).values({
      id: "combat",
      battleType: "CLAN_BATTLE",
      background: "default",
      usersState: [],
      usersEffects: [],
      groundEffects: [],
      extraState: {} as never,
    });
    await db.insert(battleHistory).values({
      battleId: "combat",
      attackedId: "leader",
      defenderId: "enemy",
      battleType: "CLAN_BATTLE",
    });
    await createAction(db, { id: "combat", battleType: "CLAN_BATTLE" } as never, [
      { battleRound: 1, battleVersion: 1, description: "action", appliedEffects: [] },
    ]);
    await db
      .update(userData)
      .set({ battleId: "combat", status: "BATTLE" })
      .where(eq(userData.userId, "leader"));
    await db
      .update(userData)
      .set({ battleId: "newer", status: "BATTLE" })
      .where(eq(userData.userId, "enemy"));
    expect(await deleteClanBattle(db, { id: "q", battleId: "combat" })).toBe(true);
    expect(await storedUser("leader")).toMatchObject({
      status: "AWAKE",
      battleId: null,
    });
    expect(await storedUser("enemy")).toMatchObject({
      status: "BATTLE",
      battleId: "newer",
    });
    await createAction(db, { id: "combat", battleType: "CLAN_BATTLE" } as never, [
      {
        battleRound: 2,
        battleVersion: 2,
        description: "late action",
        appliedEffects: [],
      },
    ]);
    expect(await db.query.battle.findMany()).toHaveLength(0);
    expect(await db.query.battleHistory.findMany()).toHaveLength(0);
    expect(await db.query.battleAction.findMany()).toHaveLength(0);
    expect(await rewardClanBattleVictory(db, "combat", "a")).toBe(false);
  });

  it("deletes concluded history without reversing rewards", async () => {
    const db = await getTestDatabase();
    await db
      .update(mpvpBattleQueue)
      .set({ battleId: "combat" })
      .where(eq(mpvpBattleQueue.id, "q"));
    await rewardClanBattleVictory(db, "combat", "a");
    expect(
      (
        await (
          await callerFor(clanRouter, "co")
        ).deleteClanBattle({ clanBattleId: "q" })
      ).success,
    ).toBe(true);
    expect(await storedClan()).toMatchObject({ points: 4100, bank: 1000050 });
  });

  it("cleans a join whose lobby was deleted after preload", async () => {
    const db = await getTestDatabase();
    const guarded = beforeStatements(db, userData, [
      () => deleteClanBattle(db, { id: "q", battleId: null }),
    ]);
    expect(
      (
        await callerForDatabase(clanRouter, "member", guarded).joinClanBattle({
          clanBattleId: "q",
        })
      ).success,
    ).toBe(false);
    expect(await storedUser("member")).toMatchObject({
      status: "AWAKE",
      battleId: null,
    });
    expect(await db.query.mpvpBattleUser.findMany()).toHaveLength(0);
  });

  it("cleans a challenge deleted before its initial member was inserted", async () => {
    const db = await getTestDatabase();
    await resetTables(mpvpBattleUser, mpvpBattleQueue);
    const staff = await callerFor(clanRouter, "staff");
    const guarded = beforeStatements(db, mpvpBattleUser, [
      async () => {
        // Hold the member insert until the parallel lobby insert becomes visible.
        let lobby = await db.query.mpvpBattleQueue.findFirst();
        for (let attempts = 0; !lobby && attempts < 100; attempts++) {
          await new Promise((resolve) => setTimeout(resolve, 1));
          lobby = await db.query.mpvpBattleQueue.findFirst();
        }
        expect(lobby).toBeDefined();
        if (!lobby) throw new Error("Challenge lobby was not published");
        expect(await db.query.mpvpBattleUser.findMany()).toHaveLength(0);
        expect((await staff.deleteClanBattle({ clanBattleId: lobby.id })).success).toBe(
          true,
        );
      },
    ]);
    const result = await callerForDatabase(clanRouter, "leader", guarded).challengeClan(
      { challengerClanId: "a", targetClanId: "b" },
    );
    const [user, lobbies, members] = await Promise.all([
      storedUser("leader"),
      db.query.mpvpBattleQueue.findMany(),
      db.query.mpvpBattleUser.findMany(),
    ]);
    expect({
      status: user?.status,
      battleId: user?.battleId,
      lobbies: lobbies.length,
      members: members.length,
      success: result.success,
    }).toEqual({
      status: "AWAKE",
      battleId: null,
      lobbies: 0,
      members: 0,
      success: false,
    });
    expect(result.message).toContain("deleted");
  });

  it("rejects stale pending deletion after startup reserves combat", async () => {
    const db = await getTestDatabase();
    await db
      .update(mpvpBattleQueue)
      .set({ battleId: "combat" })
      .where(eq(mpvpBattleQueue.id, "q"));
    expect(await deleteClanBattle(db, { id: "q", battleId: null })).toBe(false);
    expect(await db.query.mpvpBattleQueue.findMany()).toHaveLength(1);
  });

  it("rejects a stale combat ID and a lobby of another battle type", async () => {
    const db = await getTestDatabase();
    await db
      .update(mpvpBattleQueue)
      .set({ battleId: "newer" })
      .where(eq(mpvpBattleQueue.id, "q"));
    expect(await deleteClanBattle(db, { id: "q", battleId: "older" })).toBe(false);
    await db
      .update(mpvpBattleQueue)
      .set({ battleType: "RAID_BATTLE" })
      .where(eq(mpvpBattleQueue.id, "q"));
    expect(await deleteClanBattle(db, { id: "q", battleId: "newer" })).toBe(false);
    expect(await db.query.mpvpBattleQueue.findMany()).toHaveLength(1);
    expect(await db.query.mpvpBattleUser.findMany()).toHaveLength(1);
  });

  it("retries cleanup after deleting the lobby and waking queued members", async () => {
    const db = await getTestDatabase();
    await db
      .update(userData)
      .set({ status: "QUEUED" })
      .where(eq(userData.userId, "leader"));
    const guarded = beforeStatements(db, mpvpBattleUser, [
      async () => {
        expect(await db.query.mpvpBattleQueue.findMany()).toHaveLength(0);
        expect(await storedUser("leader")).toMatchObject({
          status: "AWAKE",
          battleId: null,
        });
        expect(await db.query.mpvpBattleUser.findMany()).toHaveLength(1);
        throw new Error("Deadlock found when trying to get lock");
      },
    ]);
    expect(await deleteClanBattle(guarded, { id: "q", battleId: null })).toBe(true);
    expect(await db.query.mpvpBattleUser.findMany()).toHaveLength(0);
    expect(await deleteClanBattle(db, { id: "q", battleId: null })).toBe(false);
  });

  it("keeps the durable deletion and membership after an unexpected wake-up failure", async () => {
    const db = await getTestDatabase();
    await db
      .update(userData)
      .set({ status: "QUEUED" })
      .where(eq(userData.userId, "leader"));
    await expect(
      deleteClanBattle(failStatements(db, userData), { id: "q", battleId: null }),
    ).rejects.toThrow("Statement failed on purpose");
    expect(await db.query.mpvpBattleQueue.findMany()).toHaveLength(0);
    expect(await db.query.mpvpBattleUser.findMany()).toHaveLength(1);
    expect(await storedUser("leader")).toMatchObject({
      status: "QUEUED",
      battleId: null,
    });
  });
});
