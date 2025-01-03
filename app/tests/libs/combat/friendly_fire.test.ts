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
  } as BattleUserState;

  const baseEffect: BattleEffect = {
    creatorId: "user1",
    villageId: "village1",
  } as BattleEffect;

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

  describe("Sparring Battle", () => {
    const sparUsers = [
      { ...baseUser, battle: { battleType: "SPARRING" } },
      { ...baseUser, userId: "user2", villageId: "village1", controllerId: "controller2", battle: { battleType: "SPARRING" } },
    ];

    it("should allow ENEMIES effects on same village in spars", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" };
      const target = sparUsers[1]; // Same village, different controller
      expect(checkFriendlyFire(effect, target, sparUsers)).toBe(true);
    });

    it("should block FRIENDLY effects on same village in spars", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" };
      const target = sparUsers[1]; // Same village, different controller
      expect(checkFriendlyFire(effect, target, sparUsers)).toBe(false);
    });
  });

  describe("Kage Challenge Battle", () => {
    const kageUsers = [
      { ...baseUser, battle: { battleType: "KAGE_CHALLENGE" } },
      { ...baseUser, userId: "user2", villageId: "village1", controllerId: "controller2", battle: { battleType: "KAGE_CHALLENGE" } },
    ];

    it("should allow ENEMIES effects on same village in kage challenges", () => {
      const effect = { ...baseEffect, friendlyFire: "ENEMIES" };
      const target = kageUsers[1]; // Same village, different controller
      expect(checkFriendlyFire(effect, target, kageUsers)).toBe(true);
    });

    it("should block FRIENDLY effects on same village in kage challenges", () => {
      const effect = { ...baseEffect, friendlyFire: "FRIENDLY" };
      const target = kageUsers[1]; // Same village, different controller
      expect(checkFriendlyFire(effect, target, kageUsers)).toBe(false);
    });
  });
});
