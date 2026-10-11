import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import * as nextServer from "next/server";
import { SHRINE_BATTLE_LOBBY_SECONDS } from "@/drizzle/constants";
import {
  aiProfile, anbuSquad, battle, battleAction, battleHistory, clan,
  mpvpBattleQueue, mpvpBattleUser, userData, village, villageAlliance,
} from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { combatRouter, initiateBattle } from "@/server/api/routers/combat";
import { shrineRouter } from "@/server/api/routers/shrine";
import { insertUsers } from "../../setup/factories";
import {
  callerFor, describeWithDatabase, getTestDatabase, resetTables,
} from "../../setup/testDatabase";

const participants = ["credit-actor", "credit-ally", "credit-enemy"];
const winners = participants.slice(0, 2);

const factionTotals = async (userId: string) => {
  const db = await getTestDatabase();
  const [home, squad, family] = await Promise.all([
    db.query.village.findFirst({ where: eq(village.id, userId) }),
    db.query.anbuSquad.findFirst({ where: eq(anbuSquad.id, userId) }),
    db.query.clan.findFirst({ where: eq(clan.id, userId) }),
  ]);
  return { tokens: home!.tokens, anbuPoints: squad!.points, anbuActivity: squad!.pvpActivity,
    clanPoints: family!.points, clanActivityPoints: family!.activityPoints, clanActivity: family!.pvpActivity };
};

describeWithDatabase("combat team faction rewards", () => {
  beforeEach(async () => {
    await resetTables(battleAction, battleHistory, battle, mpvpBattleUser, mpvpBattleQueue,
      aiProfile, userData, clan, anbuSquad, villageAlliance, village);
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    vi.spyOn(nextServer, "after").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => Response.json(
      String(url).endsWith("/pipeline") ? [{ result: [59, 60] }] : { result: [59, 60] },
    ));
    const db = await getTestDatabase();
    await db.insert(village).values(participants.map((id, index) => ({
      id, name: id, sector: index + 1, kageId: id, tokens: 1000,
    })));
    await db.insert(clan).values(winners.map((id) => ({
      id, name: id, image: "", villageId: id, founderId: id, leaderId: id,
      leaderOrderId: `${id}-order`, points: 10, activityPoints: 20, pvpActivity: 4,
    })));
    await db.insert(anbuSquad).values(winners.map((id) => ({
      id, name: id, image: "", villageId: id, leaderId: id, leaderOrderId: `${id}-order`,
      kageOrderId: `${id}-kage-order`, points: 30, pvpActivity: 3,
    })));
    await insertUsers(participants.map((userId) => ({
      userId, username: userId, villageId: userId, status: "QUEUED", rank: "JONIN",
      clanId: winners.includes(userId) ? userId : null,
      anbuId: winners.includes(userId) ? userId : null,
      experience: 1000, pvpStreak: 1, curHealth: 100, maxHealth: 100,
      curChakra: 100, maxChakra: 100, curStamina: 100, maxStamina: 100, sector: 335,
    })));
    await db.insert(aiProfile).values({ id: "Default", userId: "default-ai", rules: [] });
    await db.insert(villageAlliance).values({ id: "credit-hostile", villageIdA: participants[0]!, villageIdB: participants[2]!, status: "ENEMY" });
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["SHRINE_WAR", "COMBAT"] as const)(
    "%s pays acting and polling teammates once after the battle claim",
    async (battleType) => {
      const db = await getTestDatabase();
      const actorId = participants[0]!;
      const allyId = participants[1]!;
      const enemyId = participants[2]!;
      if (battleType === "SHRINE_WAR") {
        await db.insert(mpvpBattleQueue).values({ id: "credit-lobby", battleType: "SHRINE_BATTLE",
          attackerEntityId: actorId, defenderEntityId: enemyId, sector: 335,
          createdAt: new Date(Date.now() - (SHRINE_BATTLE_LOBBY_SECONDS + 1) * 1000) });
        await db.insert(mpvpBattleUser).values(participants.map((userId, index) => ({
          id: `${userId}-queue`, clanBattleId: "credit-lobby", userId,
          side: index < 2 ? "ATTACKER" as const : "DEFENDER" as const, slot: index % 2,
        })));
      } else {
        await db.update(userData).set({ status: "AWAKE" });
      }
      const started = battleType === "SHRINE_WAR"
        ? await (await callerFor(shrineRouter, actorId)).initiateShrineBattle({ shrineBattleId: "credit-lobby" })
        : await initiateBattle({ client: db, userIds: winners, targetIds: [enemyId] }, "COMBAT");
      expect(started.success, started.message).toBe(true);
      const saved = (await db.query.battle.findFirst({ where: eq(battle.id, started.battleId!) }))!;
      expect(saved.usersState.find((u) => u.userId === allyId)?.direction).toBe(
        saved.usersState.find((u) => u.userId === actorId)?.direction,
      );
      // The last opponent has just fallen; both surviving teammates must settle.
      saved.usersState.find((u) => u.userId === enemyId)!.curHealth = 0;
      await db.update(battle).set({ usersState: saved.usersState, activeUserId: actorId,
        createdAt: new Date(Date.now() - 1000), roundStartAt: new Date(),
        updatedAt: new Date(Date.now() + 1000) }).where(eq(battle.id, saved.id));
      const actor = await callerFor(combatRouter, actorId);
      const ally = await callerFor(combatRouter, allyId);
      const acting = await actor.performAction({ battleId: saved.id, version: saved.version });
      if (!("result" in acting) || !acting.result) throw new Error("Expected acting settlement");
      const polls = await Promise.all([
        ally.getBattle({ battleId: saved.id }), ally.getBattle({ battleId: saved.id }),
      ]);
      expect(polls.filter((p) => p.result)).toHaveLength(1);
      const polling = polls.find((p) => p.result)!.result!;
      for (const [userId, result] of [[actorId, acting.result], [allyId, polling]] as const) {
        expect(result.didWin).toBe(1);
        expect(result.clanPoints).toBeGreaterThan(0);
        if (battleType === "COMBAT") {
          expect(result.villageTokens).toBeGreaterThan(0);
          expect(result.anbuPoints).toBeGreaterThan(0);
        }
        expect(await factionTotals(userId)).toEqual({ tokens: 1000 + result.villageTokens,
          anbuPoints: 30 + result.anbuPoints, anbuActivity: 3 + Number(result.pvpStreak > 0),
          clanPoints: 10 + result.clanPoints, clanActivityPoints: 20 + result.clanPoints, clanActivity: 5 });
        expect(await db.query.userData.findFirst({ where: eq(userData.userId, userId) })).toMatchObject({ status: "AWAKE", battleId: null });
        const paid = await factionTotals(userId);
        const api = userId === actorId ? actor : ally;
        expect((await api.getBattle({ battleId: saved.id })).result).toBeNull();
        await api.performAction({ battleId: saved.id, version: saved.version });
        expect(await factionTotals(userId)).toEqual(paid);
      }
      expect(polling.clanPoints).toBe(acting.result.clanPoints);
    },
  );
});
