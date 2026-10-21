import { describe, expect, it } from "bun:test";
import { SHIELD_MAX_HEALTH } from "@/drizzle/constants";
import { applyEffects } from "@/libs/combat/process";
import type { CombatAction, CompleteBattle, UserEffect } from "@/libs/combat/types";
import { getTagSchema, isPositiveUserEffect, SiphonTag } from "@/validators/combat";
import { makeBattleUser, makeEffect } from "./helpers/battleScenario";

const runtime = {
  creatorId: "attacker",
  targetId: "attacker",
  targetType: "user" as const,
  createdRound: 3,
  isNew: true,
  castThisRound: true,
};
const siphon = (rounds = 3) =>
  makeEffect("siphon", { power: 50, rounds, shieldRounds: 3 }, runtime);
const hit = () => makeEffect("damage", {
  power: 100, calculation: "static", rounds: 0, statTypes: ["None"],
}, { ...runtime, targetId: "defender" });
const battle = (effects: UserEffect[]): CompleteBattle => ({
  battleType: "COMBAT", round: 3,
  usersState: [makeBattleUser("attacker"), makeBattleUser("defender")],
  usersEffects: effects, groundEffects: [], extraState: {},
}) as unknown as CompleteBattle;
const action = { chakraCost: 0, staminaCost: 0 } as CombatAction;
const shieldHp = (state: CompleteBattle) => state.usersEffects.reduce(
  (total, effect) => total + (effect.type === "shield" && effect.targetId === "attacker" ? effect.power : 0), 0,
);

describe("Siphon", () => {
  it.each([false, true])("preserves mixed Consume/Siphon durations with reversed order %s", (reverse) => {
    const contributions = [
      makeEffect("consume", { power: 25, rounds: 3, shieldRounds: 2 }, { ...runtime, id: "consume-short" }),
      makeEffect("siphon", { power: 25, rounds: 3, shieldRounds: 2 }, { ...runtime, id: "siphon-short" }),
      makeEffect("siphon", { power: 75, rounds: 3, shieldRounds: 6 }, { ...runtime, id: "siphon-long" }),
    ];
    const initial = battle([hit(), ...(reverse ? contributions.reverse() : contributions)]);
    const healthBefore = initial.usersState[1]!.curHealth;
    const result = applyEffects(initial, "attacker", action).newBattle;
    const damage = healthBefore - result.usersState[1]!.curHealth;
    const shields = result.usersEffects.filter((effect) => effect.type === "shield");
    expect(shields).toHaveLength(2);
    expect(shields.find((effect) => effect.rounds === 2)?.power).toBe(Math.floor(damage * 0.4));
    expect(shields.find((effect) => effect.rounds === 6)?.power).toBe(Math.floor(damage * 0.6));
  });

  it("shares the shield HP cap across durations", () => {
    const initial = battle([
      { ...hit(), power: 1000000 },
      siphon(),
      makeEffect("consume", { power: 50, rounds: 3, shieldRounds: 6 }, { ...runtime, id: "consume-long" }),
    ]);
    initial.usersState[1]!.curHealth = 10000000;
    initial.usersState[1]!.maxHealth = 10000000;
    const result = applyEffects(initial, "attacker", action).newBattle;
    const shields = result.usersEffects.filter((effect) => effect.type === "shield");
    expect(shields).toHaveLength(2);
    expect(shieldHp(result)).toBe(SHIELD_MAX_HEALTH);
    expect(shields.find((effect) => effect.rounds === 3)?.power).toBe(SHIELD_MAX_HEALTH / 2);
    expect(shields.find((effect) => effect.rounds === 6)?.power).toBe(SHIELD_MAX_HEALTH / 2);
  });

  it("is registered and clearable as a positive effect", () => {
    expect(getTagSchema("siphon").parse({}).type).toBe("siphon");
    expect(isPositiveUserEffect(SiphonTag.parse({}))).toBe(true);
  });

  it.each([0, 3])("converts casting-action damage immediately with %i rounds", (rounds) => {
    const initial = battle([hit(), siphon(rounds)]);
    const healthBefore = initial.usersState[1]!.curHealth;
    const { newBattle: result, actionEffects } = applyEffects(initial, "attacker", action);
    const damage = healthBefore - result.usersState[1]!.curHealth;
    expect(damage).toBeGreaterThan(0);
    expect(shieldHp(result)).toBe(Math.floor(damage * 0.5));
    expect(actionEffects.some((effect) => effect.txt.includes("siphons"))).toBe(true);
  });

  it("stacks shields from subsequent damage while active", () => {
    const first = applyEffects(battle([hit(), siphon()]), "attacker", action).newBattle;
    const second = applyEffects({ ...first, usersEffects: [
      ...first.usersEffects.filter((effect) => effect.type !== "damage").map((effect) => ({ ...effect, isNew: false, castThisRound: false })),
      { ...hit(), id: "next-hit" },
    ] }, "attacker", action).newBattle;
    expect(shieldHp(first)).toBeGreaterThan(0);
    expect(shieldHp(second)).toBe(shieldHp(first) * 2);
  });

  it.each([0, 3])("stops converting when cleared with %i rounds", (rounds) => {
    const clear = makeEffect("clear", { power: 100, rounds: 0 }, {
      ...runtime, creatorId: "defender",
    });
    const result = applyEffects(battle([hit(), siphon(rounds), clear]), "attacker", action).newBattle;
    expect(shieldHp(result)).toBe(0);
  });
});
