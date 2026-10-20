import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import * as nextServer from "next/server";
import { aiProfile, battle, battleAction, battleHistory, userData } from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { combatRouter, initiateBattle } from "@/server/api/routers/combat";
import { makeEffect } from "../../libs/combat/helpers/battleScenario";
import { insertUsers } from "../../setup/factories";
import { callerFor, callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

describeWithDatabase("lethal combat history", () => {
  let trigger: ReturnType<typeof vi.spyOn<Pusher, "trigger">>;
  beforeEach(async () => {
    await resetTables(battleAction, battleHistory, battle, aiProfile, userData);
    trigger = vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    vi.spyOn(nextServer, "after").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => Response.json(
      String(url).endsWith("/pipeline") ? [{ result: [59, 60] }] : { result: [59, 60] },
    ));
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["COMBAT", false, "killer"], ["ARENA", false, "killer"],
    ["COMBAT", true, "killer"], ["COMBAT", true, "victim"],
    ["ARENA", true, "killer"],
  ] as const)("saves the lethal %s action (auto=%s, viewer=%s) for history reload", async (battleType, auto, viewer) => {
    const snapshot = await startLethalBattle(battleType, auto);
    const caller = await callerFor(combatRouter, viewer);
    const result = await caller.performAction({ battleId: snapshot.id, version: 1,
      ...(auto ? {} : { actionId: "basicAttack", longitude: 1, latitude: 0 }) });
    expect(result, JSON.stringify(result)).toMatchObject({ updateClient: true, result: { outcome: viewer === "killer" ? "Won" : "Lost" } });
    const entries = await caller.getBattleEntries({ battleId: snapshot.id });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ userId: "killer", actionId: "basicAttack" });
    expect(entries[0]!.appliedEffects.some((effect) => effect.txt.includes("victim") && effect.txt.includes("damage"))).toBe(true);
  });

  it.each(["performAction", "getBattle"] as const)("%s notifies observers after a lethal insert that raced settlement", async (route) => {
    const snapshot = await startLethalBattle("COMBAT");
    const db = await getTestDatabase();
    let releaseInsert!: () => void;
    const insertGate = new Promise<void>((resolve) => { releaseInsert = resolve; });
    let insertReached!: () => void;
    const insertReady = new Promise<void>((resolve) => { insertReached = resolve; });
    if (route === "getBattle") {
      snapshot.usersState.forEach((user) => { user.round = user.userId === "killer" ? 1 : 0; });
      const old = new Date(Date.now() - 600_000);
      await db.update(battle).set({ usersState: snapshot.usersState, activeUserId: "victim",
        roundStartAt: old, updatedAt: old,
        usersEffects: [makeEffect("damage", { power: 8, calculation: "static", rounds: 3,
          statTypes: [], generalTypes: [], elements: [] }, { id: "lethal-dot", creatorId: "killer",
          targetId: "victim", targetType: "user", isNew: false, castThisRound: false,
          createdRound: 1, level: 1 })],
      }).where(eq(battle.id, snapshot.id));
    }
    const delayed = new Proxy(db, {
      get(target, key, receiver) {
        if (key === "insert") return (table: Parameters<typeof db.insert>[0]) => {
          if (table !== battleAction) return db.insert(table);
          return { values: (values: typeof battleAction.$inferInsert[]) => ({
            onDuplicateKeyUpdate: async (config: Parameters<ReturnType<ReturnType<typeof db.insert>["values"]>["onDuplicateKeyUpdate"]>[0]) => {
              insertReached();
              await insertGate;
              return db.insert(battleAction).values(values).onDuplicateKeyUpdate(config);
            },
          }) };
        };
        return Reflect.get(target, key, receiver);
      },
    });
    const actor = await callerForDatabase(combatRouter, route === "performAction" ? "killer" : "victim", delayed);
    const observer = await callerFor(combatRouter, route === "performAction" ? "victim" : "killer");
    const pending = route === "performAction"
      ? actor.performAction({ battleId: snapshot.id, version: snapshot.version,
        actionId: "basicAttack", longitude: 1, latitude: 0 })
      : actor.getBattle({ battleId: snapshot.id });
    try {
      await insertReady;
      const settled = await observer.getBattle({ battleId: snapshot.id });
      if (!settled.battle) throw new Error("Expected final battle snapshot");
      expect(settled.result?.outcome).toBe(route === "performAction" ? "Lost" : "Won");
      const incomplete = await observer.getBattleEntries({ battleId: snapshot.id });
      expect(incomplete.some((entry) => entry.appliedEffects.some((effect) => effect.txt.includes("victim") && effect.txt.includes("damage")))).toBe(false);
      trigger.mockClear();
      releaseInsert();
      const response = await pending;
      const finalBattle = "battleUpdate" in response ? response.battleUpdate : "battle" in response ? response.battle : null;
      if (!finalBattle) throw new Error("Expected lethal action");
      // The action notification has the version the victim already saw, so a
      // version-only client refresh would leave the incomplete history cached.
      expect(finalBattle.version).toBe(settled.battle.version);
      expect(Pusher.prototype.trigger).toHaveBeenCalledWith(snapshot.id, "event", { version: finalBattle.version });
      const history = await observer.getBattleEntries({ battleId: snapshot.id });
      expect(history.some((entry) => entry.appliedEffects.some((effect) => effect.txt.includes("victim") && effect.txt.includes("damage")))).toBe(true);
      expect((await observer.getBattle({ battleId: snapshot.id })).battle).toBeNull();
      expect(await observer.getBattleEntries({ battleId: snapshot.id })).toEqual(history);
    } finally {
      releaseInsert();
      await pending;
    }
  });


  it("announces a terminal action to humans who have already left the battle", async () => {
    const snapshot = await startLethalBattle("ARENA");
    const db = await getTestDatabase();
    const killer = snapshot.usersState.find((user) => user.userId === "killer")!;
    snapshot.usersState.push({ ...killer, userId: "departed", controllerId: "departed", leftBattle: true });
    await db.update(battle).set({ usersState: snapshot.usersState }).where(eq(battle.id, snapshot.id));
    const response = await (await callerFor(combatRouter, "killer")).performAction({
      battleId: snapshot.id, version: snapshot.version, actionId: "basicAttack", longitude: 1, latitude: 0,
    });
    if (!("battleUpdate" in response) || !response.battleUpdate) throw new Error("Expected lethal action");
    expect(response.result?.outcome).toBe("Won");
    expect(await db.query.battle.findFirst({ where: eq(battle.id, snapshot.id) })).toBeUndefined();
    expect(Pusher.prototype.trigger).toHaveBeenCalledWith(snapshot.id, "event", { version: response.battleUpdate.version });
  });

});

