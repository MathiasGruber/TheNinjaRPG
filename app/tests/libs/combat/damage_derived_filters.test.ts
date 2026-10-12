import { describe, expect, it } from "bun:test";
import {
  afterburn,
  absorb,
  getEfficiencyRatio,
  lifesteal,
  recoil,
  reflect,
  wound,
} from "@/libs/combat/tags";
import type { Consequence } from "@/libs/combat/types";
import { getStatTypeLabels } from "@/libs/combat/util";
import { getTagSchema } from "@/validators/combat";
import { makeBattleUser, makeDamageEffect, makeEffect } from "./helpers/battleScenario";

const tagTypes = [
  "afterburn",
  "lifesteal",
  "recoil",
  "absorb",
  "reflect",
  "wound",
] as const;

describe("damage-derived tag filters", () => {
  it.each([...tagTypes])(
    "%s strips statTypes while preserving general and element filters",
    (type) => {
      const tag = getTagSchema(type).parse({
        type,
        statTypes: ["Ninjutsu"],
        generalTypes: ["Strength"],
        elements: ["Fire"],
      });
      expect(tag).not.toHaveProperty("statTypes");
      expect(tag).toMatchObject({ generalTypes: ["Strength"], elements: ["Fire"] });
    },
  );

  it.each([...tagTypes])(
    "%s ignores saved stat filters during combat and display",
    (type) => {
      const effect = {
        ...makeEffect(type, { elements: ["Fire"], generalTypes: ["Strength"] }),
        statTypes: ["Ninjutsu" as const],
      };
      const damage = makeDamageEffect({
        statTypes: ["Ninjutsu"],
        generalTypes: ["Intelligence"],
        elements: ["Wind"],
      });
      expect(getEfficiencyRatio(damage, effect)).toBe(0);
      expect(getStatTypeLabels(effect)).toEqual([]);
      expect(getEfficiencyRatio(makeDamageEffect({ elements: ["Fire"] }), effect)).toBe(
        1,
      );
      expect(
        getEfficiencyRatio(
          makeDamageEffect({ generalTypes: ["Strength"], elements: ["Wind"] }),
          effect,
        ),
      ).toBe(1);
    },
  );

  it.each([...tagTypes])(
    "%s matches elemental damage when no filters are selected",
    (type) => {
      expect(
        getEfficiencyRatio(makeDamageEffect({ elements: ["Fire"] }), makeEffect(type)),
      ).toBe(1);
    },
  );

  it.each([...tagTypes])("%s preserves an explicit None element filter", (type) => {
    const effect = makeEffect(type, { elements: ["None"] });
    expect(getEfficiencyRatio(makeDamageEffect({ elements: ["Fire"] }), effect)).toBe(
      0,
    );
    expect(getEfficiencyRatio(makeDamageEffect({ elements: [] }), effect)).toBe(1);
  });

  it.each([
    ["afterburn", afterburn, "afterburn", "defender"],
    ["lifesteal", lifesteal, "lifesteal_hp", "attacker"],
    ["recoil", recoil, "recoil", "attacker"],
    ["absorb", absorb, "absorb_hp", "defender"],
    ["reflect", reflect, "reflect", "defender"],
  ] as const)(
    "%s converts matching damage without statTypes",
    (type, handler, field, targetId) => {
      const damage = makeDamageEffect({ elements: ["Fire"] });
      const effect = makeEffect(type, { power: 20, elements: ["Fire"] }, { targetId });
      const consequence: Consequence = {
        userId: "attacker",
        targetId: "defender",
        damage: 100,
      };
      handler(
        effect,
        [damage, effect],
        new Map([[damage.id, consequence]]),
        makeBattleUser(targetId),
      );
      expect(consequence[field]).toBe(20);
    },
  );

  it("wound retains its damage and supported consequence types", () => {
    const effect = {
      ...makeEffect("wound", {
        power: 20,
        rounds: 2,
        elements: ["Fire"],
        generalTypes: ["Strength"],
      }),
      statTypes: ["Ninjutsu" as const],
      timeTracker: { originalDamage: 100 },
    };
    const consequences = new Map<string, Consequence>();
    wound(effect, [], consequences, makeBattleUser("defender"));
    expect(consequences.get(`wound-${effect.id}`)).toEqual({
      userId: "attacker",
      targetId: "defender",
      wound: 20,
      types: ["wound", "Strength", "Fire"],
    });
  });
});
