import { describe, expect, it } from "bun:test";
import { addQuestStartingEffects } from "@/libs/combat/questEffects";
import type { UserEffect } from "@/libs/combat/types";
import { calcApReduction, getEffectiveMaxPool } from "@/libs/combat/util";
import { getTagSchema, type ZodAllTags } from "@/validators/combat";
import { makeBattleUser, makeCompleteBattle } from "./helpers/battleScenario";

describe("opening quest effects", () => {
  it("resolves failed/successful stuns before the first action without mutating content", () => {
    for (const power of [0, 100]) {
      const player = makeBattleUser("hero");
      const effects: UserEffect[] = [];
      const tag = getTagSchema("stun").parse({ power, rounds: 3, apReduction: 20 }) as ZodAllTags;
      addQuestStartingEffects(player, effects, [tag], "quest");
      expect(calcApReduction(makeCompleteBattle({ usersState: [player], usersEffects: effects }), player.userId)).toBe(power === 0 ? 0 : 20);
      expect(tag.rounds).toBe(3);
      expect(effects[0]?.targetId).toBe(player.userId);
      expect(effects[0]?.castThisRound).toBe(false);
      expect(effects[0]?.createdRound).toBe(-1);
    }
  });
  it("materializes shield HP and effective pool capacity from complete tags", () => {
    const player = makeBattleUser("hero", { maxHealth: 100 });
    const effects: UserEffect[] = [];
    const tags = [getTagSchema("shield").parse({ power: 100, health: 500, rounds: 3 }), getTagSchema("increasemaxpools").parse({ power: 50, calculation: "percentage", poolsAffected: ["Health"], rounds: 3 })] as ZodAllTags[];
    addQuestStartingEffects(player, effects, tags, "quest");
    expect(effects[0]?.power).toBe(500);
    expect(getEffectiveMaxPool(player, effects, "Health")).toBe(150);
  });
});
