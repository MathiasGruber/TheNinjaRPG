import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import {
  quest,
  questHistory,
  userData,
  overworldAiPlacement,
  overworldAiPlacementQuest,
  type AiProfile,
} from "@/drizzle/schema";
import type { CombatQueryUser } from "@/libs/combat/types";
import { Pusher } from "@/libs/pusher";
import { processUsersForBattle } from "@/server/api/routers/combat";
import { fetchUpdatedUser } from "@/server/api/routers/profile";
import { questsRouter } from "@/server/api/routers/quests";
import { overworldAiRouter } from "@/server/api/routers/overworldAi";
import { DialogObjective, InstantStartBattleObjective } from "@/validators/objectives";
import { ObjectiveReward } from "@/validators/rewards";
import { insertUsers, insertQuests } from "../../setup/factories";
import {
  callerFor,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

describeWithDatabase("Pyramid entry recovery", () => {
  beforeEach(async () => {
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    await resetTables(
      quest,
      questHistory,
      userData,
      overworldAiPlacement,
      overworldAiPlacementQuest,
    );
  });
  afterEach(() => vi.restoreAllMocks());
  for (const [source, isolated] of [
    ["npc", true],
    ["npc", false],
    ["ui", true],
  ] as const) {
    it(`preserves pre-entry recovery for ${isolated ? "isolated" : "ordinary"} ${source} Pyramids`, async () => {
      const client = await getTestDatabase();
      const prior = new Date(Date.now() - 125_000);
      await insertUsers([
        {
          userId: "pool-hero",
          status: "AWAKE",
          rank: "JONIN",
          level: 50,
          sector: 0,
          longitude: 0,
          latitude: 0,
          isOutlaw: true,
          regeneration: 10,
          updatedAt: prior,
          regenAt: prior,
          curHealth: 500,
          maxHealth: 1000,
          curChakra: 990,
          maxChakra: 1000,
          curStamina: 1,
          maxStamina: 1000,
          curEnergy: 10,
          primaryElement: "Fire",
          secondaryElement: "Water",
        },
        { userId: "friendly-npc", isAi: true },
      ]);
      await insertQuests([
        {
          id: "pool-pyramid",
          questType: "battlepyramid",
          hidden: false,
          maxAttempts: 100,
          maxCompletes: 100,
          consecutiveObjectives: true,
          content: {
            isolated,
            entryItems: [],
            sceneBackground: "",
            sceneCharacters: [],
            reward: ObjectiveReward.parse({}),
            objectives: [
              DialogObjective.parse({
                id: "enter",
                task: "dialog",
                nextObjectiveId: [{ text: "Enter", nextObjectiveId: "floor" }],
              }),
              InstantStartBattleObjective.parse({
                id: "floor",
                task: "start_battle",
                opponentAIs: [{ ids: ["foe"], number: 1 }],
              }),
            ],
          },
        },
      ]);
      await client.insert(overworldAiPlacement).values({
        id: "friendly",
        aiTemplateUserId: "friendly-npc",
        interactionType: "FRIENDLY",
        sectorList: [],
        sector: 0,
        longitude: 0,
        latitude: 0,
        positionVersion: 0,
      });
      await client.insert(overworldAiPlacementQuest).values({
        placementId: "friendly",
        questId: "pool-pyramid",
        chance: 100,
      });
      const { user, settings } = await fetchUpdatedUser({
        client,
        userId: "pool-hero",
      });
      if (!user) throw new Error("Missing fixture");
      const preload = (input: typeof user) =>
        processUsersForBattle(client, {
          users: [{ ...input, jutsus: [], effects: [] } as unknown as CombatQueryUser],
          settings,
          relations: [],
          wars: [],
          villages: [],
          battleType: "QUEST",
          leftSideUserIds: [user.userId],
          hide: false,
          isSummon: false,
          width: 10,
          height: 10,
          defaultProfile: { id: "default" } as AiProfile,
        });
      const recoveredBeforeEntry = (await preload(user)).usersState[0]!.curHealth;
      if (source === "npc") {
        const caller = await callerFor(overworldAiRouter, user.userId);
        const assigned = await caller.interactWithOverworldAi({
          placementId: "friendly",
          positionVersion: 0,
        });
        expect(assigned.success).toBe(true);
        expect(assigned.grantedQuestId).toBe("pool-pyramid");
      } else {
        const caller = await callerFor(questsRouter, user.userId);
        const assigned = await caller.startQuest({
          questId: "pool-pyramid",
          userSector: 0,
        });
        expect(assigned.success).toBe(true);
      }
      const started = await fetchUpdatedUser({ client, userId: user.userId });
      if (!started.user) throw new Error("Missing started user");
      const afterEntry = (await preload(started.user)).usersState[0]!.curHealth;
      expect(recoveredBeforeEntry).toBeGreaterThan(500);
      expect(afterEntry).toBe(recoveredBeforeEntry);
      if (isolated) {
        const stored = await client.query.userData.findFirst({
          where: eq(userData.userId, user.userId),
        });
        expect(stored?.curHealth).toBe(520);
        expect(stored?.curChakra).toBe(1000);
        expect(stored?.curStamina).toBe(21);
        // Energy shares the clock and must retain its earned recovery too.
        expect(stored?.curEnergy).toBe(30);
        expect(stored?.regenAt.getTime()).toBe(prior.getTime() + 120_000);
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 600_000);
        const later = await fetchUpdatedUser({ client, userId: user.userId });
        if (!later.user) throw new Error("Missing isolated user");
        expect((await preload(later.user)).usersState[0]?.curHealth).toBe(520);
      }
    });
  }
});
