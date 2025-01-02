import { describe, it, expect } from "vitest";
import { availableUserActions } from "@/libs/combat/actions";
import type { ReturnedBattle } from "@/libs/combat/types";

describe("availableUserActions", () => {
  it("should allow basic heal during stealth", () => {
    const mockBattle: ReturnedBattle = {
      id: "test-battle",
      round: 1,
      usersState: [
        {
          userId: "test-user",
          username: "Test User",
          villageId: "test-village",
          controllerId: "test-controller",
          level: 1,
          gender: "M",
          curHealth: 100,
          curChakra: 100,
          curStamina: 100,
          maxHealth: 100,
          maxChakra: 100,
          maxStamina: 100,
          longitude: 0,
          latitude: 0,
          isSummon: false,
          highestOffence: "ninjutsuOffence",
          highestDefence: "ninjutsuDefence",
          highestGenerals: ["strength"],
          ninjutsuOffence: 10,
          ninjutsuDefence: 10,
          genjutsuOffence: 10,
          genjutsuDefence: 10,
          taijutsuOffence: 10,
          taijutsuDefence: 10,
          bukijutsuOffence: 10,
          bukijutsuDefence: 10,
          strength: 10,
          speed: 10,
          intelligence: 10,
          willpower: 10,
          basicActions: [],
          jutsus: [],
          items: [],
        }
      ],
      usersEffects: [
        {
          id: "stealth-effect",
          type: "stealth",
          creatorId: "test-user",
          targetId: "test-user",
          villageId: "test-village",
          targetType: "user",
          level: 1,
          isNew: false,
          castThisRound: false,
          createdRound: 0,
          rounds: 3,
          power: 100,
          actionId: "test-action",
          barrierAbsorb: 0,
          timeTracker: {},
        }
      ],
      groundEffects: [],
      battleType: "PVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const actions = availableUserActions(mockBattle, "test-user");
    
    // Basic heal should be available
    const basicHeal = actions.find(a => a.id === "cp" && a.name === "Basic Heal");
    expect(basicHeal).toBeDefined();
    expect(basicHeal?.type).toBe("basic");
    expect(basicHeal?.target).toBe("SELF");
    
    // Basic attack should not be available during stealth
    const basicAttack = actions.find(a => a.id === "sp" && a.name === "Basic Attack");
    expect(basicAttack).toBeUndefined();
  });
});
