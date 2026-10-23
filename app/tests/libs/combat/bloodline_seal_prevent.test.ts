import { describe, expect, it } from "bun:test";
import { stun } from "@/libs/combat/tags";
import type { UserEffect } from "@/libs/combat/types";
import { makeBattleUser, makeEffect } from "./helpers/battleScenario";

/**
 * A bloodline seal must switch off the holder's passive bloodline prevent tags
 * (e.g. a bloodline that "Prevents being stunned"), not only effects that are
 * re-applied each round.
 */
describe("bloodline seal disables passive bloodline prevent tags", () => {
  const holder = makeBattleUser("defender");

  const makeScenario = (preventFrom: "bloodline" | "jutsu") => {
    const stunPrevent = makeEffect(
      "stunprevent",
      { power: 100, powerPerLevel: 0 },
      {
        id: "stunprevent-passive",
        creatorId: "defender",
        targetId: "defender",
        fromType: preventFrom,
        isNew: false,
        castThisRound: false,
        createdRound: 0,
      },
    );
    const seal = makeEffect(
      "seal",
      { power: 100, powerPerLevel: 0, rounds: 3 },
      {
        id: "seal-1",
        creatorId: "attacker",
        targetId: "defender",
        fromType: "jutsu",
        isNew: false,
        castThisRound: false,
        createdRound: 1,
      },
    );
    const makeStun = () =>
      makeEffect(
        "stun",
        { power: 100, powerPerLevel: 0, rounds: 1, apReduction: 20 },
        {
          id: "stun-1",
          creatorId: "attacker",
          targetId: "defender",
          fromType: "jutsu",
          isNew: true,
          castThisRound: true,
          createdRound: 2,
        },
      );
    return { stunPrevent, seal, makeStun };
  };

  it("bloodline stunprevent resists stuns while the bloodline is not sealed", () => {
    const { stunPrevent, makeStun } = makeScenario("bloodline");
    const stunEffect = makeStun();
    const info = stun(stunEffect, [stunPrevent, stunEffect], holder);
    expect(info?.txt).toContain("resisted being stunned");
    expect(stunEffect.rounds).toBe(0);
  });

  it("sealed bloodline stunprevent no longer resists stuns", () => {
    const { stunPrevent, seal, makeStun } = makeScenario("bloodline");
    const stunEffect = makeStun();
    const usersEffects: UserEffect[] = [stunPrevent, seal, stunEffect];
    const info = stun(stunEffect, usersEffects, holder);
    expect(info?.txt).toContain("is stunned");
    expect(stunEffect.rounds).toBe(1);
  });

  it("expired seal restores the bloodline stunprevent", () => {
    const { stunPrevent, seal, makeStun } = makeScenario("bloodline");
    seal.rounds = 0;
    const stunEffect = makeStun();
    const info = stun(stunEffect, [stunPrevent, seal, stunEffect], holder);
    expect(info?.txt).toContain("resisted being stunned");
  });

  it("seal does not disable stunprevent coming from a jutsu", () => {
    const { stunPrevent, seal, makeStun } = makeScenario("jutsu");
    const stunEffect = makeStun();
    const info = stun(stunEffect, [stunPrevent, seal, stunEffect], holder);
    expect(info?.txt).toContain("resisted being stunned");
  });

  it("seal on another user does not disable the holder's bloodline stunprevent", () => {
    const { stunPrevent, seal, makeStun } = makeScenario("bloodline");
    seal.targetId = "attacker";
    const stunEffect = makeStun();
    const info = stun(stunEffect, [stunPrevent, seal, stunEffect], holder);
    expect(info?.txt).toContain("resisted being stunned");
  });
});
