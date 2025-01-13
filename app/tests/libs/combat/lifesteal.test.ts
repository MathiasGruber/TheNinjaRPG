import { describe, expect, test } from "bun:test";
import { applyEffects } from "@/libs/combat/process";
import { DamageTag, LifestealTag } from "@/libs/combat/types";
import type { BattleUserState, UserEffect } from "@/libs/combat/types";

describe("lifesteal", () => {
  test("should not apply lifesteal if player dies", () => {
    // Setup test users
    const user1: BattleUserState = {
      userId: "1",
      username: "User1",
      gender: "male",
      level: 1,
      curHealth: 100,
      maxHealth: 100,
      curChakra: 100,
      maxChakra: 100,
      curStamina: 100,
      maxStamina: 100,
      longitude: 0,
      latitude: 0,
      ninjutsuOffence: 100,
      ninjutsuDefence: 100,
      genjutsuOffence: 100,
      genjutsuDefence: 100,
      taijutsuOffence: 100,
      taijutsuDefence: 100,
      bukijutsuOffence: 100,
      bukijutsuDefence: 100,
      strength: 100,
      speed: 100,
      intelligence: 100,
      willpower: 100,
      highestOffence: "ninjutsuOffence",
      highestDefence: "ninjutsuDefence",
      highestGenerals: ["strength"],
    };

    const user2: BattleUserState = {
      ...user1,
      userId: "2",
      username: "User2",
      curHealth: 50, // Low health to test death
    };

    // Create a damage effect that will kill user2
    const damageEffect: UserEffect = {
      id: "damage1",
      type: "damage",
      creatorId: "1",
      targetId: "2",
      power: 100,
      powerPerLevel: 0,
      calculation: "static",
      statTypes: ["Ninjutsu"],
      generalTypes: ["Strength"],
      rounds: 0,
      createdRound: 1,
      castThisRound: false,
      isNew: false,
      longitude: 0,
      latitude: 0,
      fromType: "jutsu",
    };

    // Create a lifesteal effect that would heal user1
    const lifestealEffect: UserEffect = {
      id: "lifesteal1",
      type: "lifesteal",
      creatorId: "1",
      targetId: "1",
      power: 50,
      powerPerLevel: 0,
      calculation: "percentage",
      rounds: 0,
      createdRound: 1,
      castThisRound: false,
      isNew: false,
      longitude: 0,
      latitude: 0,
      fromType: "jutsu",
    };

    const battle = {
      id: "test-battle",
      type: "PVP" as const,
      round: 1,
      usersState: [user1, user2],
      usersEffects: [damageEffect, lifestealEffect],
      groundEffects: [],
      createdAt: new Date(Date.now() - 1000), // Battle started 1 second ago
      updatedAt: new Date(),
    };

    // Apply effects
    const { actionEffects } = applyEffects(battle, user1.userId);

    // User2 should be dead (health = 0)
    const updatedUser2 = users.find((u) => u.userId === "2");
    expect(updatedUser2?.curHealth).toBe(0);

    // User1 should not have gained health from lifesteal since User2 died
    const updatedUser1 = users.find((u) => u.userId === "1");
    expect(updatedUser1?.curHealth).toBe(100);

    // Check that no lifesteal message was generated
    const lifestealMessage = actionEffects.find((e) => e.txt.includes("steals"));
    expect(lifestealMessage).toBeUndefined();
  });
});
