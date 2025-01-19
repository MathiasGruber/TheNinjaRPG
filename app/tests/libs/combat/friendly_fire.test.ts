import { describe, expect, it } from "vitest";
import { checkFriendlyFire } from "@/libs/combat/process";
import type { BattleUserState, BattleEffect } from "@/libs/combat/types";

describe("checkFriendlyFire", () => {
  const baseUser: BattleUserState = {
    userId: "user1",
    villageId: "village1",
    controllerId: "controller1",
    username: "User 1",
    isSummon: false,
    round: 1,
    iAmHere: true,
    isOriginal: true,
    updatedAt: new Date(),
    regeneration: 1,
    rank: "GENIN",
    avatar: "default.png",
    direction: "left",
    actionPoints: 100,
    fledBattle: false,
    leftBattle: false,
    initiative: 1,
    effects: [],
    sector: 0,
    location: "village",
    isAi: false,
    medicalExperience: 0,
    status: "AWAKE",
    recruiterId: null,
    speed: 10,
    createdAt: new Date(),
    anbuId: null,
    clanId: null,
    curHealth: 100,
    maxHealth: 100,
    curChakra: 100,
    maxChakra: 100,
    curStamina: 100,
    maxStamina: 100,
    ninjutsuOffence: 10,
    ninjutsuDefence: 10,
    genjutsuOffence: 10,
    genjutsuDefence: 10,
    taijutsuOffence: 10,
    taijutsuDefence: 10,
    bukijutsuOffence: 10,
    bukijutsuDefence: 10,
    strength: 10,
    intelligence: 10,
    willpower: 10,
    level: 1,
    gender: "M",
    longitude: 0,
    latitude: 0,
    highestOffence: "ninjutsuOffence",
    highestDefence: "ninjutsuDefence",
    highestGenerals: ["strength"],
    basicActions: [],
    jutsus: [],
    items: [],
    jutsuLoadout: null,
    nRecruited: 0,
    lastIp: null,
    money: 0,
    experience: 0,
    earnedExperience: 0,
    pvpStreak: 0,
    pvpWins: 0,
    pvpLosses: 0,
    pvpDraws: 0,
    pvpRating: 0,
    pvpRank: 0,
    pvpRankProgress: 0,
    pvpRankProgressRequired: 0,
    pvpRankProgressMax: 0,
    pvpRankProgressMin: 0,
    pvpRankProgressStep: 0,
    pvpRankProgressStepMax: 0,
    pvpRankProgressStepMin: 0,
    pvpRankProgressStepStep: 0,
  } as BattleUserState;

  const baseEffect: BattleEffect = {
    id: "effect1",
    creatorId: "user1",
    villageId: "village1",
    type: "absorb",
    description: "Test effect",
    target: "INHERIT",
    calculation: "percentage",
    direction: "offence",
    poolsAffected: ["Health"],
    power: 1,
    powerPerLevel: 0,
    level: 1,
    isNew: false,
    castThisRound: false,
    createdRound: 0,
    friendlyFire: "ALL" as const,
    staticAssetPath: "",
    staticAnimation: "",
    appearAnimation: "",
    disappearAnimation: "",
    longitude: 0,
    latitude: 0,
    barrierAbsorb: 0,
    actionId: "test-action",
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
  ];

  describe("Single Village Battle", () => {
    it("should allow effects with no friendly fire setting", () => {
      const effect = { ...baseEffect };
      const target = users[0];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should allow effects with ALL friendly fire setting", () => {
      const effect = { ...baseEffect, friendlyFire: "ALL" };
      const target = users[0];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should allow FRIENDLY effects on allies", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" };
      const target = users[0];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should block FRIENDLY effects on enemies", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" };
      const target = users[1];
      expect(checkFriendlyFire(effect, target, users)).toBe(false);
    });

    it("should allow ENEMIES effects on enemies", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" };
      const target = users[1];
      expect(checkFriendlyFire(effect, target, users)).toBe(true);
    });

    it("should block ENEMIES effects on allies", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" };
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
      const effect = { ...baseEffect, friendlyFire: "ALL" };
      const target = multiVillageUsers[0];
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should allow FRIENDLY effects on same village", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" };
      const target = multiVillageUsers[1]; // Same village, different controller
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should block FRIENDLY effects on different village", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" };
      const target = multiVillageUsers[2]; // Different village
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(false);
    });

    it("should allow ENEMIES effects on different village", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" };
      const target = multiVillageUsers[2]; // Different village
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(true);
    });

    it("should block ENEMIES effects on same village", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" };
      const target = multiVillageUsers[1]; // Same village, different controller
      expect(checkFriendlyFire(effect, target, multiVillageUsers)).toBe(false);
    });
  });

  describe("Summons", () => {
    const summonedUser: BattleUserState = {
      ...baseUser,
      userId: "summon1",
      villageId: "village1",
      controllerId: "user1",
      username: "Summon 1",
      isSummon: true,
    } as BattleUserState;

    const enemySummon: BattleUserState = {
      ...baseUser,
      userId: "summon2",
      villageId: "village2",
      controllerId: "user2",
      username: "Summon 2",
      isSummon: true,
    } as BattleUserState;

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
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" };
      const target = summonedUser;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(true);
    });

    it("should block FRIENDLY effects on enemy summons", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" };
      const target = enemySummon;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(false);
    });

    it("should allow ENEMIES effects on enemy summons", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" };
      const target = enemySummon;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(true);
    });

    it("should block ENEMIES effects on own summons", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" };
      const target = summonedUser;
      expect(checkFriendlyFire(effect, target, usersWithSummons)).toBe(false);
    });
  });
});
