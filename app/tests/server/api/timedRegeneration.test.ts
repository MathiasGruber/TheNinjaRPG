import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import * as nextServer from "next/server";
import {
  ENERGY_QUEST_REWARDS,
  MEDNIN_REQUIRED_EXP,
  REGEN_SECONDS,
  TERMINAL_DIALOG_PREFIX,
} from "@/drizzle/constants";
import {
  quest,
  questHistory,
  userData,
  userQueue,
  userRaidBuff,
} from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { hospitalRouter } from "@/server/api/routers/hospital";
import { fetchUpdatedUser } from "@/server/api/routers/profile";
import { questsRouter } from "@/server/api/routers/quests";
import { createTRPCRouter } from "@/server/api/trpc";
import {
  getUserRegenerationGain,
  userRegenerationGainSql,
} from "@/server/utils/regeneration";
import { IncreaseRegenerationTag } from "@/validators/combat";
import { DialogObjective, QuestTracker } from "@/validators/objectives";
import { ObjectiveReward } from "@/validators/rewards";
import { insertUsers, insertQuests } from "../../setup/factories";
import { queueEnergy, readEnergyQueue } from "../../setup/queues";
import {
  callerFor,
  callerForDatabase,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

const USER_ID = "timed-recovery";
const VILLAGE_ID = "timed-recovery-village";
const STEP = REGEN_SECONDS * 1000;
const questRouter = createTRPCRouter({ quests: questsRouter });
const readUser = async (userId = USER_ID) =>
  (await getTestDatabase()).query.userData.findFirst({
    where: eq(userData.userId, userId),
  });

describeWithDatabase(
  "timed regeneration at hospital and isolation clock resets",
  () => {
    beforeEach(async () => {
      await resetTables(userRaidBuff, userQueue, questHistory, quest, userData);
      vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
      vi.spyOn(nextServer, "after").mockImplementation(() => {});
      await insertUsers([
        {
          userId: USER_ID,
          username: "TimedRecovery",
          status: "HOSPITALIZED",
          rank: "JONIN",
          level: 50,
          isOutlaw: true,
          villageId: VILLAGE_ID,
          regeneration: 10,
          curEnergy: 0,
          curHealth: 100,
          maxHealth: 1000,
          curChakra: 100,
          maxChakra: 1000,
          curStamina: 100,
          maxStamina: 1000,
          money: 10000,
          primaryElement: "Fire",
          secondaryElement: "Water",
        },
      ]);
    });
    afterEach(() => vi.restoreAllMocks());

    const recoveryClock = async (ticks = 4, overlap = false, active = false) => {
      const db = await getTestDatabase();
      // Keep the last tick comfortably away from a real SQL clock boundary.
      const from = new Date(Date.now() - ticks * STEP - 5000);
      await db
        .update(userData)
        .set({ regenAt: from })
        .where(eq(userData.userId, USER_ID));
      await db.insert(userRaidBuff).values({
        id: "recovery-meal",
        userId: USER_ID,
        itemId: "meal",
        createdAt: new Date(from.getTime() + (active ? 3.5 * STEP : 0)),
        expiresAt: new Date(from.getTime() + (active ? 10 * STEP : 2.5 * STEP)),
        effects: [IncreaseRegenerationTag.parse({ power: 70 })],
      });
      if (overlap)
        await db.insert(userRaidBuff).values({
          id: "recovery-raid",
          userId: USER_ID,
          createdAt: new Date(from.getTime() + 1.5 * STEP),
          expiresAt: new Date(from.getTime() + 3.5 * STEP),
          effects: [IncreaseRegenerationTag.parse({ power: 30 })],
        });
      return from;
    };

    it.each([
      { ticks: 12, overlap: false, active: false, expected: 134 },
      { ticks: 4, overlap: true, active: false, expected: 57 },
      { ticks: 4, overlap: false, active: true, expected: 47 },
    ])(
      "NPC checkout earns $expected Energy across timed intervals",
      async ({ ticks, overlap, active, expected }) => {
        await recoveryClock(ticks, overlap, active);
        await queueEnergy(USER_ID, [{ stat: "offence", energy: 100 }]);
        const before = await readUser();
        const api = await callerFor(hospitalRouter, USER_ID);
        const result = await api.npcHeal({ villageId: VILLAGE_ID });
        const saved = await readUser();
        expect(result.success).toBe(true);
        expect(saved).toMatchObject({
          status: "AWAKE",
          curHealth: 1000,
          curEnergy: expected,
          offence: before!.offence,
        });
        expect(result.data?.curEnergy).toBe(expected);
        expect(result.data?.regenAt.getTime()).toBe(saved!.regenAt.getTime());
        expect(await readEnergyQueue(USER_ID)).toMatchObject([
          { stat: "offence", energy: 100 },
        ]);
        expect((await api.npcHeal({ villageId: VILLAGE_ID })).success).toBe(false);
        // An awake profile may now spend the recovered Energy on its ordinary queue.
        expect((await readUser())?.curEnergy).toBe(
          expected - (expected >= 100 ? 100 : 0),
        );
      },
    );

    it.each([false, true])(
      "mednin healing settles the live recipient clock, intervening reset=%s",
      async (interveningReset) => {
        const from = await recoveryClock();
        await queueEnergy(USER_ID, [{ stat: "offence", energy: 100 }]);
        await insertUsers([
          {
            userId: "timed-healer",
            rank: "JONIN",
            status: "AWAKE",
            isOutlaw: true,
            villageId: VILLAGE_ID,
            regeneration: 0,
            curChakra: 8000,
            maxChakra: 8000,
            medicalExperience: MEDNIN_REQUIRED_EXP.LEGENDARY,
          },
        ]);
        const db = await getTestDatabase();
        const client = new Proxy(db, {
          get(target, property, receiver) {
            if (property === "execute" && interveningReset)
              return async (query: Parameters<typeof db.execute>[0]) => {
                // Another healer has already consumed the first two ticks and changed the balance.
                await db
                  .update(userData)
                  .set({ curEnergy: 100, regenAt: new Date(from.getTime() + 2 * STEP) })
                  .where(eq(userData.userId, USER_ID));
                return target.execute(query);
              };
            return Reflect.get(target, property, receiver);
          },
        });
        const api = callerForDatabase(hospitalRouter, "timed-healer", client);
        expect(
          (await api.userHeal({ userId: USER_ID, healPercentage: 10 })).success,
        ).toBe(true);
        expect((await readUser())?.curEnergy).toBe(interveningReset ? 120 : 54);
        expect(await readEnergyQueue(USER_ID)).toMatchObject([
          { stat: "offence", energy: 100 },
        ]);
      },
    );

    it("two concurrent mednins consume the recipient's elapsed ticks once", async () => {
      await recoveryClock();
      await insertUsers(
        ["healer-a", "healer-b"].map((userId) => ({
          userId,
          username: userId,
          rank: "JONIN",
          status: "AWAKE",
          isOutlaw: true,
          villageId: VILLAGE_ID,
          regeneration: 0,
          curChakra: 8000,
          maxChakra: 8000,
          medicalExperience: MEDNIN_REQUIRED_EXP.LEGENDARY,
        })),
      );
      const db = await getTestDatabase();
      let release = () => {};
      const ready = new Promise<void>((resolve) => {
        release = resolve;
      });
      let writes = 0;
      const client = new Proxy(db, {
        get(target, property, receiver) {
          if (property === "execute")
            return async (query: Parameters<typeof db.execute>[0]) => {
              if (++writes === 2) release();
              await ready;
              return target.execute(query);
            };
          return Reflect.get(target, property, receiver);
        },
      });
      const results = await Promise.all(
        ["healer-a", "healer-b"].map((userId) =>
          callerForDatabase(hospitalRouter, userId, client).userHeal({
            userId: USER_ID,
            healPercentage: 10,
          }),
        ),
      );
      expect(results.every((result) => result.success)).toBe(true);
      expect((await readUser())?.curEnergy).toBe(54);
    });

    it.each(["abandon", "complete", "retire", "orphan"] as const)(
      "isolated %s earns expired meal/raid recovery once without training queues",
      async (end) => {
        const db = await getTestDatabase();
        await db
          .update(userData)
          .set({ status: "AWAKE", regeneration: 0, regenAt: new Date() })
          .where(eq(userData.userId, USER_ID));
        await insertQuests([
          {
            id: "recovery-pyramid",
            hidden: false,
            questType: "battlepyramid",
            maxAttempts: 100,
            maxCompletes: 100,
            content: {
              isolated: true,
              entryItems: [],
              sceneBackground: "",
              sceneCharacters: [],
              reward: ObjectiveReward.parse({}),
              objectives: [
                DialogObjective.parse({
                  id: "finish",
                  task: "dialog",
                  nextObjectiveId: [{ text: "Complete" }],
                }),
              ],
            },
          },
        ]);
        const { quests: api } = await callerFor(questRouter, USER_ID);
        expect(
          (await api.startQuest({ questId: "recovery-pyramid", userSector: 0 }))
            .success,
        ).toBe(true);
        await db
          .update(userData)
          .set({ regeneration: 10 })
          .where(eq(userData.userId, USER_ID));
        await recoveryClock(4, true);
        await queueEnergy(USER_ID, [{ stat: "offence", energy: 1000 }]);
        const before = await readUser();
        const finish = async () => {
          if (end === "abandon") return api.abandon({ id: "recovery-pyramid" });
          if (end === "complete")
            return api.checkRewards({
              questId: "recovery-pyramid",
              nextObjectiveId: `${TERMINAL_DIALOG_PREFIX}finish`,
            });
          return fetchUpdatedUser({ client: db, userId: USER_ID });
        };
        if (end === "complete")
          await db
            .update(userData)
            .set({
              questData: [
                QuestTracker.parse({
                  id: "recovery-pyramid",
                  goals: [{ id: "finish" }],
                }),
              ],
            })
            .where(eq(userData.userId, USER_ID));
        if (end === "retire")
          await db
            .update(questHistory)
            .set({ endAt: new Date() })
            .where(eq(questHistory.questId, "recovery-pyramid"));
        if (end === "orphan")
          await db.delete(quest).where(eq(quest.id, "recovery-pyramid"));
        const result = await finish();
        if ("success" in result) expect(result).toMatchObject({ success: true });
        const expected =
          57 + (end === "complete" ? (ENERGY_QUEST_REWARDS.battlepyramid ?? 0) : 0);
        expect(await readUser()).toMatchObject({
          status: "AWAKE",
          curEnergy: expected,
          curHealth: before!.curHealth,
          offence: before!.offence,
        });
        expect(await readEnergyQueue(USER_ID)).toMatchObject([
          { stat: "offence", energy: 1000 },
        ]);
        await finish();
        expect((await readUser())?.curEnergy).toBe(expected);
      },
    );

    it.each([
      { startsAt: STEP + 1, endsAt: 3 * STEP + 1, at: 4 * STEP, expected: 54 },
      { startsAt: STEP, endsAt: 2 * STEP, at: 4 * STEP, expected: 47 },
      { startsAt: 0, endsAt: STEP + 1, at: 4 * STEP, expected: 47 },
      { startsAt: 0, endsAt: 10 * STEP, at: STEP - 1, expected: 0 },
      { startsAt: 0, endsAt: 10 * STEP, at: STEP, expected: 17 },
      { startsAt: 0, endsAt: 10 * STEP, at: STEP + 1, expected: 17 },
    ])(
      "keeps SQL and response ticks exact at millisecond boundaries: %j",
      async ({ startsAt, endsAt, at, expected }) => {
        const db = await getTestDatabase();
        const from = new Date("2026-01-01T00:00:00Z");
        const user = {
          regeneration: 17,
          regenerationWithoutTimedBuffs: 10,
          regenAt: from,
          raidBuffs: [
            {
              createdAt: new Date(from.getTime() + startsAt),
              expiresAt: new Date(from.getTime() + endsAt),
              effects: [IncreaseRegenerationTag.parse({ power: 70 })],
            },
          ],
        };
        const to = new Date(from.getTime() + at);
        await db
          .update(userData)
          .set({ regenAt: from, curEnergy: 0 })
          .where(eq(userData.userId, USER_ID));
        await db
          .update(userData)
          .set({ curEnergy: userRegenerationGainSql(user, userData.regenAt, to) })
          .where(eq(userData.userId, USER_ID));
        expect(getUserRegenerationGain(user, to)).toBe(expected);
        expect((await readUser())?.curEnergy).toBe(expected);
      },
    );
  },
);
