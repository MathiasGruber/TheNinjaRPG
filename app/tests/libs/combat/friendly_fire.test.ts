import { describe, expect, it } from "vitest";
import { checkFriendlyFire } from "@/libs/combat/process";
import type { ReturnedUserState, BattleEffect } from "@/libs/combat/types";

describe("checkFriendlyFire", () => {
  const testVillage = {
    id: "village1",
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

  const baseUser = {
    userId: "user1",
    updatedAt: new Date(),
    round: 1,
    regeneration: 0,
    rank: "GENIN" as const,
    village: testVillage,
    clan: null,
    bloodline: null,
    villageId: "village1",
    controllerId: "controller1",
    username: "User 1",
    isSummon: false,
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
  } satisfies ReturnedUserState;

  const baseEffect = {
    id: "effect1",
    type: "absorb" as const,
    creatorId: "user1",
    villageId: "village1",
    level: 1,
    isNew: false,
    castThisRound: false,
    createdRound: 0,
    rounds: 3,
    power: 100,
    actionId: "action1",
    barrierAbsorb: 0,
    longitude: 0,
    latitude: 0,
    direction: "offence" as const,
    description: "Test effect",
    target: "INHERIT" as const,
    calculation: "percentage" as const,
    poolsAffected: ["Health"],
    powerPerLevel: 0,
    staticAssetPath: "",
    staticAnimation: "",
    appearAnimation: "",
    disappearAnimation: "",
  } satisfies BattleEffect;

  const users = [
    baseUser,
    {
      ...baseUser,
      userId: "user2",
      villageId: "village2",
      controllerId: "controller2",
      username: "User 2",
      village: {
        ...testVillage,
        id: "village2",
        name: "Test Village 2",
      },
    },
  ];

  describe("Single Village Battle", () => {
    it("should allow effects with no friendly fire setting", () => {
      const effect = { ...baseEffect };
      const target = users[0]!;
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should allow effects with ALL friendly fire setting", () => {
      const effect = { ...baseEffect, friendlyFire: "ALL" as const };
      const target = users[0]!;
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should allow FRIENDLY effects on allies", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" as const };
      const target = users[0]!;
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should block FRIENDLY effects on enemies", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" as const };
      const target = users[1]!;
      expect(checkFriendlyFire(effect, target, users)).toBe(false);
    });

    it("should allow ENEMIES effects on enemies", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" as const };
      const target = users[1]!;
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should block ENEMIES effects on allies", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" as const };
      const target = users[0]!;
      expect(checkFriendlyFire(effect, target, users)).toBe(false);
    });
  });

  describe("Multi Village Battle", () => {
    const multiVillageUsers = [
      baseUser,
      {
        ...baseUser,
        userId: "user2",
        villageId: "village1",
        controllerId: "controller2",
      },
      {
        ...baseUser,
        userId: "user3",
        villageId: "village2",
        controllerId: "controller3",
        village: {
          ...testVillage,
          id: "village2",
          name: "Test Village 2",
        },
      },
    ];

    it("should allow effects with no friendly fire setting", () => {
      const effect = { ...baseEffect };
      const target = multiVillageUsers[0]!;
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should allow effects with ALL friendly fire setting", () => {
      const effect = { ...baseEffect, friendlyFire: "ALL" as const };
      const target = multiVillageUsers[0]!;
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should allow FRIENDLY effects on same village", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" as const };
      const target = multiVillageUsers[1]!; // Same village, different controller
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should block FRIENDLY effects on different village", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" as const };
      const target = multiVillageUsers[2]!; // Different village
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(false);
    });

    it("should allow ENEMIES effects on different village", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" as const };
      const target = multiVillageUsers[2]!; // Different village
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should block ENEMIES effects on same village", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" as const };
      const target = multiVillageUsers[1]!; // Same village, different controller
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(false);
    });
  });

  describe("Summons", () => {
    const summonedUser = {
      ...baseUser,
      userId: "summon1",
      villageId: "village1",
      controllerId: "user1",
      username: "Summon 1",
      isSummon: true,
    };

    const enemySummon = {
      ...baseUser,
      userId: "summon2",
      villageId: "village2",
      controllerId: "user2",
      username: "Summon 2",
      isSummon: true,
      village: {
        ...testVillage,
        id: "village2",
        name: "Test Village 2",
      },
    };

    const usersWithSummons = [
      baseUser,
      {
        ...baseUser,
        userId: "user2",
        villageId: "village2",
        controllerId: "controller2",
        username: "User 2",
        village: {
          ...testVillage,
          id: "village2",
          name: "Test Village 2",
        },
      },
      summonedUser,
      enemySummon,
    ];

    it("should allow FRIENDLY effects on own summons", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" as const };
      const target = summonedUser;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(true);
    });

    it("should block FRIENDLY effects on enemy summons", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" as const };
      const target = enemySummon;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(false);
    });

    it("should allow ENEMIES effects on enemy summons", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" as const };
      const target = enemySummon;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(true);
    });

    it("should block ENEMIES effects on own summons", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" as const };
      const target = summonedUser;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(false);
    });
  });
});
