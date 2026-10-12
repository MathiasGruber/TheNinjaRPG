import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { actionLog, battleHistory, battle, dungeon, dungeonRun, dungeonMember, userData, village, userRewards, item, jutsu, userItem, userJutsu } from "@/drizzle/schema";
import { dungeonRouter } from "@/server/api/routers/dungeon";
import type { DrizzleClient } from "@/server/db";
import { settleDungeonBattle, expireDungeonRun, rollbackDungeonStart } from "@/server/utils/dungeon";
import { dungeonContent, dungeonBattleState } from "../../setup/dungeon";
import { insertUsers, insertItems } from "../../setup/factories";
import { callerFor, callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";
import { makeCompleteBattle, makeUser } from "../../libs/combat/helpers/battleScenario";

describeWithDatabase("Dungeon parties and settlement", () => {
  beforeEach(async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (typeof init?.body !== "string" || !init.body.includes("trpc-ratelimit")) {
        throw new Error("Unexpected HTTP request in dungeon tests");
      }
      const commands = JSON.parse(init.body) as unknown[];
      const resultFor = (command: unknown[]) => ({
        result: command[0] === "evalsha" || command[0] === "eval" ? [59, 60] : 1,
      });
      return Response.json(Array.isArray(commands[0])
        ? commands.map((command) => resultFor(command as unknown[]))
        : resultFor(commands));
    });
    await resetTables(actionLog, battleHistory, battle, dungeon, dungeonRun, dungeonMember, userData, village, userRewards, item, jutsu, userItem, userJutsu);
    await insertUsers(["a", "b", "c", "outsider"].map((id) => ({userId: id, username: id, status: "AWAKE", sector: 1, money: 0, experience: 0, earnedExperience: 0, villagePrestige: 0, villageId: "village"})));
    const db = await getTestDatabase();
    await db.insert(village).values({id: "village", name: "Village", sector: 1, kageId: "a"});
    await db.insert(dungeon).values({id: "definition", content: dungeonContent(), updatedAt: new Date()});
  });
  afterEach(() => vi.restoreAllMocks());
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
  it("keeps an older accepted party and its unclaimed rewards visible beyond twenty invitations", async () => {
    const db = await getTestDatabase();
    await insertUsers(Array.from({length: 21}, (_, i) => ({userId: `leader-${i}`, username: `leader-${i}`, status: "AWAKE", sector: 1})));
    const member = await callerFor(dungeonRouter, "b");
    let acceptedId = "";
    for (let i = 0; i < 21; i++) {
      const leader = await callerFor(dungeonRouter, `leader-${i}`);
      const created = await leader.create({id: "definition"});
      if (!created.success || !("id" in created)) throw Error("Lobby creation failed");
      expect((await leader.act({id: created.id, action: "invite", userId: "b"})).success).toBe(true);
      if (i === 0) acceptedId = created.id;
    }
    expect((await member.act({id: acceptedId, action: "accept"})).success).toBe(true);
    const state = await member.getState();
    expect(state.runs).toHaveLength(20);
    expect(state.runs.some((r) => r.id === acceptedId)).toBe(true);
    expect(state.members).toContainEqual(expect.objectContaining({runId: acceptedId, activeUserId: "b"}));
    expect((await member.create({id: "definition"})).success).toBe(false);

    const run = await db.query.dungeonRun.findFirst({where: eq(dungeonRun.id, acceptedId)});
    if (!run) throw Error("Missing accepted run");
    await db.update(dungeonRun).set({status: "COMPLETED", state: {...run.state, floor: 5, clearedFloors: [0,1,2,3,4]}}).where(eq(dungeonRun.id, acceptedId));
    expect((await member.getState()).runs).toContainEqual(expect.objectContaining({id: acceptedId, status: "COMPLETED"}));
    expect((await member.claim({id: acceptedId})).success).toBe(true);
    expect((await db.query.dungeonMember.findFirst({where: eq(dungeonMember.activeUserId, "b")}))).toBeUndefined();
    expect((await db.query.userData.findFirst({where: eq(userData.userId, "b")}))?.money).toBe(100);
  });
  it("reserves exactly one active party under simultaneous lobby creation", async () => {
    const db = await getTestDatabase();
    const a = callerForDatabase(dungeonRouter, "a", withoutTransactions(db));
    const results = await Promise.all([a.create({id: "definition"}), a.create({id: "definition"})]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(await db.query.dungeonRun.findMany()).toHaveLength(1);
    expect(await db.query.dungeonMember.findMany({where: eq(dungeonMember.activeUserId, "a")})).toHaveLength(1);
  });
  it.each([false, true])("cleans only an empty failed lobby, preserving a committed membership (%p)", async (committed) => {
    const db = await getTestDatabase();
    const failing = new Proxy(withoutTransactions(db), {
      get(target, key, receiver) {
        if (key === "insert") return (table: Parameters<typeof db.insert>[0]) =>
          table === dungeonMember
            ? {values: async (values: typeof dungeonMember.$inferInsert) => {
                if (committed) await target.insert(dungeonMember).values(values);
                throw new Error("Injected membership failure");
              }}
            : target.insert(table);
        return Reflect.get(target, key, receiver);
      },
    });
    const a = callerForDatabase(dungeonRouter, "a", failing);
    await expect(a.create({id: "definition"})).rejects.toThrow("Injected membership failure");
    expect(await db.query.dungeonRun.findMany()).toHaveLength(committed ? 1 : 0);
    expect(await db.query.dungeonMember.findMany()).toHaveLength(committed ? 1 : 0);
    expect((await (await callerFor(dungeonRouter, "a")).getState()).runs).toHaveLength(committed ? 1 : 0);
  });
  it("saves content and its audit entry without a transaction", async () => {
    const db = await getTestDatabase();
    await db.update(userData).set({role: "CONTENT"}).where(eq(userData.userId, "a"));
    await insertUsers([{userId: "enemy", isAi: true}]);
    const a = callerForDatabase(dungeonRouter, "a", withoutTransactions(db));
    const content = dungeonContent(); content.name = "Changed dungeon";
    expect((await a.save({id: "definition", content})).success).toBe(true);
    expect((await db.query.dungeon.findFirst())?.content.name).toBe(content.name);
    expect(await db.query.actionLog.findMany()).toContainEqual(expect.objectContaining({relatedId: "definition", tableName: "dungeon"}));
  });
  it("uses only the run CAS for invitations, readiness and pause controls", async () => {
    const db = await getTestDatabase();
    const a = callerForDatabase(dungeonRouter, "a", withoutTransactions(db));
    const b = callerForDatabase(dungeonRouter, "b", withoutTransactions(db));
    const created = await a.create({id: "definition"});
    if (!created.success || !("id" in created)) throw Error("Missing lobby");
    const id = created.id;
    expect((await a.act({id, action: "invite", userId: "b"})).success).toBe(true);
    expect((await b.act({id, action: "decline"})).success).toBe(true);
    expect((await a.act({id, action: "invite", userId: "b"})).success).toBe(true);
    expect((await a.act({id, action: "remove", userId: "b"})).success).toBe(true);
    expect((await a.act({id, action: "ready"})).success).toBe(true);
    expect((await a.act({id, action: "unready"})).success).toBe(true);
    await db.update(dungeonRun).set({status: "BETWEEN"}).where(eq(dungeonRun.id, id));
    expect((await a.act({id, action: "pause"})).success).toBe(true);
    expect((await a.act({id, action: "resume"})).success).toBe(true);
    const run = await db.query.dungeonRun.findFirst();
    expect(run).toMatchObject({status: "BETWEEN", version: 8});
    expect(run?.state).toMatchObject({memberIds: ["a"], invitedIds: [], readyIds: []});
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
  it("rolls back failed grants and delivers item and jutsu drops with the receipt once", async () => {
    const {a, id} = await lobby(); const db = await getTestDatabase();
    await insertItems([{id: "drop", canStack: false}]);
    await db.insert(jutsu).values({id: "technique", name: "Technique", description: "Technique", battleDescription: "Technique", image: "/jutsu.png", effects: [], target: "SELF", range: 0, requiredRank: "STUDENT", jutsuType: "NORMAL"});
    const content = dungeonContent(); content.rewards.drops = [{type: "item", id: "drop", chance: 100}, {type: "jutsu", id: "technique", chance: 100}];
    await db.update(dungeonRun).set({content, status: "COMPLETED", state: {...dungeonBattleState().runState, memberIds: ["a"], floor: 5, clearedFloors: [0,1,2,3,4]}}).where(eq(dungeonRun.id, id));
    // Fail after scalar and jutsu grants, so the receipt cannot hide a partial reward.
    const failing = new Proxy(db, {
      get(target, key, receiver) {
        if (key === "transaction") return (callback: Parameters<typeof db.transaction>[0]) =>
          target.transaction(tx => callback(new Proxy(tx, {
            get(transaction, property, txReceiver) {
              if (property === "insert") return (table: Parameters<typeof tx.insert>[0]) => {
                if (table === userItem) throw new Error("Injected item grant failure");
                return transaction.insert(table);
              };
              return Reflect.get(transaction, property, txReceiver);
            },
          })));
        return Reflect.get(target, key, receiver);
      },
    });
    await expect(callerForDatabase(dungeonRouter, "a", failing).claim({id})).rejects.toThrow("Injected item grant failure");
    expect(await db.query.dungeonMember.findFirst()).toMatchObject({reward: null, activeUserId: "a"});
    expect((await db.query.userData.findFirst({where:eq(userData.userId,"a")}))?.money).toBe(0);
    expect((await db.query.village.findFirst())?.tokens).toBe(0);
    expect(await db.query.userJutsu.findMany()).toHaveLength(0);
    expect(await db.query.userItem.findMany()).toHaveLength(0);
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
  it("compensates competing partial starts without transactions and reopens once", async () => {
    const {db, original} = await interruptedStart();
    await Promise.all([rollbackDungeonStart(withoutTransactions(db),original,"partial",1), rollbackDungeonStart(withoutTransactions(db),original,"partial",1)]);
    expect(await db.query.battle.findMany()).toHaveLength(0);expect(await db.query.battleHistory.findMany()).toHaveLength(0);
    const restored=await db.query.dungeonRun.findFirst();expect(restored?.status).toBe("LOBBY");expect(restored?.expiresAt).toBeNull();expect(restored?.version).toBe(2);
    expect((await db.query.userData.findMany({where: inArray(userData.userId, original.state.memberIds)})).every(user => user.status === "AWAKE" && user.battleId === null)).toBe(true);
  });
  it("cannot reopen or wake players from a newer battle using stale rollback state", async () => {
    const {db, original} = await interruptedStart();
    await db.update(dungeonRun).set({battleId: "new", version: 3}).where(eq(dungeonRun.id, original.id));
    await db.update(userData).set({battleId: "new"}).where(eq(userData.userId, "b"));
    await db.insert(battle).values(makeCompleteBattle({id: "new", battleType: "QUEST", background: "default", createdAt: new Date(), updatedAt: new Date(), roundStartAt: new Date()}));
    await rollbackDungeonStart(withoutTransactions(db), original, "partial", 1);
    expect(await db.query.dungeonRun.findFirst()).toMatchObject({battleId: "new", version: 3, status: "FIGHTING"});
    expect(await db.query.userData.findFirst({where: eq(userData.userId, "b")})).toMatchObject({battleId: "new", status: "BATTLE"});
    expect(await db.query.battle.findFirst({where: eq(battle.id, "new")})).toBeDefined();
  });
  it.each(["wake", "history"] as const)("keeps a failed %s cleanup recoverable through getState", async (failure) => {
    const {db, original} = await interruptedStart();
    const failing = new Proxy(withoutTransactions(db), {
      get(target, key, receiver) {
        if (key === "update" && failure === "wake") return (table: Parameters<typeof db.update>[0]) =>
          table === userData ? {set: () => ({where: () => Promise.reject(new Error("Injected cleanup failure"))})} : target.update(table);
        if (key === "delete" && failure === "history") return (table: Parameters<typeof db.delete>[0]) =>
          table === battleHistory ? {where: () => Promise.reject(new Error("Injected cleanup failure"))} : target.delete(table);
        return Reflect.get(target, key, receiver);
      },
    });
    await expect(rollbackDungeonStart(failing, original, "partial", 1)).rejects.toThrow("Injected cleanup failure");
    expect((await db.query.dungeonRun.findFirst())?.status).toBe("FIGHTING");
    expect(await db.query.battle.findMany()).toHaveLength(0);
    const a = callerForDatabase(dungeonRouter, "a", withoutTransactions(db));
    expect((await a.getState()).runs[0]).toMatchObject({status: "LOBBY", battleId: null, expiresAt: null, version: 2});
    expect(await db.query.battleHistory.findMany()).toHaveLength(0);
    expect((await db.query.userData.findMany({where: inArray(userData.userId, original.state.memberIds)})).every(user => user.status === "AWAKE" && user.battleId === null)).toBe(true);
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

/** Assert that a procedure's ordinary guarded writes never acquire a transaction session. */
const withoutTransactions = (db: DrizzleClient) => new Proxy(db, {
  get(target, key, receiver) {
    if (key === "transaction") return () => { throw new Error("Unexpected dungeon transaction"); };
    return Reflect.get(target, key, receiver);
  },
});

/** Model a start whose battle and user writes committed before its caller failed. */
const interruptedStart = async () => {
  const db = await getTestDatabase();
  const original: typeof dungeonRun.$inferSelect = {
    id: "run", dungeonId: "definition", leaderId: "a", content: dungeonContent(), state: dungeonBattleState().runState,
    status: "LOBBY", version: 0, battleId: null, expiresAt: null, createdAt: new Date(),
  };
  await db.insert(dungeonRun).values({...original, status: "FIGHTING", version: 1, battleId: "partial", expiresAt: new Date(Date.now() + 3600000), state: {...original.state, entryStartedAt: Date.now() - 120000, entryPreviousDeadline: null}});
  await db.insert(dungeonMember).values(original.state.memberIds.map(userId => ({runId: original.id, userId, activeUserId: userId})));
  await db.insert(battle).values(makeCompleteBattle({id: "partial", battleType: "QUEST", background: "default", createdAt: new Date(), updatedAt: new Date(), roundStartAt: new Date()}));
  await db.insert(battleHistory).values({battleId: "partial", attackedId: "a", defenderId: "b", battleType: "QUEST"});
  await db.update(userData).set({status: "BATTLE", battleId: "partial"}).where(inArray(userData.userId, original.state.memberIds));
  return {db, original};
};
