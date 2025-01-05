import { describe, expect, it } from "vitest";
import { buffPrevent, debuffPrevent } from "@/libs/combat/tags";
import type { UserEffect } from "@/libs/combat/types";
import type { BattleUserState } from "@/libs/combat/types";

describe("Prevent Effects", () => {
  const mockUser: BattleUserState = {
    userId: "test-user",
    username: "Test User",
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
});
