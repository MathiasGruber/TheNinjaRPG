import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { battleHistory, battle, dungeon, dungeonRun, dungeonMember, userData, village, userRewards, item, jutsu, userItem, userJutsu } from "@/drizzle/schema";
import { dungeonRouter } from "@/server/api/routers/dungeon";
import { settleDungeonBattle, expireDungeonRun, rollbackDungeonStart } from "@/server/utils/dungeon";
import { dungeonContent, dungeonBattleState } from "../../setup/dungeon";
import { insertUsers, insertItems } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";
import { makeCompleteBattle, makeUser } from "../../libs/combat/helpers/battleScenario";

describeWithDatabase("Dungeon parties and settlement", () => {
  beforeEach(async () => {
    await resetTables(battleHistory, battle, dungeon, dungeonRun, dungeonMember, userData, village, userRewards, item, jutsu, userItem, userJutsu);
    await insertUsers(["a", "b", "c", "outsider"].map((id) => ({userId: id, username: id, status: "AWAKE", sector: 1, money: 0, experience: 0, earnedExperience: 0, villagePrestige: 0, villageId: "village"})));
    const db = await getTestDatabase();
    await db.insert(village).values({id: "village", name: "Village", sector: 1, kageId: "a"});
    await db.insert(dungeon).values({id: "definition", content: dungeonContent(), updatedAt: new Date()});
  });
  const lobby = async () => {
    const a = await callerFor(dungeonRouter, "a");
    const result = await a.create({id: "definition"});
    if (!result.success || !("id" in result)) throw Error("Lobby creation failed");
    return {a, id: result.id};
  };
  it("loads lobby membership and invitations through the state query", async () => {
    const {a, id} = await lobby(); const b = await callerFor(dungeonRouter, "b");
    await a.act({id, action:"invite", userId:"b"});
    expect((await a.getState()).runs[0]?.id).toBe(id);
    expect((await b.getState()).runs[0]?.id).toBe(id);
    const outsider = await callerFor(dungeonRouter, "outsider"); expect((await outsider.getState()).runs).toHaveLength(0);
  });
  it("reserves exactly one active party under simultaneous lobby creation", async () => {
    const a = await callerFor(dungeonRouter, "a");
    const results = await Promise.all([a.create({id: "definition"}), a.create({id: "definition"})]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    const db = await getTestDatabase(); expect(await db.query.dungeonRun.findMany()).toHaveLength(1);
  });
  it("requires an invitation, three members and unanimous readiness", async () => {
    const {a, id} = await lobby(); const b = await callerFor(dungeonRouter, "b");
    expect((await b.act({id, action: "accept"})).success).toBe(false);
    expect((await a.act({id, action: "invite", userId: "b"})).success).toBe(true);
    expect((await b.act({id, action: "accept"})).success).toBe(true);
    expect((await b.act({id, action: "pause"})).success).toBe(false);
    expect((await a.act({id, action: "start"})).success).toBe(false);
    expect((await a.claim({id})).success).toBe(false);
  });
  it("accepts only one of two simultaneous invitations into different parties", async () => {
    const {a, id} = await lobby(); const c = await callerFor(dungeonRouter, "c");
    const second = await c.create({id:"definition"}); if (!second.success || !("id" in second)) throw Error("Missing second lobby");
    await Promise.all([a.act({id, action:"invite", userId:"b"}), c.act({id:second.id, action:"invite", userId:"b"})]);
    const b = await callerFor(dungeonRouter,"b");
    const accepted = await Promise.all([b.act({id, action:"accept"}), b.act({id:second.id, action:"accept"})]);
    expect(accepted.filter((r) => r.success)).toHaveLength(1);
    const db = await getTestDatabase(); const runs = await db.query.dungeonRun.findMany();
    expect(runs.filter((r) => r.state.memberIds.includes("b"))).toHaveLength(1);
    expect(await db.query.dungeonMember.findMany({where:eq(dungeonMember.userId,"b")})).toHaveLength(1);
  });
  it("resets readiness on membership changes and allows remote invite acceptance", async () => {
    const {a, id} = await lobby(); await a.act({id, action: "ready"});
    await a.act({id, action: "invite", userId: "b"});
    const db = await getTestDatabase(); await db.update(userData).set({sector: 100}).where(eq(userData.userId, "b"));
    const b = await callerFor(dungeonRouter, "b"); expect((await b.act({id, action: "accept"})).success).toBe(true);
    expect((await db.query.dungeonRun.findFirst({where: eq(dungeonRun.id, id)}))?.state.readyIds).toHaveLength(0);
  });
  it("grants the configured rewards once when claims race", async () => {
    const {a, id} = await lobby(); const db = await getTestDatabase();
    await db.update(dungeonRun).set({status: "COMPLETED", state: {...dungeonBattleState().runState, memberIds: ["a"], floor: 5, clearedFloors: [0,1,2,3,4]}}).where(eq(dungeonRun.id, id));
    await Promise.all([a.claim({id}), a.claim({id})]);
    const user = await db.query.userData.findFirst({where: eq(userData.userId, "a")});
    expect(user?.money).toBe(100); expect(user?.earnedExperience).toBe(10); expect(user?.villagePrestige).toBe(2);
    expect((await db.query.village.findFirst())?.tokens).toBe(5);
    expect((await a.claim({id})).success).toBe(true);
    expect((await db.query.userData.findFirst({where: eq(userData.userId, "a")}))?.money).toBe(100);
  });
  it("delivers item and jutsu drops in the same transaction as the receipt", async () => {
    const {a, id} = await lobby(); const db = await getTestDatabase();
    await insertItems([{id: "drop", canStack: false}]);
    await db.insert(jutsu).values({id: "technique", name: "Technique", description: "Technique", battleDescription: "Technique", image: "/jutsu.png", effects: [], target: "SELF", range: 0, requiredRank: "STUDENT", jutsuType: "NORMAL"});
    const content = dungeonContent(); content.rewards.drops = [{type: "item", id: "drop", chance: 100}, {type: "jutsu", id: "technique", chance: 100}];
    await db.update(dungeonRun).set({content, status: "COMPLETED", state: {...dungeonBattleState().runState, memberIds: ["a"], floor: 5, clearedFloors: [0,1,2,3,4]}}).where(eq(dungeonRun.id, id));
    await Promise.all([a.claim({id}), a.claim({id})]);
    expect(await db.query.userItem.findMany({where:eq(userItem.userId,"a")})).toHaveLength(1);
    expect(await db.query.userJutsu.findMany({where:eq(userJutsu.userId,"a")})).toHaveLength(1);
    expect((await db.query.dungeonMember.findFirst())?.reward).toMatchObject({items:["drop"], jutsus:["technique"]});
    expect((await db.query.userData.findFirst({where:eq(userData.userId,"a")}))?.money).toBe(100);
  });
  it("settles a party floor once, revives everyone and preserves incomplete reward gates", async () => {
    const db = await getTestDatabase();
    const meta = dungeonBattleState();
    await db.insert(dungeonRun).values({id: "run", dungeonId: "definition", leaderId: "a", content: dungeonContent(), state: meta.runState, status: "FIGHTING", version: 1, battleId: "fight", expiresAt: new Date(meta.expiresAt), createdAt: new Date()});
    await db.update(userData).set({status: "BATTLE", battleId: "fight", curHealth: 0, curEnergy:0, maxEnergy:100, regeneration:1, regenAt:new Date(Date.now()-180000)}).where(eq(userData.villageId, "village"));
    const fight = makeCompleteBattle({id: "fight", battleType: "QUEST", version: 0, round: 0, width: 12, height: 10, rewardScaling: 0, forceKeepPools: true, activeUserId: "a", createdAt: new Date(), updatedAt: new Date(), roundStartAt: new Date(), background: "default", usersState: [makeUser({userId: "a", direction: "left"}), makeUser({userId: "b", direction: "left", curHealth: 0}), makeUser({userId: "c", direction: "left"}), makeUser({userId: "enemy", direction: "right", isAi: true, curHealth: 0})], extraState: {dungeon: meta, energyRegeneration:{a:2,b:3,c:4},energyCapacity:{a:100,b:100,c:100}}});
    await db.insert(battle).values(fight);
    const results = await Promise.all([settleDungeonBattle(db, structuredClone(fight), 0), settleDungeonBattle(db, structuredClone(fight), 0)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.query.dungeonRun.findFirst())?.state.floor).toBe(1);
    const users = await db.query.userData.findMany({where: eq(userData.battleId, "fight")}); expect(users).toHaveLength(1); // Unrelated accounts are never released.
    const revived = await db.query.userData.findFirst({where: eq(userData.userId, "b")}); expect(revived?.status).toBe("AWAKE"); expect(revived?.curHealth).toBe(revived?.maxHealth); expect(revived?.curEnergy).toBeGreaterThanOrEqual(9); expect(revived?.curEnergy).toBeLessThan(9.1);
  });
  it("compensates a partially committed start before reopening the lobby", async () => {
    const {id} = await lobby(); const db=await getTestDatabase(); const original=await db.query.dungeonRun.findFirst(); if (!original) throw Error("Missing run");
    await db.update(dungeonRun).set({status:"FIGHTING",battleId:"partial",version:original.version+1, expiresAt:new Date(Date.now()+3600000)}).where(eq(dungeonRun.id,id));
    await db.insert(battle).values({id:"partial",battleType:"QUEST",background:"default",usersState:[],usersEffects:[],groundEffects:[],extraState:dungeonBattleState() as never,createdAt:new Date(),updatedAt:new Date(),roundStartAt:new Date()});
    await db.insert(battleHistory).values({battleId:"partial",attackedId:"a",defenderId:"b",battleType:"QUEST"});
    await db.update(userData).set({status:"BATTLE",battleId:"partial"}).where(eq(userData.userId,"a"));
    await rollbackDungeonStart(db,original,"partial",original.version+1);
    expect(await db.query.battle.findMany()).toHaveLength(0);expect(await db.query.battleHistory.findMany()).toHaveLength(0);
    const restored=await db.query.dungeonRun.findFirst();expect(restored?.status).toBe("LOBBY");expect(restored?.expiresAt).toBeNull();
    expect((await db.query.userData.findFirst({where:eq(userData.userId,"a")}))?.status).toBe("AWAKE");
  });
  it("expires paused runs and releases all active memberships", async () => {
    const {id} = await lobby(); const db = await getTestDatabase();
    await db.update(dungeonRun).set({status: "PAUSED", expiresAt: new Date(0)}).where(eq(dungeonRun.id, id));
    const run = await db.query.dungeonRun.findFirst(); if (!run) throw Error("Missing run");
    await Promise.all([expireDungeonRun(db, run), expireDungeonRun(db, run)]);
    expect((await db.query.dungeonRun.findFirst())?.status).toBe("ENDED");
    expect((await db.query.dungeonMember.findFirst())?.activeUserId).toBeNull();
  });
});
