import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import {
  aiProfile,
  battle,
  dungeon,
  dungeonRun,
  item,
  jutsu,
  userData,
  userItem,
  userJutsu,
} from "@/drizzle/schema";
import { performAIaction } from "@/libs/combat/ai_v2";
import { getBattleGrid } from "@/libs/combat/util";
import { advanceDungeonWave } from "@/libs/dungeon";
import { Pusher } from "@/libs/pusher";
import { initiateBattle } from "@/server/api/routers/combat";
import { ActionUseSpecificJutsu } from "@/validators/ai";
import { makeTag } from "../../libs/combat/helpers/battleScenario";
import { dungeonBattleState, dungeonContent } from "../../setup/dungeon";
import { insertItems, insertUserItems, insertUsers } from "../../setup/factories";
import {
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

const MEMBERS = ["wave-a", "wave-b", "wave-c"];
const OPENER = "wave-opener";
const CASTER = "wave-caster";
const CREATURE = "wave-creature";

describeWithDatabase("dungeon wave summon preparation", () => {
  beforeEach(async () => {
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    await resetTables(
      battle, aiProfile, dungeon, dungeonRun, userData, item, userItem, jutsu, userJutsu,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["opening", "later"] as const)(
    "summons a pristine creature after its %s wave combatant spends its loadout",
    async (wave) => {
      const client = await getTestDatabase();
      const meta = dungeonBattleState({
        runState: { ...dungeonBattleState().runState, memberIds: MEMBERS },
        lastActionRound: Object.fromEntries(MEMBERS.map((id) => [id, 0])),
      });
      const waves = wave === "opening"
        ? [{ aiIds: [CASTER, CREATURE], delayRounds: 0 }, { aiIds: [OPENER], delayRounds: 1 }]
        : [{ aiIds: [OPENER], delayRounds: 0 }, { aiIds: [CASTER, CREATURE], delayRounds: 1 }];
      const content = dungeonContent();
      content.tiers[0]![0]!.waves = waves;
      await client.insert(aiProfile).values({
        id: "Default", userId: CREATURE, includeDefaultRules: false,
        rules: [{ conditions: [], action: ActionUseSpecificJutsu.parse({
          jutsuId: "wave-summon", target: "EMPTY_GROUND_CLOSEST_TO_SELF",
        }) }],
      });
      await insertUsers([
        ...MEMBERS.map((userId) => ({ userId, username: userId, status: "AWAKE" as const, level: 50, rank: "JONIN" as const })),
        ...[OPENER, CASTER, CREATURE].map((userId) => ({
          userId, username: userId, isAi: true, level: 50, rank: "JONIN" as const,
          effects: userId === CREATURE ? [makeTag("increasemaxpools", {
            power: 75, powerPerLevel: 0, calculation: "static", poolsAffected: ["Chakra"],
          })] : [],
        })),
      ]);
      await insertItems([{ id: "wave-consumable", itemType: "CONSUMABLE", slot: "ITEM", destroyOnUse: true, effects: [] }]);
      await insertUserItems([{ id: "wave-owned-consumable", userId: CREATURE, itemId: "wave-consumable", equipped: "ITEM_1", quantity: 1 }]);
      await client.insert(jutsu).values([
        { id: "wave-technique", name: "Technique", description: "Technique", battleDescription: "Technique", image: "/jutsu.png", effects: [], target: "SELF", range: 0, requiredRank: "STUDENT", jutsuType: "NORMAL", cooldown: 5 },
        { id: "wave-summon", name: "Summon", description: "Summon", battleDescription: "Summon", image: "/jutsu.png", effects: [makeTag("summon", { aiId: CREATURE, aiHp: 500, power: 100, rounds: 3 })], target: "EMPTY_GROUND", range: 3, actionCostPerc: 40, requiredRank: "STUDENT", jutsuType: "NORMAL" },
      ]);
      await client.insert(userJutsu).values([
        { id: "wave-owned-technique", userId: CREATURE, jutsuId: "wave-technique", equipped: true },
        { id: "wave-owned-summon", userId: CASTER, jutsuId: "wave-summon", equipped: true },
      ]);
      await client.insert(dungeon).values({ id: "wave-definition", content, updatedAt: new Date() });
      await client.insert(dungeonRun).values({
        id: meta.runId, dungeonId: "wave-definition", leaderId: MEMBERS[0]!, content,
        state: meta.runState, status: "FIGHTING", version: meta.runVersion,
        battleId: "wave-fight", expiresAt: new Date(meta.expiresAt), createdAt: new Date(),
      });
      expect((await initiateBattle({
        client, userIds: MEMBERS, targetIds: waves.flatMap((entry) => entry.aiIds),
        dungeon: { ...meta, battleId: "wave-fight", waves },
      }, "QUEST")).success).toBe(true);

      // Read the persisted preload, rather than constructing a template in the test.
      const saved = (await client.query.battle.findFirst())!;
      saved.round = 1;
      if (wave === "later") {
        saved.usersState.find((u) => u.isAi && !u.isSummon)!.curHealth = 0;
        expect(advanceDungeonWave(saved)).toBe(true);
      }
      const enemy = saved.usersState.find((u) => u.controllerId === CREATURE && !u.isSummon)!;
      const caster = saved.usersState.find((u) => u.controllerId === CASTER && !u.isSummon)!;
      const pristine = saved.usersState.find((u) => u.controllerId === CREATURE && u.isSummonTemplate);
      expect(pristine).toBeDefined();
      expect(pristine?.userId).not.toBe(enemy.userId);
      expect(pristine?.curHealth).toBe(0);
      for (const source of [enemy, pristine!]) {
        expect(source.curChakra).toBe(source.maxChakra + 75);
        expect(source._prevChakraAdj).toBe(75);
        expect(saved.usersEffects.filter((effect) => effect.targetId === source.userId)).toEqual([
          expect.objectContaining({ type: "increasemaxpools", creatorId: source.userId, power: 75 }),
        ]);
      }
      enemy.curHealth = 0;
      enemy.actionPoints = 0;
      enemy.items[0]!.quantity = 0;
      enemy.jutsus[0]!.lastUsedRound = 1;
      const result = performAIaction(saved, getBattleGrid(1, saved), caster.userId);
      expect(result.nextActionId).toBe("wave-summon");
      const summoned = result.nextBattle.usersState.find(
        (u) => u.isSummon && !u.isSummonTemplate && u.controllerId === caster.userId,
      );
      expect(summoned).toBeDefined();
      expect(summoned?.actionPoints).toBe(100);
      expect(summoned?.items[0]?.quantity).toBe(1);
      expect(summoned?.jutsus[0]?.lastUsedRound).toBe(-5);
    },
  );
});
