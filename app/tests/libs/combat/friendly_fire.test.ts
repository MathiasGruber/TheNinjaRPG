import { describe, expect, it } from "vitest";
import { checkFriendlyFire } from "@/libs/combat/process";
import type { ReturnedUserState, BattleEffect } from "@/libs/combat/types";

describe("checkFriendlyFire", () => {
  const baseUser = {
    rank: "STUDENT" as const,
    longitude: 0,
    latitude: 0,
    location: "village",
    updatedAt: new Date(),
    medicalExperience: 0,
    status: "AWAKE" as const,
    sector: 1,
    direction: "left" as const,
    userId: "user1",
    villageId: "village1",
    controllerId: "controller1",
    username: "User 1",
    isSummon: false,
    actionPoints: 100,
    avatar: "avatar1",
    basicActions: [],
    bloodline: null,
    clan: null,
    curChakra: 100,
    curHealth: 100,
    curStamina: 100,

    fledBattle: false,
    gender: "male",
    iAmHere: true,
    initiative: 1,
    isAi: false,
    isAggressor: false,
    isOriginal: true,
    items: [],
    jutsus: [],
    leftBattle: false,
    level: 1,
    maxChakra: 100,
    maxHealth: 100,
    maxStamina: 100,
    moneyStolen: 0,
    originalLatitude: 0,
    originalLongitude: 0,
    originalMoney: 0,
    regeneration: 1,
    round: 1,

    usedActions: [],
    usedGenerals: [],
    usedStats: [],
  };

  const baseEffect: BattleEffect = {
    creatorId: "user1",
    villageId: "village1",
    id: "effect1",
    level: 1,
    isNew: false,
    castThisRound: false,
    createdRound: 1,
    type: "damage",
    direction: "offence",
    calculation: "static",
    power: 1,
    powerPerLevel: 0,
    description: "Test effect",
    friendlyFire: undefined,
  } as BattleEffect;

  const withFriendlyFire = (type: "ALL" | "FRIENDLY" | "ENEMIES") => ({
    ...baseEffect,
    friendlyFire: type,
  });

  const users = [
    { ...baseUser },
    {
      ...baseUser,
      userId: "user2",
      villageId: "village2",
      controllerId: "controller2",
      username: "User 2",
    },
  ];

  describe("Single Village Battle", () => {
    it("should allow effects with no friendly fire setting", () => {
      const effect = { ...baseEffect };
      const target = users[0];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should allow effects with ALL friendly fire setting", () => {
      const effect = withFriendlyFire("ALL");
      const target = users[0];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should allow FRIENDLY effects on allies", () => {
      const effect = withFriendlyFire("FRIENDLY");
      const target = users[0];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should block FRIENDLY effects on enemies", () => {
      const effect = withFriendlyFire("FRIENDLY");
      const target = users[1];
      expect(checkFriendlyFire(effect, target, users)).toBe(false);
    });

    it("should allow ENEMIES effects on enemies", () => {
      const effect = withFriendlyFire("ENEMIES");
      const target = users[1];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should block ENEMIES effects on allies", () => {
      const effect = withFriendlyFire("ENEMIES");
      const target = users[0];
      expect(checkFriendlyFire(effect, target, users)).toBe(false);
    });
  });

  describe("Multi Village Battle", () => {
    const multiVillageUsers = [
      { ...baseUser },
      { ...baseUser, userId: "user2", villageId: "village1", controllerId: "controller2" },
      { ...baseUser, userId: "user3", villageId: "village2", controllerId: "controller3" },
    ];

    it("should allow effects with no friendly fire setting", () => {
      const effect = { ...baseEffect };
      const target = multiVillageUsers[0];
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should allow effects with ALL friendly fire setting", () => {
      const effect = withFriendlyFire("ALL");
      const target = multiVillageUsers[0];
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should allow FRIENDLY effects on same village", () => {
      const effect = withFriendlyFire("FRIENDLY");
      const target = multiVillageUsers[1]; // Same village, different controller
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should block FRIENDLY effects on different village", () => {
      const effect = withFriendlyFire("FRIENDLY");
      const target = multiVillageUsers[2]; // Different village
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(false);
    });

    it("should allow ENEMIES effects on different village", () => {
      const effect = withFriendlyFire("ENEMIES");
      const target = multiVillageUsers[2]; // Different village
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should block ENEMIES effects on same village", () => {
      const effect = withFriendlyFire("ENEMIES");
      const target = multiVillageUsers[1]; // Same village, different controller
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
    ];

    it("should allow FRIENDLY effects on own summons", () => {
      const effect = withFriendlyFire("FRIENDLY");
      const target = summonedUser;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(true);
    });

    it("should block FRIENDLY effects on enemy summons", () => {
      const effect = withFriendlyFire("FRIENDLY");
      const target = enemySummon;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(false);
    });

    it("should allow ENEMIES effects on enemy summons", () => {
      const effect = withFriendlyFire("ENEMIES");
      const target = enemySummon;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(true);
    });

    it("should block ENEMIES effects on own summons", () => {
      const effect = withFriendlyFire("ENEMIES");
      const target = summonedUser;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(false);
    });
  });
});
