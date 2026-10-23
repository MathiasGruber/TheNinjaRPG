import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import {
  farmPlot,
  item,
  itemPurchaseCounter,
  jutsu,
  quest,
  questHistory,
  userData,
  userItem,
  userJutsu,
  userQueue,
} from "@/drizzle/schema";
import { getNewTrackers, mockAchievementHistoryEntries } from "@/libs/quest";
import { farmingRouter } from "@/server/api/routers/farming";
import { itemRouter } from "@/server/api/routers/item";
import { settleJutsuTrainingQueue } from "@/server/utils/userQueue";
import {
  CombatActivityTasks,
  getObjectiveSchema,
  QuestCompletionTasks,
  QuestTracker,
  QuestValidatorRawSchema,
} from "@/validators/objectives";
import {
  insertItems,
  insertQuestHistory,
  insertQuests,
  insertUsers,
} from "../../setup/factories";
import {
  callerFor,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

const userId = "achievement-player";
const achievementId = "activity-achievement";
const completionTasks = [
  ...Object.values(QuestCompletionTasks),
  "dungeons_completed",
  "raids_completed",
] as const;
const tasks = [...CombatActivityTasks, ...completionTasks];

describeWithDatabase("achievement persistence through sparse quest updates", () => {
  beforeEach(async () => {
    await resetTables(
      farmPlot,
      itemPurchaseCounter,
      userQueue,
      userJutsu,
      userItem,
      item,
      jutsu,
      questHistory,
      quest,
      userData,
    );
    await insertUsers([
      {
        userId,
        villageId: "home",
        money: 10000,
        rank: "GENIN",
        level: 20,
        status: "AWAKE",
        isOutlaw: true,
        questData: [
          QuestTracker.parse({
            id: achievementId,
            goals: tasks.map((task) => ({
              id: task,
              value: CombatActivityTasks.some((activity) => activity === task) ? 4 : 10,
              done: completionTasks.some((completion) => completion === task),
            })),
          }),
          QuestTracker.parse({ id: "deleted-quest" }),
        ],
      },
    ]);
    await insertQuests([
      {
        id: achievementId,
        questType: "achievement",
        hidden: false,
        consecutiveObjectives: false,
        content: QuestValidatorRawSchema.shape.content.parse({
          objectives: tasks.map((task) =>
            getObjectiveSchema(task).parse({ id: task, task, value: 10 }),
          ),
          reward: {},
          sceneBackground: "",
          sceneCharacters: [],
        }),
      },
      {
        id: "active-quest",
        consecutiveObjectives: false,
        content: QuestValidatorRawSchema.shape.content.parse({
          objectives: [
            getObjectiveSchema("jutsus_mastered").parse({
              id: "jutsu",
              task: "jutsus_mastered",
              value: 10,
            }),
            getObjectiveSchema("buy_item").parse({
              id: "buy",
              task: "buy_item",
              value: 10,
              buyItemIds: ["shop-item"],
            }),
            getObjectiveSchema("plants_watered").parse({
              id: "water",
              task: "plants_watered",
              value: 10,
            }),
          ],
          reward: {},
          sceneBackground: "",
          sceneCharacters: [],
        }),
      },
    ]);
    await insertQuestHistory([
      { id: "active-history", userId, questId: "active-quest" },
      { id: "orphan-history", userId, questId: "deleted-quest" },
    ]);
  });

  it.each(["jutsu", "buy", "water"] as const)(
    "retains unclaimed counters and earned completions after %s progress",
    async (action) => {
      const db = await getTestDatabase();
      const before = await db.query.userData.findFirst({
        where: eq(userData.userId, userId),
      });
      const now = new Date();
      if (action === "jutsu") {
        await db
          .insert(jutsu)
          .values({
            id: "new-jutsu",
            name: "New",
            description: "New",
            battleDescription: "New",
            effects: [],
            target: "SELF",
            range: 0,
            requiredRank: "STUDENT",
            jutsuRank: "D",
            jutsuType: "NORMAL",
            image: "/new.png",
          });
        await db
          .insert(userQueue)
          .values({
            id: "jutsu-queue",
            userId,
            kind: "JUTSU",
            position: 1,
            jutsuId: "new-jutsu",
            reservedRyo: 100,
            durationSeconds: 60,
            startsAt: now,
            finishesAt: new Date(now.getTime() + 60000),
          });
        expect(await settleJutsuTrainingQueue(db, userId, now)).toBe(1);
      } else if (action === "buy") {
        await insertItems([{ id: "shop-item", cost: 10, inShop: true }]);
        const api = await callerFor(itemRouter, userId);
        expect(
          (await api.buy({ itemId: "shop-item", villageId: "home", stack: 1 })).success,
        ).toBe(true);
      } else {
        await insertItems([{ id: "seed", isFarmSeed: true }]);
        await db
          .insert(farmPlot)
          .values({
            id: "growing-plot",
            userId,
            slotIndex: 0,
            seedItemId: "seed",
            plantedAt: now,
            finishAt: new Date(now.getTime() + 3600000),
          });
        const api = await callerFor(farmingRouter, userId);
        expect((await api.waterPlot({ plotId: "growing-plot" })).success).toBe(true);
      }
      const after = await db.query.userData.findFirst({
        where: eq(userData.userId, userId),
        with: { userQuests: { with: { quest: true } }, completedQuests: true },
      });
      expect(after?.questData?.find((tracker) => tracker.id === achievementId)).toEqual(
        before?.questData?.[0],
      );
      expect(
        after?.questData
          ?.find((tracker) => tracker.id === "active-quest")
          ?.goals.find((goal) => goal.id === action)?.value,
      ).toBe(1);
      expect(after?.questData?.some((tracker) => tracker.id === "deleted-quest")).toBe(
        false,
      );
      expect(
        after?.userQuests.some((history) => history.questId === achievementId),
      ).toBe(false);

      const definition = await db.query.quest.findFirst({
        where: eq(quest.id, achievementId),
      });
      const user = {
        ...after!,
        village: null,
        clan: null,
        items: [],
        dungeonsCompleted: 0,
        raidsCompleted: 0,
      } as unknown as Parameters<typeof getNewTrackers>[0];
      user.userQuests.push(...mockAchievementHistoryEntries([definition!], user));
      const reloaded = getNewTrackers(user, [{ task: "any" }]);
      expect(reloaded.trackers.find((tracker) => tracker.id === achievementId)).toEqual(
        before?.questData?.[0],
      );
    },
  );
});
