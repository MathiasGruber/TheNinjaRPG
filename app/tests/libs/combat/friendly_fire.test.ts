import { describe, expect, it } from "vitest";
import { checkFriendlyFire } from "@/libs/combat/process";
import type { ReturnedUserState, BattleEffect } from "@/libs/combat/types";

describe("checkFriendlyFire", () => {
  const baseUser: ReturnedUserState = {
    userId: "user1",
    villageId: "village1",
    controllerId: "controller1",
    username: "User 1",
    isSummon: false,
    direction: "left",
    rank: "GENIN",
    regeneration: 1,
    avatar: "",
    actionPoints: 100,
    initiative: 1,
    isOriginal: true,
    leftBattle: false,
    fledBattle: false,
    longitude: 0,
    latitude: 0,
    updatedAt: new Date(),
    round: 1,
    sector: 0,
    location: "Test Location",
    village: {
      id: "test-village",
      name: "Test Village",
      sector: 0,
      type: "VILLAGE",
      description: "Test village description",
      mapName: "test-map",
      kageId: "test-kage",
      createdAt: new Date(),
      updatedAt: new Date(),
      villageGraphic: "",
      tokens: 0,
      leaderUpdatedAt: new Date(),
      hexColor: "#000000",
      populationCount: 0,
      villagePoints: 0,
    },
    curHealth: 100,
    curChakra: 100,
    curStamina: 100,
    maxHealth: 100,
    maxChakra: 100,
    maxStamina: 100,
    medicalExperience: 0,
    bloodline: null,
    clan: null,
    iAmHere: true,
    isAi: false,
    level: 1,
    gender: "M",
    basicActions: [],
  };

  const baseEffect: BattleEffect = {
    id: "test-effect",
    type: "absorb",
    calculation: "percentage",
    direction: "offence",
    description: "Test effect",
    target: "INHERIT",
    power: 100,
    powerPerLevel: 0,
    staticAssetPath: "",
    staticAnimation: "",
    appearAnimation: "",
    disappearAnimation: "",
    creatorId: "user1",
    villageId: "village1",
    longitude: 0,
    latitude: 0,
    level: 1,
    isNew: false,
    castThisRound: false,
    createdRound: 0,
    rounds: 3,
    actionId: "test-action",
    barrierAbsorb: 0,
    timeTracker: {},
    targetType: "user",
    poolsAffected: ["Health"],
  };

  const users = [
    { ...baseUser },
    {
      ...baseUser,
      userId: "user2",
      villageId: "village2",
      controllerId: "controller2",
      username: "User 2",
    },
  ] as const;

  describe("Single Village Battle", () => {
    it("should allow effects with no friendly fire setting", () => {
      const effect = { ...baseEffect };
      const target = users[0];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should allow effects with ALL friendly fire setting", () => {
      const effect = { ...baseEffect, friendlyFire: "ALL" as const };
      const target = users[0];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should allow FRIENDLY effects on allies", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" as const };
      const target = users[0];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should block FRIENDLY effects on enemies", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" as const };
      const target = users[1];
      expect(checkFriendlyFire(effect, target, users)).toBe(false);
    });

    it("should allow ENEMIES effects on enemies", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" as const };
      const target = users[1];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should block ENEMIES effects on allies", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" as const };
      const target = users[0];
      expect(checkFriendlyFire(effect, target, users)).toBe(false);
    });
  });

  describe("Multi Village Battle", () => {
    const multiVillageUsers = [
      { ...baseUser },
      { ...baseUser, userId: "user2", villageId: "village1", controllerId: "controller2" },
      { ...baseUser, userId: "user3", villageId: "village2", controllerId: "controller3" },
    ] as const;

    it("should allow effects with no friendly fire setting", () => {
      const effect = { ...baseEffect };
      const target = multiVillageUsers[0];
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should allow effects with ALL friendly fire setting", () => {
      const effect = { ...baseEffect, friendlyFire: "ALL" as const };
      const target = multiVillageUsers[0];
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should allow FRIENDLY effects on same village", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" as const };
      const target = multiVillageUsers[1]; // Same village, different controller
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should block FRIENDLY effects on different village", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" as const };
      const target = multiVillageUsers[2]; // Different village
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(false);
    });

    it("should allow ENEMIES effects on different village", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" as const };
      const target = multiVillageUsers[2]; // Different village
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should block ENEMIES effects on same village", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" as const };
      const target = multiVillageUsers[1]; // Same village, different controller
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(false);
    });
  });

  describe("Summons", () => {
    const summonedUser: ReturnedUserState = {
      ...baseUser,
      userId: "summon1",
      villageId: "village1",
      controllerId: "user1",
      username: "Summon 1",
      isSummon: true,
    };

    const enemySummon: ReturnedUserState = {
      ...baseUser,
      userId: "summon2",
      villageId: "village2",
      controllerId: "user2",
      username: "Summon 2",
      isSummon: true,
    };

    const usersWithSummons = [
      { ...baseUser },
      {
        ...baseUser,
        userId: "user2",
        villageId: "village2",
        controllerId: "controller2",
        username: "User 2",
      },
      summonedUser,
      enemySummon,
    ] as const;

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
