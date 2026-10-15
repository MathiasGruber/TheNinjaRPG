import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import {
  actionLog,
  aiProfile,
  battle,
  battleHistory,
  item,
  quest,
  questHistory,
  userData,
  userItem,
} from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { initiateBattle } from "@/server/api/routers/combat";
import { fetchUpdatedUser } from "@/server/api/routers/profile";
import { assignQuestToUser } from "@/server/api/routers/quests";
import { DialogObjective } from "@/validators/objectives";
import { ObjectiveReward } from "@/validators/rewards";
import {
  insertItems,
  insertQuests,
  insertUserItems,
  insertUsers,
} from "../../setup/factories";
import {
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

/** Issue #1884: a Pyramid run must check and consume its entry items when it starts. */
describeWithDatabase("quest entry items are paid at the start of a run", () => {
  beforeEach(async () => {
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    await resetTables(
      actionLog,
      battleHistory,
      battle,
      aiProfile,
      questHistory,
      quest,
      userItem,
      item,
      userData,
    );
    await insertUsers([
      {
        userId: "hero",
        status: "AWAKE",
        rank: "JONIN",
        level: 50,
        isOutlaw: true,
        regeneration: 0,
        primaryElement: "Fire",
        secondaryElement: "Water",
      },
      { userId: "foe", isAi: true },
    ]);
    await insertItems([{ id: "ticket", name: "Pyramid Ticket", itemType: "WEAPON" }]);
    await insertQuests([
      {
        id: "pyramid",
        name: "Pyramid",
        questType: "battlepyramid",
        hidden: false,
        maxAttempts: 100,
        maxCompletes: 100,
        content: {
          entryItems: [{ ids: ["ticket"], number: 3 }],
          objectives: [DialogObjective.parse({ id: "wait", task: "dialog" })],
          reward: ObjectiveReward.parse({}),
          sceneBackground: "",
          sceneCharacters: [],
        },
      },
    ]);
    const client = await getTestDatabase();
    await client
      .insert(aiProfile)
      .values({ id: "Default", userId: "default-ai", rules: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  const start = async () => {
    const client = await getTestDatabase();
    const { user } = await fetchUpdatedUser({ client, userId: "hero" });
    const pyramid = await client.query.quest.findFirst({ where: eq(quest.id, "pyramid") });
    return {
      client,
      result: await assignQuestToUser({
        client,
        user: user!,
        quest: pyramid!,
        source: "ui",
        prevAttempt: undefined,
      }),
    };
  };

  it("rejects a start without enough items and writes nothing", async () => {
    // Two carried tickets plus one stored at home: stored items cannot pay.
    await insertUserItems([
      { id: "carried", userId: "hero", itemId: "ticket", quantity: 2 },
      { id: "home", userId: "hero", itemId: "ticket", quantity: 1, storedAtHome: true },
    ]);
    const { client, result } = await start();
    expect(result).toMatchObject({
      success: false,
      message: "You need 3× Pyramid Ticket in your inventory to enter.",
    });
    expect(await client.query.questHistory.findMany()).toHaveLength(0);
    expect(
      (await client.query.userItem.findMany()).map((row) => row.quantity).sort(),
    ).toEqual([1, 2]);
    expect(
      await client.query.userData.findFirst({ where: eq(userData.userId, "hero") }),
    ).toMatchObject({ status: "AWAKE" });
  });

  it("charges once at the start and never again at the first battle", async () => {
    await insertUserItems([
      { id: "a", userId: "hero", itemId: "ticket", quantity: 2 },
      { id: "b", userId: "hero", itemId: "ticket", quantity: 5 },
    ]);
    const { client, result } = await start();
    expect(result.success).toBe(true);
    const attempt = await client.query.questHistory.findFirst({ with: { quest: true } });
    expect(attempt?.entryPaid).toBe(true);
    // Stacks are allocated in id order: all of "a", then one from "b".
    expect(await client.query.userItem.findMany({ orderBy: userItem.id })).toMatchObject([
      { id: "b", quantity: 4 },
    ]);

    const battleResult = await initiateBattle(
      {
        client,
        userIds: ["hero"],
        targetIds: ["foe"],
        biome: "default",
        questAttempt: attempt!,
        questBattleSource: { questId: "pyramid", objectiveId: "floor" },
      },
      "QUEST",
    );
    expect(battleResult.success).toBe(true);
    expect(await client.query.userItem.findMany()).toMatchObject([
      { id: "b", quantity: 4 },
    ]);
    expect((await client.query.questHistory.findFirst())?.entryPaid).toBe(true);
  });
});
