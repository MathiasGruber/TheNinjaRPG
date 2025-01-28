import { describe, it, expect } from "vitest";
import { availableUserActions } from "@/libs/combat/actions";
import type { ReturnedBattle } from "@/libs/combat/types";

describe("availableUserActions", () => {
  it("should allow basic heal during stealth", () => {
    const mockBattle: ReturnedBattle = {
      id: "test-battle",
      round: 1,
      activeUserId: "test-user",
      background: "",
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
          actionPoints: 100,
          avatar: "",
          direction: "left",
          fledBattle: false,
          iAmHere: true,
          initiative: 0,
          isAi: false,
          isOriginal: true,
          leftBattle: false,
          location: null,
          medicalExperience: 0,
          rank: "GENIN",
          round: 1,
          regeneration: 0,
          sector: 1,
          updatedAt: new Date(),
          village: {
            id: "test-village",
            createdAt: new Date(),
            updatedAt: new Date(),
            name: "Test Village",
            sector: 1,
            type: "VILLAGE",
            description: "Test village",
            mapName: null,
            kageId: "test-kage",
            villageGraphic: "",
            tokens: 0,
            leaderUpdatedAt: new Date(),
            hexColor: "#000000",
            populationCount: 0,
            allianceSystem: false,
            joinable: true,
            pvpDisabled: false,
            villageLogo: "",


          },
          bloodline: null,
          clan: null,
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
          target: "INHERIT",
          targetId: "test-user",
          villageId: "test-village",
          targetType: "user",
          level: 1,
          isNew: false,
          castThisRound: false,
          createdRound: 0,
          rounds: 3,
          power: 100,
          powerPerLevel: 0,
          direction: "offence",
          description: "Test effect",
          calculation: "static",
          staticAssetPath: "",
          staticAnimation: "",
          appearAnimation: "",
          disappearAnimation: "",
          barrierAbsorb: 0,
          timeTracker: {},
          longitude: 0,
          latitude: 0,
          actionId: "test-action",
        }
      ],
      groundEffects: [],
      battleType: "COMBAT",
      createdAt: new Date(),
      updatedAt: new Date(),
      roundStartAt: new Date(),
      version: 1,
      rewardScaling: 1,
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
