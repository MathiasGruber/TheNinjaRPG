import { describe, expect, it } from "bun:test";
import { availableUserActions } from "@/libs/combat/actions";
import { applyEffects } from "@/libs/combat/process";
import { applyFinalStandDamage, heal, healPrevent } from "@/libs/combat/tags";
import type { UserEffect } from "@/libs/combat/types";
import {
  calcPoolCost,
  getEffectiveMaxPool,
  hasActiveEffectOfType,
  isEffectActive,
} from "@/libs/combat/util";
import {
  makeBattleUser,
  makeCompleteBattle,
  makeDamageEffect,
  makeEffect,
} from "./helpers/battleScenario";

const target = () => makeBattleUser("defender", { curHealth: 100, maxHealth: 1000 });
const runtime = {
  creatorId: "defender",
  targetId: "defender",
  fromType: "bloodline" as const,
  targetType: "user" as const,
  createdRound: 0,
};
const sealEffect = (overrides: Partial<UserEffect> = {}) =>
  makeEffect("seal", { power: 100, rounds: overrides.rounds ?? 3 }, {
    ...runtime,
    creatorId: "attacker",
    fromType: "jutsu",
    ...overrides,
  });
const healEffect = () => makeEffect("heal", { power: 50, rounds: 0, calculation: "static" }, {
  ...runtime,
  fromType: "jutsu",
  isNew: true,
  castThisRound: true,
  createdRound: 3,
});
const prevention = () => makeEffect("healprevent", { power: 100, rounds: 10 }, runtime);

describe("Bloodline Seal", () => {
  it("suppresses bloodline prevention without removing it, then restores it on expiry", () => {
    const prevent = prevention();
    const seal = sealEffect();
    const effects = [prevent, seal];
    const user = target();
    const before = new Map();
    heal(healEffect(), [prevent], user, before, 1);
    expect(before.size).toBe(0);

    const during = new Map();
    heal(healEffect(), effects, user, during, 1);
    expect(during.size).toBe(1);
    expect(prevent.rounds).toBe(10);
    expect(isEffectActive(prevent)).toBe(true);

    seal.rounds = 0;
    const after = new Map();
    heal(healEffect(), effects, user, after, 1);
    expect(after.size).toBe(0);
  });

  it.each([
    { isNew: true },
    { rounds: 0 },
    { targetId: "someone-else" },
  ])("ignores unresolved, expired or differently targeted seals: %j", (overrides) => {
    const effects = [prevention(), sealEffect(overrides)];
    const consequences = new Map();
    heal(healEffect(), effects, target(), consequences, 1);
    expect(consequences.size).toBe(0);
  });

  it("keeps non-bloodline prevention active even after a sealed bloodline prevent", () => {
    const effects = [prevention(), sealEffect(), { ...prevention(), id: "item-prevent", fromType: "item" as const }];
    const consequences = new Map();
    heal(healEffect(), effects, target(), consequences, 1);
    expect(consequences.size).toBe(0);
  });

  it("suppresses bloodline immunity to prevention", () => {
    const immunity = makeEffect("immunity", { blocks: "healprevent", rounds: 10 }, runtime);
    const castPrevent = () => makeEffect("healprevent", { power: 100, rounds: 3 }, {
      ...runtime, fromType: "jutsu", isNew: true, castThisRound: true, createdRound: 3,
    });
    const blocked = castPrevent();
    healPrevent(blocked, [immunity], target());
    expect(blocked.rounds).toBe(0);
    const allowed = castPrevent();
    healPrevent(allowed, [immunity, sealEffect()], target());
    expect(allowed.rounds).toBe(3);
  });

  it.each(["moveprevent", "summonprevent", "disarm", "stealth"] as const)(
    "suppresses the %s action restriction and restores it on expiry", (type) => {
      const effect = makeEffect(type, { power: 100, rounds: 10 }, runtime);
      const seal = sealEffect();
      expect(hasActiveEffectOfType("defender", [effect], type)).toBe(true);
      expect(hasActiveEffectOfType("defender", [effect, seal], type)).toBe(false);
      seal.rounds = 0;
      expect(hasActiveEffectOfType("defender", [effect, seal], type)).toBe(true);
    },
  );

  it("suppresses bloodline pool bonuses and cost modifiers", () => {
    const poolBonus = makeEffect("increasemaxpools", { power: 200, calculation: "static", poolsAffected: ["Health"] }, runtime);
    const costReduction = makeEffect("decreasepoolcost", { power: 20, calculation: "static", poolsAffected: ["Chakra"] }, runtime);
    const action = availableUserActions(makeCompleteBattle({ usersState: [target()] }), "defender", false, true)[0]!;
    const user = target();
    expect(getEffectiveMaxPool(user, [poolBonus], "Health")).toBe(1200);
    expect(getEffectiveMaxPool(user, [poolBonus, sealEffect()], "Health")).toBe(1000);
    expect(calcPoolCost({ ...action, chakraCost: 100 }, [costReduction], user).cpCost).toBe(80);
    expect(calcPoolCost({ ...action, chakraCost: 100 }, [costReduction, sealEffect()], user).cpCost).toBe(100);
  });

  it("suppresses bloodline Final Stand without consuming it", () => {
    const finalStand = makeEffect("finalstand", { rounds: 10 }, runtime);
    expect(applyFinalStandDamage([finalStand, sealEffect()], target(), 500, [])).toBe(500);
    expect(finalStand.rounds).toBe(10);
    expect(applyFinalStandDamage([finalStand], target(), 500, [])).toBe(99);
  });

  it("resolves healing through a sealed prevent in the complete effect pipeline", () => {
    const battle = makeCompleteBattle({
      round: 3,
      usersState: [makeBattleUser("attacker"), target()],
      usersEffects: [prevention(), sealEffect(), healEffect()],
    });
    const { newBattle } = applyEffects(battle, "defender");
    expect(newBattle.usersState.find((u) => u.userId === "defender")?.curHealth).toBe(600);
    expect(newBattle.usersEffects.find((e) => e.type === "healprevent")?.rounds).toBe(10);
  });

  it("suppresses bloodline shields in the complete damage pipeline", () => {
    const shield = makeEffect("shield", { power: 500, rounds: 10 }, runtime);
    const damage = makeDamageEffect({ power: 50, calculation: "static", createdRound: 3, targetType: "user" });
    const resolve = (effects: UserEffect[]) => applyEffects(makeCompleteBattle({
      round: 3,
      usersState: [makeBattleUser("attacker"), target()],
      usersEffects: [...effects, structuredClone(damage)],
    }), "attacker").newBattle;
    expect(resolve([structuredClone(shield)]).usersState[1]?.curHealth).toBe(100);
    const sealed = resolve([shield, sealEffect()]);
    expect(sealed.usersState[1]?.curHealth).toBeLessThan(100);
    expect(shield.power).toBe(500);
  });
});
