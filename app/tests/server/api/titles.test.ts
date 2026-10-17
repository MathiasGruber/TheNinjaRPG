import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { actionLog, title, userData, userTitle, quest, questHistory } from "@/drizzle/schema";
import { titleRouter } from "@/server/api/routers/title";
import { fetchUpdatedUser } from "@/server/api/routers/profile";
import { updateRewards, fetchRewardChoiceOwnership, questsRouter } from "@/server/api/routers/quests";
import { grantTitles } from "@/server/utils/titleGrants";
import { displayTitleSql } from "@/server/utils/titleDisplay";
import { validateTitleRewardIds } from "@/server/utils/titleRewards";
import { claimUserSnapshot } from "@/server/utils/concurrency";
import { getUnavailableRewardCards, buildRewardChoiceCards } from "@/libs/rewardChoice";
import { postProcessRewards } from "@/libs/quest";
import { ObjectiveReward } from "@/validators/rewards";
import { insertUsers, insertQuests, insertQuestHistory } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables, runRawSql } from "../../setup/testDatabase";

const player = "title-player";
const effects = [{ type: "increaseregeneration" as const, power: 7 }, { type: "increasemastery" as const, power: 15, masteryTypes: ["Ninjutsu" as const] }];

describeWithDatabase("title ownership, account recovery and presentation", () => {
  beforeEach(async () => {
    const realFetch = globalThis.fetch;
    // Exercise the public catalog's rate limiter without requiring an external Redis service.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (typeof init?.body !== "string" || !init.body.includes("trpc-ratelimit")) return realFetch(input, init);
      const commands = JSON.parse(init.body) as unknown[];
      const resultFor = (command: unknown[]) => ({ result: command[0] === "evalsha" || command[0] === "eval" ? [59, 60] : 1 });
      return Response.json(Array.isArray(commands[0]) ? commands.map((command) => resultFor(command as unknown[])) : resultFor(commands));
    });
    await resetTables(userTitle, title, userData, actionLog, quest, questHistory);
    await insertUsers([{ userId: player, username: "TitlePlayer", role: "USER", regeneration: 10, villageId: null, joinedVillageAt: new Date(0) }, { userId: "title-staff", username: "TitleStaff", role: "CONTENT-ADMIN" }]);
    const db = await getTestDatabase();
    await db.insert(title).values([{ id: "hero", name: "Hero", effects }, { id: "private", name: "Private", legacyOwnerId: "someone" }, { id: "archived", name: "Archived", archived: true }]);
  });

  afterEach(() => vi.restoreAllMocks());

  it("grants once concurrently and retains the original snapshot on retries or content edits", async () => {
    const db = await getTestDatabase();
    await Promise.all([grantTitles(db, player, ["hero", "hero"]), grantTitles(db, player, ["hero"])]);
    const before = await db.query.userTitle.findMany();
    expect(before).toHaveLength(1);
    expect(before[0]?.effects).toEqual(effects);
    await db.update(title).set({ effects: [] }).where(eq(title.id, "hero"));
    await grantTitles(db, player, ["hero"]);
    expect(await db.query.userTitle.findMany()).toEqual(before);
  });

  it("fences recovery from a pre-grant account snapshot and does not grant to missing users", async () => {
    const db = await getTestDatabase();
    const before = (await db.query.userData.findFirst({ where: eq(userData.userId, player) }))!;
    await grantTitles(db, player, ["hero"]);
    const stale = await claimUserSnapshot({ client: db, userId: player, updatedAt: before.updatedAt, set: { regenAt: new Date() } });
    expect(stale.success).toBe(false);
    await grantTitles(db, "missing", ["hero"]);
    expect(await db.query.userTitle.findMany({ where: eq(userTitle.userId, "missing") })).toHaveLength(0);
  });

  it("authorizes selection in the write, clears freely, and retains archived bonuses", async () => {
    const db = await getTestDatabase();
    const caller = await callerFor(titleRouter, player);
    expect((await caller.select({ titleId: "hero" })).success).toBe(false);
    await grantTitles(db, player, ["hero"]);
    expect((await caller.select({ titleId: "hero" })).success).toBe(true);
    const staff = await callerFor(titleRouter, "title-staff");
    expect((await staff.archive({ id: "hero" })).success).toBe(true);
    expect((await caller.getMine())[0]?.effects).toEqual(effects);
    expect((await caller.select({ titleId: null })).success).toBe(true);
    expect((await caller.select({ titleId: "hero" })).success).toBe(true);
    expect((await caller.getAllNames()).map((entry) => entry.id)).not.toContain("hero");
    const user = (await db.query.userData.findFirst({ where: eq(userData.userId, player) }))!;
    const cards = buildRewardChoiceCards(ObjectiveReward.parse({ reward_titles: ["hero"] }));
    const ownership = await fetchRewardChoiceOwnership(db, user, cards);
    expect(getUnavailableRewardCards(cards, ownership).has(cards[0]!.id)).toBe(true);
  });

  it("rejects private/archived/missing reward references and does not expose or edit private legacy titles", async () => {
    const db = await getTestDatabase();
    for (const id of ["private", "archived", "missing"]) {
      expect(await validateTitleRewardIds(db, [{ reward_titles: [id] }])).not.toBeNull();
      await grantTitles(db, player, [id]);
    }
    expect(await db.query.userTitle.findMany()).toHaveLength(0);
    const staff = await callerFor(titleRouter, "title-staff");
    expect((await staff.getAll()).map((entry) => entry.id)).not.toContain("private");
    expect((await staff.update({ id: "private", data: { name: "Stolen", description: "", effects: [], archived: false } })).success).toBe(false);
  });

  it("delivers title rewards through the shared payout path and resolves selected labels in public and aliased tavern queries", async () => {
    const db = await getTestDatabase();
    const user = (await db.query.userData.findFirst({ where: eq(userData.userId, player) }))!;
    const rewards = ObjectiveReward.parse({ reward_titles: ["hero", "hero"] });
    const result = await updateRewards({ client: db, user, rewards: postProcessRewards(rewards), reason: "QUEST" });
    expect(result.titles.map((entry) => entry.name)).toEqual(["Hero"]);
    await (await callerFor(titleRouter, player)).select({ titleId: "hero" });
    const publicProfile = await db.query.userData.findFirst({ columns: { userId: true }, extras: (table) => ({ displayTitle: displayTitleSql(table).as("displayTitle") }), where: eq(userData.userId, player) });
    expect(publicProfile?.displayTitle).toBe("Hero");
    const poster = alias(userData, "poster");
    const [post] = await db.select({ label: displayTitleSql(poster) }).from(poster).where(eq(poster.userId, player));
    expect(post?.label).toBe("Hero");
  });

  it("consumes title reward offers once and refuses already-owned choices without consuming the offer", async () => {
    const db = await getTestDatabase();
    await insertQuests([{ id: "title-choice", name: "Title Trial", questType: "story" }]);
    const offer = { id: "title-offer", pickCount: 1, cards: [{ id: "hero-card", field: "reward_titles" as const, amount: 1, contentId: "hero" }] };
    await insertQuestHistory([{ id: "title-history", userId: player, questId: "title-choice", completed: 1, endAt: new Date(), pendingRewardChoice: offer }]);
    const caller = await callerFor(questsRouter, player);
    const input = { questId: "title-choice", choiceId: offer.id, cardIds: ["hero-card"] };
    const results = await Promise.all([caller.claimRewardChoice(input), caller.claimRewardChoice(input)]);
    const granted = results.find((result) => result.success);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(granted?.rewards?.reward_titles).toEqual(["Hero"]);
    expect(granted?.userDelta).toBeUndefined();
    expect(await db.query.userTitle.findMany()).toHaveLength(1);
    await db.update(questHistory).set({ pendingRewardChoice: offer }).where(eq(questHistory.id, "title-history"));
    expect((await caller.claimRewardChoice(input)).success).toBe(false);
    expect((await db.query.questHistory.findFirst({ where: eq(questHistory.id, "title-history") }))?.pendingRewardChoice).toEqual(offer);
  });

  it("applies inactive owned regeneration from the acquisition tick and never rewrites base regeneration", async () => {
    const db = await getTestDatabase();
    const from = new Date(Date.now() - 180_000);
    await db.update(userData).set({ curHealth: 0, curStamina: 0, curChakra: 0, regenAt: from, updatedAt: from, maxHealth: 1000, maxChakra: 1000, maxStamina: 1000 }).where(eq(userData.userId, player));
    await db.insert(userTitle).values({ userId: player, titleId: "hero", effects, createdAt: new Date(from.getTime() + 120_000) });
    const result = await fetchUpdatedUser({ client: db, userId: player, forceRegen: true });
    // Three complete ticks; only the final two include the title acquired at tick two.
    expect(result.user?.curHealth).toBe(44);
    expect(result.user?.regeneration).toBe(17);
    expect(result.user?.titles?.[0]?.title?.name).toBe("Hero");
    expect(result.user?.effectiveMasteries?.ninjutsuMastery).toBeDefined();
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, player) })).toMatchObject({ activeTitleId: null, regeneration: 10 });
  });
});