const startLethalBattle = async (battleType: "COMBAT" | "ARENA", auto = false) => {
    const db = await getTestDatabase();
    await insertUsers(["killer", "victim"].map((userId, i) => ({
      userId, username: userId, status: "AWAKE", rank: "JONIN", level: 100,
      isAi: i === 1 && battleType === "ARENA", defaultAutoCombat: false,
      villageId: i === 0 ? "red" : "blue", experience: 1000, pvpStreak: 0,
      sector: 335, curHealth: 5000, maxHealth: 5000, curChakra: 5000,
      maxChakra: 5000, curStamina: 5000, maxStamina: 5000,
    })));
    await db.insert(aiProfile).values({ id: "Default", userId: "default-ai", rules: [] });
    const started = await initiateBattle({ client: db, userIds: ["killer"], targetIds: ["victim"] }, battleType);
    expect(started.success, started.message).toBe(true);
    const snapshot = (await db.query.battle.findFirst({ where: eq(battle.id, started.battleId!) }))!;
    snapshot.usersState.forEach((user) => {
      user.initiative = user.userId === "killer" ? 20 : 10;
      user.longitude = user.userId === "killer" ? 0 : 1;
      user.latitude = 0;
      if (user.userId === "killer") user.isAutoCombat = auto;
      if (user.userId !== "killer") user.curHealth = 1;
    });
    await db.update(battle).set({ usersState: snapshot.usersState, activeUserId: "killer",
      createdAt: new Date(Date.now() - 60_000), roundStartAt: new Date(), updatedAt: new Date(),
    }).where(eq(battle.id, snapshot.id));
    return snapshot;
};
