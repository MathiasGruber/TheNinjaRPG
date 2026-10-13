import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq, getTableName } from "drizzle-orm";
import { actionLog, battle, mpvpBattleUser, quest, questHistory, rankedPvpQueue, userData } from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { getIsolatedPyramid } from "@/libs/questRun";
import { profileRouter } from "@/server/api/routers/profile";
import { staffRouter } from "@/server/api/routers/staff";
import { DialogObjective } from "@/validators/objectives";
import { ObjectiveReward } from "@/validators/rewards";
import { insertQuestHistory, insertQuests, insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables, runRawSql } from "../../setup/testDatabase";

describeWithDatabase("staff Pyramid recovery", () => {
  beforeEach(async () => {
    await runRawSql("DROP TRIGGER IF EXISTS staff_recovery_failure");
    await resetTables(questHistory, quest, userData, actionLog, mpvpBattleUser, rankedPvpQueue, battle);
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    await insertUsers([
      { userId: "hero", status: "BATTLE", battleId: null, regeneration: 10, curHealth: 100, maxHealth: 1000, updatedAt: new Date(Date.now() - 350_000), regenAt: new Date(Date.now() - 125_000) },
      { userId: "staff", role: "OWNER" },
    ]);
    await insertQuests([{
      id: "pyramid", questType: "battlepyramid", hidden: false,
      content: { isolated: true, entryItems: [], objectives: [DialogObjective.parse({ id: "wait", task: "dialog" })], reward: ObjectiveReward.parse({}), sceneBackground: "", sceneCharacters: [] },
    }]);
    await insertQuestHistory([{ id: "attempt", userId: "hero", questId: "pyramid", questType: "battlepyramid", isolated: true }]);
  });
  afterEach(async () => {
    await runRawSql("DROP TRIGGER IF EXISTS staff_recovery_failure");
    vi.restoreAllMocks();
    await resetTables(questHistory);
  });

  for (const table of [userData, questHistory]) {
    it(`keeps isolation and status intact when ${getTableName(table)} fails`, async () => {
      const client = await getTestDatabase();
      await runRawSql(`CREATE TRIGGER staff_recovery_failure BEFORE UPDATE ON \`${getTableName(table)}\` FOR EACH ROW BEGIN IF OLD.userId = 'hero' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Recovery write failed'; END IF; END`);
      const caller = await callerFor(staffRouter, "staff");
      await expect(caller.forceAwake({ userId: "hero", reason: "Recover a stranded player" })).rejects.toThrow("Failed query");
      const [stored, history] = await Promise.all([
        client.query.userData.findFirst({ where: eq(userData.userId, "hero") }),
        client.query.questHistory.findFirst({ where: eq(questHistory.id, "attempt") }),
      ]);
      expect(stored).toMatchObject({ status: "BATTLE", battleId: null, curHealth: 100 });
      expect(history).toMatchObject({ completed: 0, endAt: null, isolated: true });
      await runRawSql("DROP TRIGGER staff_recovery_failure");
      const profile = await (await callerFor(profileRouter, "hero")).getUser();
      expect(profile.userData).toMatchObject({ status: "BATTLE", curHealth: 100 });
      expect(getIsolatedPyramid(profile.userData)?.questId).toBe("pyramid");
    });
  }

  for (const hasRun of [false, true]) {
    it(`recovers a player ${hasRun ? "with" : "without"} Pyramid history and preserves logging and queue cleanup`, async () => {
      const client = await getTestDatabase();
      if (!hasRun) await resetTables(questHistory);
      await client.insert(rankedPvpQueue).values({ id: "queued", userId: "hero", rankedLp: 100 });
      const result = await (await callerFor(staffRouter, "staff")).forceAwake({ userId: "hero", reason: "Recover a stranded player" });
      expect(result.success).toBe(true);
      expect(await client.query.userData.findFirst({ where: eq(userData.userId, "hero") })).toMatchObject({ status: "AWAKE", battleId: null, travelFinishAt: null });
      if (hasRun) {
        const history = await client.query.questHistory.findFirst({ where: eq(questHistory.id, "attempt") });
        expect(history?.completed).toBe(0);
        expect(history?.endAt).toBeInstanceOf(Date);
      }
      expect(await client.query.rankedPvpQueue.findMany()).toHaveLength(0);
      expect(await client.query.actionLog.findMany()).toEqual([expect.objectContaining({ userId: "staff", relatedId: "hero" })]);
    });
  }
});
