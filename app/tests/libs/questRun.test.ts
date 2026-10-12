import { describe, expect, it } from "bun:test";
import type { UserQuest } from "@/drizzle/schema";
import { getIsolatedPyramid, getQuestEntryRequirements, hasQuestContentChanged, isPyramidRestrictedPath, isPyramidRestrictedProcedure } from "@/libs/questRun";
import { getTagSchema } from "@/validators/combat";
import { DefeatOpponents, InstantStartBattleObjective, questEntryItemsSchema } from "@/validators/objectives";

describe("quest run configuration", () => {
  it("preserves missing starting pools and defaults effects/tickets to empty", () => {
    const objective = InstantStartBattleObjective.parse({ id: "fight", task: "start_battle", opponentAIs: [{ ids: ["foe"], number: 1 }] });
    expect(objective.givePools).toBeUndefined();
    expect(objective.applyBuffs).toEqual([]);
    expect(objective.applyDebuffs).toEqual([]);
    expect(questEntryItemsSchema.parse(undefined)).toEqual([]);
  });
  it("validates shared battle pool percentages and complete, timed player effects", () => {
    const base = { id: "fight", opponentAIs: [{ ids: ["foe"], number: 1 }] };
    for (const schema of [InstantStartBattleObjective, DefeatOpponents]) {
      for (const givePools of [0, 35, 100]) expect(schema.parse({ ...base, task: schema === DefeatOpponents ? "defeat_opponents" : "start_battle", givePools }).givePools).toBe(givePools);
      for (const givePools of [-1, 101]) expect(schema.safeParse({ ...base, task: schema === DefeatOpponents ? "defeat_opponents" : "start_battle", givePools }).success).toBe(false);
      const tag = getTagSchema("increasedamagegiven").parse({ rounds: 3 });
      expect(schema.safeParse({ ...base, task: schema === DefeatOpponents ? "defeat_opponents" : "start_battle", applyBuffs: [tag] }).success).toBe(true);
      expect(schema.safeParse({ ...base, task: schema === DefeatOpponents ? "defeat_opponents" : "start_battle", applyBuffs: [{ ...tag, rounds: undefined }] }).success).toBe(false);
      expect(schema.safeParse({ ...base, task: schema === DefeatOpponents ? "defeat_opponents" : "start_battle", applyDebuffs: [tag] }).success).toBe(false);
      expect(schema.safeParse({ ...base, task: schema === DefeatOpponents ? "defeat_opponents" : "start_battle", applyBuffs: [{ type: "summon", rounds: 3 }] }).success).toBe(false);
    }
  });
  it("adds duplicate item quantities without accepting fractional quantities", () => {
    expect(getQuestEntryRequirements({ entryItems: [{ ids: ["a", "b"], number: 2 }, { ids: ["a"], number: 1 }] })).toEqual([{ itemId: "a", quantity: 3 }, { itemId: "b", quantity: 2 }]);
    expect(questEntryItemsSchema.safeParse([{ ids: ["a"], number: 1.5 }]).success).toBe(false);
  });
  it("keeps hidden/edited runs isolated until they end", () => {
    const entry = { isolated: true, completed: 0, endAt: null, questType: "battlepyramid", questVersion: new Date(0), quest: { hidden: true, updatedAt: new Date(1000) } } as UserQuest;
    expect(getIsolatedPyramid({ userQuests: [entry] })).toBe(entry);
    expect(hasQuestContentChanged(entry)).toBe(true);
    expect(getIsolatedPyramid({ userQuests: [{ ...entry, endAt: new Date() }] })).toBeUndefined();
  });
  it("blocks inventory, outside healing and travel while retaining quest and battle controls", () => {
    for (const path of ["item.consume", "item.toggleEquip", "hospital.npcHeal", "village.buyFood", "combat.battleArenaHeal", "travel.startTravel"]) expect(isPyramidRestrictedProcedure(path)).toBe(true);
    for (const path of ["quests.abandon", "quests.checkRewards", "combat.performAction", "item.update"]) expect(isPyramidRestrictedProcedure(path)).toBe(false);
    expect(isPyramidRestrictedPath("/items")).toBe(true);
    expect(isPyramidRestrictedPath("/hospitalized-guide")).toBe(false);
  });
});

it("cannot advance a ticketed floor by defeating its enemy in an unrelated battle", async () => {
  const { getNewTrackers } = await import("@/libs/quest");
  const objective = InstantStartBattleObjective.parse({ id: "floor", task: "start_battle", opponentAIs: [{ ids: ["enemy"], number: 1 }] });
  const user = {
    userId: "hero", status: "BATTLE", role: "USER", level: 50, rank: "JONIN", sector: 0, items: [], completedQuests: [],
    questData: [{ id: "pyramid", startAt: new Date().toISOString(), goals: [] }],
    userQuests: [{ questId: "pyramid", endAt: null, completed: 0, entryPaid: false, previousAttempts: 1, previousCompletes: 0,
      quest: { id: "pyramid", name: "Pyramid", questType: "battlepyramid", hidden: false, requiredLevel: 0, maxLevel: 100, maxAttempts: 100, maxCompletes: 100, content: { entryItems: [{ ids: ["ticket"], number: 1 }], objectives: [objective] } },
    }],
  } as unknown as Parameters<typeof getNewTrackers>[0];
  const task = [{ task: "start_battle" as const, contentId: "enemy", text: "Won" }];
  expect(getNewTrackers(user, task).trackers[0]?.goals[0]?.done).toBe(false);
  expect(getNewTrackers(user, task, { inWarTornSector: false, isWarParticipant: false, questBattleSource: { questId: "pyramid", objectiveId: "another-floor" } }).trackers[0]?.goals[0]?.done).toBe(false);
  expect(getNewTrackers(user, task, { inWarTornSector: false, isWarParticipant: false, questBattleSource: { questId: "pyramid", objectiveId: "floor" } }).trackers[0]?.goals[0]?.done).toBe(true);
});
