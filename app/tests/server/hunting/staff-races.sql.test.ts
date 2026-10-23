import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { actionLog, aiProfile, battle, battleHistory, huntingHabitat, huntingProgress, huntingReceipt, huntingSession, item, mpvpBattleUser, questHistory, rankedPvpQueue, sectorMap, storeUserIdAlias, userData, userItem } from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import type { CompleteBattle } from "@/libs/combat/types";
import { combatRouter } from "@/server/api/routers/combat";
import { huntingRouter } from "@/server/api/routers/hunting";
import { itemRouter } from "@/server/api/routers/item";
import { profileRouter } from "@/server/api/routers/profile";
import { staffRouter } from "@/server/api/routers/staff";
import type { DrizzleClient } from "@/server/db";
import { insertItems, insertUsers } from "../../setup/factories";
import { huntingContract, huntingHabitatContent, huntingMap } from "../../setup/hunting";
import { beforeStatements } from "../../setup/statements";
import { callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

describeWithDatabase("staff changes during hunting admission", () => {
  beforeEach(async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json([{ result: [59, 60] }]));
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    await resetTables(actionLog, aiProfile, battle, battleHistory, huntingHabitat, huntingProgress, huntingReceipt, huntingSession, item, mpvpBattleUser, questHistory, rankedPvpQueue, sectorMap, storeUserIdAlias, userData, userItem);
    await insertUsers([
      { userId: "hunter", username: "Hunter", occupation: "HUNTER", status: "AWAKE", huntingExperience: 123, sector: 1, rank: "JONIN", level: 50, isOutlaw: true, regeneration: 0 },
      { userId: "enemy", isAi: true },
      { userId: "staff", username: "Terriator", role: "CODING-ADMIN" },
    ]);
    await insertItems([{ id: "hide", canBeHunted: true }, { id: "tusk", canBeHunted: true }]);
    const db = await getTestDatabase();
    await db.insert(aiProfile).values({ id: "Default", userId: "default-ai", rules: [] });
    await db.insert(huntingHabitat).values({ id: "forest", content: huntingHabitatContent(), updatedAt: new Date() });
    await db.insert(sectorMap).values({ id: "map", sector: 1, name: "Forest", width: 1, height: 1, status: "PUBLISHED", normalizedJson: huntingMap() });
  });
  afterEach(() => vi.restoreAllMocks());

  it("assigns distinct contract IDs to concurrent saves with the same draft ID", async () => {
    const db = await getTestDatabase();
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => { release = resolve; });
    const habitatQuery = new Proxy(db.query.huntingHabitat, { get(target, key, receiver) {
      if (key === "findMany") return async (...args: Parameters<typeof target.findMany>) => {
        const rows = await target.findMany(...args);
        if (++reads === 2) release();
        await bothRead;
        return rows;
      };
      return Reflect.get(target, key, receiver);
    } });
    const query = new Proxy(db.query, { get(target, key, receiver) {
      return key === "huntingHabitat" ? habitatQuery : Reflect.get(target, key, receiver);
    } });
    const client = new Proxy(db, { get(target, key, receiver) {
      return key === "query" ? query : Reflect.get(target, key, receiver);
    } });
    const staff = callerForDatabase(huntingRouter, "staff", client);
    const saved = await Promise.all(["First", "Second"].map((name) => {
      const content = huntingHabitatContent();
      content.name = name;
      content.contracts[0]!.id = "draft-contract";
      return staff.save({ content });
    }));
    const habitats = saved.map((result) => {
      expect(result.success).toBe(true);
      if (!("content" in result)) throw Error("Habitat save failed");
      expect(result.content.contracts[0]!.id).not.toBe("draft-contract");
      return result;
    });
    const [first, second] = habitats as [typeof habitats[number], typeof habitats[number]];
    expect(first.content.contracts[0]!.id).not.toBe(second.content.contracts[0]!.id);
    const logs = await db.query.actionLog.findMany();
    for (const habitat of habitats) {
      expect(await db.query.huntingHabitat.findFirst({ where: eq(huntingHabitat.id, habitat.id) })).toMatchObject({ content: habitat.content });
      expect(logs.find((log) => log.relatedId === habitat.id)?.changes).toEqual([JSON.stringify(habitat.content)]);
    }
    const hunter = callerForDatabase(huntingRouter, "hunter", db);
    expect((await hunter.accept({ habitatId: first.id, contractId: first.content.contracts[0]!.id, version: null })).success).toBe(true);
    await db.update(huntingProgress).set({ used: 2 });
    const session = (await db.query.huntingSession.findFirst())!;
    expect(await hunter.accept({ habitatId: second.id, contractId: second.content.contracts[0]!.id, version: session.version })).toMatchObject({ success: true, message: expect.stringContaining("Contract accepted") });
    expect(await db.query.huntingSession.findFirst()).toMatchObject({ habitatId: second.id });
    expect((await db.query.huntingProgress.findMany()).map((p) => p.used).sort()).toEqual([0, 2]);
  });

  it("retains existing contract IDs and allowances when saving the returned draft again", async () => {
    const db = await getTestDatabase();
    await db.insert(huntingProgress).values({ userId: "hunter", contractId: "contract", used: 2 });
    const content = huntingHabitatContent();
    content.contracts[0]!.hunts = 2;
    content.contracts.push({ ...content.contracts[0]!, id: "new-draft" });
    const staff = callerForDatabase(huntingRouter, "staff", db);
    const first = await staff.save({ id: "forest", content });
    if (!("content" in first)) throw Error("Habitat save failed");
    expect(first.content.contracts[0]!.id).toBe("contract");
    expect(first.content.contracts[1]!.id).not.toBe("new-draft");
    const progress = (await db.query.huntingProgress.findFirst())!;
    expect(progress).toMatchObject({ used: 2, version: 1 });
    expect(progress.cooldownUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(await staff.save({ id: first.id, content: first.content })).toMatchObject({ success: true, content: first.content });
    expect(await db.query.huntingProgress.findFirst()).toEqual(progress);
    expect(await staff.save({ content: first.content })).toMatchObject({ success: false, message: "A contract ID is already used by another habitat." });
  });

  const prepare = async () => {
    const db = await getTestDatabase();
    const hunter = callerForDatabase(huntingRouter, "hunter", db);
    expect((await hunter.accept({ habitatId: "forest", contractId: "contract", version: null })).success).toBe(true);
    await db.update(huntingSession).set({ readyAt: new Date(0) });
    const session = (await db.query.huntingSession.findFirst())!;
    return { db, hunter, id: session.id, version: session.version };
  };
  const settleVictory = async (db: DrizzleClient, userId = "hunter") => {
    const current = (await db.query.battle.findFirst()) as CompleteBattle;
    for (const enemy of current.usersState.filter((u) => u.isAi)) enemy.curHealth = 0;
    await db.update(battle).set({ usersState: current.usersState }).where(eq(battle.id, current.id));
    const combat = callerForDatabase(combatRouter, userId, db);
    expect((await combat.getBattle({ battleId: current.id })).result?.outcome).toBe("Won");
    await combat.getBattle({ battleId: current.id });
    expect(await db.query.huntingReceipt.findMany()).toHaveLength(1);
    expect(await db.query.huntingProgress.findFirst()).toMatchObject({ userId, used: 1 });
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, userId) })).toMatchObject({ status: "AWAKE", battleId: null, huntingExperience: 173 });
    expect((await db.query.userItem.findMany({ where: eq(userItem.itemId, "hide") })).reduce((sum, row) => sum + row.quantity, 0)).toBe(2);
    return current;
  };

  it.each(["initial acceptance", "different-habitat switch"] as const)("rejects changed target terms during %s without replacing the session", async (mode) => {
    const db = await getTestDatabase();
    const hunter = callerForDatabase(huntingRouter, "hunter", db);
    await db.update(huntingHabitat).set({ updatedAt: new Date(0) });
    await db.insert(huntingProgress).values({ userId: "hunter", contractId: "contract", used: 2 });
    if (mode === "different-habitat switch") {
      await db.insert(huntingHabitat).values({ id: "other", content: { ...huntingHabitatContent(), contracts: [{ ...huntingContract(), id: "other-contract" }] }, updatedAt: new Date(0) });
      expect((await hunter.accept({ habitatId: "other", contractId: "other-contract", version: null })).success).toBe(true);
    }
    const previous = await db.query.huntingSession.findFirst();
    const client = beforeStatements(db, huntingSession, [async () => {
      const content = huntingHabitatContent();
      content.contracts[0]!.hunts = 1;
      content.contracts[0]!.cooldownSeconds = 3600;
      expect((await callerForDatabase(huntingRouter, "staff", db).save({ id: "forest", content })).success).toBe(true);
    }]);
    expect(await callerForDatabase(huntingRouter, "hunter", client).accept({ habitatId: "forest", contractId: "contract", version: previous?.version ?? null })).toMatchObject({ success: false, message: "Your hunting session changed. Refresh the board." });
    expect(await db.query.huntingSession.findFirst()).toEqual(previous);
    expect(await db.query.huntingProgress.findFirst({ where: eq(huntingProgress.contractId, "contract") })).toMatchObject({ used: 2, version: 1, cooldownUntil: expect.any(Date) });
    expect(await hunter.accept({ habitatId: "forest", contractId: "contract", version: previous?.version ?? null })).toMatchObject({ success: false, message: "This contract is on cooldown." });
  });

  it("keeps accepted material references through settlement and releases them on finish", async () => {
    const { db, hunter, id } = await prepare();
    expect((await hunter.start({ id })).success).toBe(true);
    const content = huntingHabitatContent();
    content.contracts[0]!.rewards = [{ itemId: "tusk", quantity: 4, chance: 100 }];
    expect((await callerForDatabase(huntingRouter, "staff", db).save({ id: "forest", content })).success).toBe(true);
    const items = callerForDatabase(itemRouter, "staff", db);
    expect(await items.delete({ id: "hide" })).toMatchObject({ success: false, message: expect.stringContaining("active hunting session") });
    await settleVictory(db);
    const rewards = await db.query.userItem.findMany({ where: eq(userItem.itemId, "hide"), with: { item: true } });
    expect(rewards.every((reward) => reward.item?.id === "hide")).toBe(true);
    expect(await items.delete({ id: "hide" })).toMatchObject({ success: false });
    const session = (await hunter.getSession())!.session;
    expect((await hunter.sessionAction({ id: session.id, version: session.version, action: "finish" })).success).toBe(true);
    expect(await items.delete({ id: "hide" })).toMatchObject({ success: true, message: "Item deleted" });
  });

  it("keeps accepted creature references through admission and releases them on switch", async () => {
    const { db, hunter, id } = await prepare();
    await insertUsers([{ userId: "replacement-ai", username: "replacement-ai", isAi: true }]);
    const content = huntingHabitatContent();
    content.contracts[0]!.aiId = "replacement-ai";
    content.contracts.push({ ...huntingContract(), id: "new-contract", aiId: "replacement-ai" });
    const saved = await callerForDatabase(huntingRouter, "staff", db).save({ id: "forest", content });
    if (!("content" in saved)) throw Error("Habitat save failed");
    const profiles = callerForDatabase(profileRouter, "staff", db);
    expect(await profiles.delete({ id: "enemy" })).toMatchObject({ success: false, message: expect.stringContaining("active hunting session") });
    expect((await hunter.start({ id })).success).toBe(true);
    const current = (await db.query.battle.findFirst())!;
    expect(current.usersState.some((u) => u.controllerId === "enemy" && u.isAi)).toBe(true);
    await settleVictory(db);
    const session = (await hunter.getSession())!.session;
    expect((await hunter.accept({ habitatId: "forest", contractId: saved.content.contracts[1]!.id, version: session.version })).success).toBe(true);
    expect(await profiles.delete({ id: "enemy" })).toMatchObject({ success: true, message: "AI deleted" });
  });

  it("allows staff edits during combat and settles the accepted rewards and final cooldown exactly once", async () => {
    const { db, hunter, id } = await prepare();
    await db.update(huntingProgress).set({ used: 2 });
    expect((await hunter.start({ id })).success).toBe(true);
    const before = (await db.query.huntingProgress.findFirst())!;
    const content = huntingHabitatContent();
    content.contracts[0] = { ...content.contracts[0]!, hunts: 1, cooldownSeconds: 3600, experience: 999, rewards: [{ itemId: "tusk", quantity: 10, chance: 100 }] };
    const staff = callerForDatabase(huntingRouter, "staff", db);
    expect(await staff.save({ id: "forest", content })).toMatchObject({ success: true });
    expect(await db.query.huntingProgress.findFirst()).toEqual(before);
    const current = (await db.query.battle.findFirst()) as CompleteBattle;
    for (const enemy of current.usersState.filter((u) => u.isAi)) enemy.curHealth = 0;
    await db.update(battle).set({ usersState: current.usersState }).where(eq(battle.id, current.id));
    const combat = callerForDatabase(combatRouter, "hunter", db);
    expect((await combat.getBattle({ battleId: current.id })).result?.hunting).toMatchObject({ experience: 50, remaining: 0 });
    await combat.getBattle({ battleId: current.id });
    expect(await db.query.huntingReceipt.findMany()).toHaveLength(1);
    const progress = (await db.query.huntingProgress.findFirst())!;
    expect(progress).toMatchObject({ used: 3, version: 1 });
    expect(progress.cooldownUntil!.getTime() - Date.now()).toBeGreaterThan(50_000);
    expect(progress.cooldownUntil!.getTime() - Date.now()).toBeLessThanOrEqual(60_000);
    expect((await db.query.userItem.findMany({ where: eq(userItem.itemId, "hide") })).reduce((sum, row) => sum + row.quantity, 0)).toBe(2);
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "hunter") })).toMatchObject({ huntingExperience: 173, status: "AWAKE" });
  });

  it("admits accepted terms when a staff save overlaps battle admission", async () => {
    const { db, id } = await prepare();
    let edited = false;
    const client = new Proxy(db, { get(target, key, receiver) {
      if (key === "transaction") return async (...args: Parameters<typeof target.transaction>) => {
        if (!edited) {
          edited = true;
          const content = huntingHabitatContent();
          content.contracts = [];
          expect((await callerForDatabase(huntingRouter, "staff", db).save({ id: "forest", content })).success).toBe(true);
        }
        return target.transaction(...args);
      };
      return Reflect.get(target, key, receiver);
    } });
    expect((await callerForDatabase(huntingRouter, "hunter", client).start({ id })).success).toBe(true);
    await settleVictory(db);
  });

  it("rejects stale force-awake recovery without clearing the admitted hunt or its queues", async () => {
    const { db, hunter, id, version } = await prepare();
    const client = beforeStatements(db, userData, [async () => {
      expect((await hunter.start({ id })).success).toBe(true);
      await db.insert(rankedPvpQueue).values({ id: "queued", userId: "hunter", rankedLp: 100 });
    }]);
    const result = await callerForDatabase(staffRouter, "staff", client).forceAwake({ userId: "hunter", reason: "Recover a stranded hunter" });
    expect(result).toMatchObject({ success: false, message: expect.stringContaining("changed") });
    const current = (await db.query.battle.findFirst())!;
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "hunter") })).toMatchObject({ status: "BATTLE", battleId: current.id });
    expect(await db.query.huntingSession.findFirst()).toMatchObject({ battleId: current.id, version: version + 1 });
    expect(await db.query.battle.findMany()).toHaveLength(1);
    expect(await db.query.rankedPvpQueue.findMany()).toHaveLength(1);
    expect(await db.query.actionLog.findMany()).toHaveLength(0);
    await settleVictory(db);
  });

  it.each(["identity", "version"] as const)("preserves a hunting session whose %s changed before recovery", async (change) => {
    const { db, id, version } = await prepare();
    const next = change === "identity" ? { id: "replacement" } : { version: version + 1 };
    const client = beforeStatements(db, userData, [async () => {
      await db.update(huntingSession).set(next).where(eq(huntingSession.userId, "hunter"));
    }]);
    expect((await callerForDatabase(staffRouter, "staff", client).forceAwake({ userId: "hunter", reason: "Recover a stranded hunter" })).success).toBe(false);
    expect(await db.query.huntingSession.findFirst()).toMatchObject({ id, version, ...next, battleId: null });
    expect(await db.query.actionLog.findMany()).toHaveLength(0);
  });

  it("preserves a first hunting session accepted after recovery's empty preload", async () => {
    const db = await getTestDatabase();
    const hunter = callerForDatabase(huntingRouter, "hunter", db);
    const client = beforeStatements(db, userData, [async () => {
      expect((await hunter.accept({ habitatId: "forest", contractId: "contract", version: null })).success).toBe(true);
    }]);
    expect((await callerForDatabase(staffRouter, "staff", client).forceAwake({ userId: "hunter", reason: "Recover a stranded hunter" })).success).toBe(false);
    expect(await db.query.huntingSession.findFirst()).toMatchObject({ version: 0, battleId: null });
    expect(await db.query.actionLog.findMany()).toHaveLength(0);
  });

  it("rejects a stale rename before ownership moves and permits retry after the admitted hunt settles", async () => {
    const { db, hunter, id } = await prepare();
    await db.insert(userItem).values({ id: "inventory", userId: "hunter", itemId: "hide", quantity: 1 });
    const client = beforeStatements(db, storeUserIdAlias, [async () => { expect((await hunter.start({ id })).success).toBe(true); }]);
    const result = await callerForDatabase(staffRouter, "staff", client).updateUserId({ userId: "hunter", newUserId: "renamed" });
    expect(result).toMatchObject({ success: false, message: expect.stringContaining("changed") });
    const current = (await db.query.battle.findFirst()) as CompleteBattle;
    expect(current.extraState.hunting?.userId).toBe("hunter");
    expect(current.usersState.some((u) => u.userId === "hunter")).toBe(true);
    expect(await db.query.huntingSession.findFirst()).toMatchObject({ userId: "hunter", battleId: current.id });
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "hunter") })).toMatchObject({ status: "BATTLE", battleId: current.id });
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "renamed") })).toBeUndefined();
    expect(await db.query.userItem.findFirst({ where: eq(userItem.id, "inventory") })).toMatchObject({ userId: "hunter" });
    expect(await db.query.huntingProgress.findFirst()).toMatchObject({ userId: "hunter", used: 0 });
    expect(await db.query.storeUserIdAlias.findFirst()).toMatchObject({ oldUserId: "hunter", newUserId: "renamed" });
    await db.delete(userItem).where(eq(userItem.id, "inventory"));
    await settleVictory(db);
    expect((await callerForDatabase(staffRouter, "staff", db).updateUserId({ userId: "hunter", newUserId: "renamed" })).success).toBe(true);
    for (const table of [huntingSession, huntingProgress, huntingReceipt, userItem]) {
      expect(await db.select().from(table).where(eq(table.userId, "hunter"))).toHaveLength(0);
      expect((await db.select().from(table).where(eq(table.userId, "renamed"))).length).toBeGreaterThan(0);
    }
  });

  for (const operation of ["forceAwake", "updateUserId"] as const) {
    it(`rejects a stale hunt when ${operation} finishes before its admission, then settles a fresh hunt`, async () => {
      const { db, id } = await prepare();
      let paused!: () => void;
      let resume!: () => void;
      const reached = new Promise<void>((resolve) => { paused = resolve; });
      const wait = new Promise<void>((resolve) => { resume = resolve; });
      const client = new Proxy(db, { get(target, key, receiver) {
        if (key === "transaction") return async (...args: Parameters<typeof target.transaction>) => { paused(); await wait; return target.transaction(...args); };
        return Reflect.get(target, key, receiver);
      } });
      const pending = callerForDatabase(huntingRouter, "hunter", client).start({ id });
      try {
        await reached;
        const staff = callerForDatabase(staffRouter, "staff", db);
        const changed = operation === "forceAwake"
          ? await staff.forceAwake({ userId: "hunter", reason: "Recover a stranded hunter" })
          : await staff.updateUserId({ userId: "hunter", newUserId: "renamed" });
        expect(changed.success).toBe(true);
      } finally {
        resume();
      }
      expect((await pending).success).toBe(false);
      expect(await db.query.battle.findMany()).toHaveLength(0);
      const owner = operation === "forceAwake" ? "hunter" : "renamed";
      expect((await callerForDatabase(huntingRouter, owner, db).start({ id })).success).toBe(true);
      await settleVictory(db, owner);
    });
  }
});
