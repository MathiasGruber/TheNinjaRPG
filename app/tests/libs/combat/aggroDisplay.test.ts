import { describe, expect, it } from "bun:test";
import { getAggroDisplay } from "@/libs/combat/aggroDisplay";
import type { ReturnedUserState } from "@/libs/combat/types";

const user = (overrides: Partial<ReturnedUserState>): ReturnedUserState =>
  ({
    userId: "tank",
    direction: "left",
    curHealth: 100,
    fledBattle: false,
    leftBattle: false,
    enmity: 1600,
    ...overrides,
  }) as ReturnedUserState;

describe("battlefield aggro comparison", () => {
  it("compares each side independently and counts summons", () => {
    const display = getAggroDisplay([
      user({}),
      user({ userId: "summon", isSummon: true, enmity: 800 }),
      user({ userId: "boss", direction: "right", enmity: 8000 }),
    ]);
    expect(display.get("tank")).toEqual({ enmity: 1600, ratio: 1, isHighest: true });
    expect(display.get("summon")).toEqual({ enmity: 800, ratio: 0.5, isHighest: false });
    expect(display.get("boss")?.ratio).toBe(1);
  });

  it("excludes hidden, defeated, fled and departed combatants from the maximum", () => {
    const display = getAggroDisplay([
      user({}),
      user({ userId: "hidden", hidden: true, enmity: 8000 }),
      user({ userId: "dead", curHealth: 0, enmity: 8000 }),
      user({ userId: "fled", fledBattle: true, enmity: 8000 }),
      user({ userId: "left", leftBattle: true, enmity: 8000 }),
    ]);
    expect([...display.keys()]).toEqual(["tank"]);
    expect(display.get("tank")?.ratio).toBe(1);
  });

  it("leaves empty rings for zero or legacy scores and shows tied leaders equally", () => {
    const empty = getAggroDisplay([user({ enmity: undefined }), user({ userId: "zero", enmity: 0 })]);
    expect(empty.get("tank")).toEqual({ enmity: 0, ratio: 0, isHighest: false });
    expect(empty.get("zero")?.ratio).toBe(0);
    const tied = getAggroDisplay([user({}), user({ userId: "tie" })]);
    expect(tied.get("tie")).toEqual(tied.get("tank"));
  });

  it("recomputes relative fill when a different player becomes the leader", () => {
    const display = getAggroDisplay([user({}), user({ userId: "dps", enmity: 3200 })]);
    expect(display.get("tank")?.ratio).toBe(0.5);
    expect(display.get("tank")?.isHighest).toBe(false);
    expect(display.get("dps")?.ratio).toBe(1);
  });
});
