import { describe, it, expect } from "vitest";
import { availableUserActions } from "@/libs/combat/actions";
import type { ReturnedBattle } from "@/libs/combat/types";

describe("availableUserActions", () => {
  it("should allow basic heal during stealth", () => {
    const testVillage = {
      id: "test-village",
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "Test Village",
      sector: 1,
      type: "VILLAGE" as const,
      description: "Test village description",
      mapName: "test_map",
      kageId: "kage1",
      tokens: 0,
      leaderUpdatedAt: new Date(),
      hexColor: "#000000",
      populationCount: 0,
      allianceSystem: true,
      joinable: true,
      pvpDisabled: false,
      villageLogo: "",
      villageGraphic: "",
    };

    const mockBattle: ReturnedBattle = {
      id: "test-battle",
      round: 1,
      usersState: [
        {
          userId: "test-user",
          updatedAt: new Date(),
          round: 1,
          regeneration: 0,
          rank: "GENIN" as const,
          village: testVillage,
          clan: null,
          bloodline: null,
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
          highestOffence: "ninjutsuOffence" as const,
          highestDefence: "ninjutsuDefence" as const,
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
          actionPoints: 100,
          avatar: "",
          direction: "left" as const,
          fledBattle: false,
          leftBattle: false,
          isOriginal: true,
          isAggressor: false,
          initiative: 0,
          originalLongitude: 0,
          originalLatitude: 0,
          originalMoney: 0,
          allyVillage: false,
          moneyStolen: 0,
          usedGenerals: [],
          usedStats: [],
          usedActions: [],
          basicActions: [],
          jutsus: [],
          items: [],
          sector: 1,
          location: "Test Location",
          isAi: false,
          medicalExperience: 0,
          iAmHere: true,
        }
      ],
      usersEffects: [
        {
          id: "stealth-effect",
          type: "stealth" as const,
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
          longitude: 0,
          latitude: 0,
          direction: "offence" as const,
          description: "Test stealth effect",
          target: "INHERIT" as const,
          calculation: "static" as const,
          powerPerLevel: 0,
          staticAssetPath: "",
          staticAnimation: "",
          appearAnimation: "",
          disappearAnimation: "",
        }
      ],
      groundEffects: [],
      battleType: "COMBAT" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      roundStartAt: new Date(),
      background: "test_background",
      version: 1,
      rewardScaling: 1,
      activeUserId: null,
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
