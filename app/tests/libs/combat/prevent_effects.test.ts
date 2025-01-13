import { describe, expect, it } from "vitest";
import { buffPrevent, debuffPrevent, heal, healPrevent } from "@/libs/combat/tags";
import type { UserEffect } from "@/libs/combat/types";
import type { BattleUserState } from "@/libs/combat/types";
import type { Consequence } from "@/libs/combat/types";

describe("Prevent Effects", () => {
  const mockUser: BattleUserState = {
    userId: "test-user",
    username: "Test User",
    health: 100,
    maxHealth: 100,
  } as BattleUserState;

  describe("buffPrevent", () => {
    it("should respect multi-round duration", () => {
      const effect: UserEffect = {
        type: "buffprevent",
        power: 100,
        powerPerLevel: 1,
        level: 1,
        rounds: 3,
        isNew: true,
        castThisRound: true,
        targetId: mockUser.userId,
      } as UserEffect;

      // Initial application
      const result = buffPrevent(effect, mockUser);
      expect(result?.txt).toBe("Test User cannot be buffed for the next 3 rounds");
      expect(effect.rounds).toBe(2);
    });
  });

  describe("debuffPrevent", () => {
    it("should respect multi-round duration", () => {
      const effect: UserEffect = {
        type: "debuffprevent",
        power: 100,
        powerPerLevel: 1,
        level: 1,
        rounds: 3,
        isNew: true,
        castThisRound: true,
        targetId: mockUser.userId,
      } as UserEffect;

      // Initial application
      const result = debuffPrevent(effect, mockUser);
      expect(result?.txt).toBe("Test User cannot be debuffed for the next 3 rounds");
      expect(effect.rounds).toBe(2);
    });
  });

  describe("healPrevent", () => {
    it("should not affect existing healing effects", () => {
      // Create a healing effect
      const healEffect: UserEffect = {
        type: "heal",
        power: 50,
        powerPerLevel: 1,
        level: 1,
        rounds: 1,
        isNew: true,
        castThisRound: true,
        targetId: mockUser.userId,
        createdRound: 1,
      } as UserEffect;

      // Create a prevent healing effect that comes after
      const preventEffect: UserEffect = {
        type: "healprevent",
        power: 100,
        powerPerLevel: 1,
        level: 1,
        rounds: 3,
        isNew: true,
        castThisRound: true,
        targetId: mockUser.userId,
        createdRound: 2,
      } as UserEffect;

      // Apply the healing effect first
      const consequences = new Map<string, Consequence>();
      const healResult = heal(healEffect, [healEffect], consequences, mockUser);
      expect(healResult?.txt).toContain("will heal");
      expect(consequences.size).toBe(1);

      // Now apply prevent healing
      const preventResult = healPrevent(preventEffect, mockUser);
      expect(preventResult?.txt).toBe("Test User cannot be healed");
      expect(preventEffect.rounds).toBe(2);

      // The existing healing should still be in effect
      const healConsequence = Array.from(consequences.values())[0];
      expect(healConsequence.heal_hp).toBeGreaterThan(0);
    });
  });
});