const migration = await readFile(new URL("../../../drizzle/migrations/0091_luxuriant_green_goblin.sql", import.meta.url), "utf8");
describeWithDatabase("title migration preserves private labels and AI authored titles", () => {
  it("preserves equal labels as separate private titles, exact whitespace/casing and selected ownership", async () => {
    await runRawSql("DROP TABLE IF EXISTS TitleMigration, UserTitleMigration, UserDataMigration; CREATE TABLE UserDataMigration (userId varchar(191) PRIMARY KEY, customTitle varchar(191) NOT NULL DEFAULT '', isAi boolean NOT NULL DEFAULT false); INSERT INTO UserDataMigration VALUES ('one', ' The Hero ', false), ('two', ' The Hero ', false), ('empty', '', false), ('npc', 'Authored NPC', true);");
    const migrated = migration.replaceAll('`UserData`', '`UserDataMigration`').replaceAll('`UserTitle`', '`UserTitleMigration`').replaceAll('`Title`', '`TitleMigration`').split('\n').filter((line) => !line.includes('ALTER TABLE `ContentProposal')).join('\n');
    try {
      await runRawSql(migrated);
      const db = await getTestDatabase();
      const rows = await db.execute(sql`SELECT u.userId, u.npcTitle, u.activeTitleId, t.name, t.legacyOwnerId, ut.userId AS owner FROM UserDataMigration u LEFT JOIN TitleMigration t ON t.id=u.activeTitleId LEFT JOIN UserTitleMigration ut ON ut.titleId=t.id ORDER BY u.userId`);
      const selected = (rows as unknown as [Record<string, unknown>[]])[0];
      expect(selected.find((row) => row.userId === "npc")).toMatchObject({ npcTitle: "Authored NPC", activeTitleId: null });
      const owners = selected.filter((row) => row.userId === "one" || row.userId === "two");
      expect(new Set(owners.map((row) => row.activeTitleId)).size).toBe(2);
      for (const row of owners) expect(row).toMatchObject({ name: " The Hero ", legacyOwnerId: row.userId, owner: row.userId, npcTitle: "" });
      expect(selected.find((row) => row.userId === "empty")?.activeTitleId).toBeNull();
    } finally { await runRawSql("DROP TABLE IF EXISTS TitleMigration, UserTitleMigration, UserDataMigration;"); }
  });
});
