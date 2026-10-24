import { describe, expect, it } from "bun:test";
import { BattleTypes } from "@/drizzle/constants";
import { earnsWarParticipation, WarParticipationBattleTypes } from "@/libs/combat/util";

describe("war participation flag (#2124)", () => {
  it("only real war fights flag a winning war participant", () => {
    expect(WarParticipationBattleTypes).toEqual(["COMBAT", "SHRINE_WAR"]);
    expect(earnsWarParticipation("COMBAT", 1, true)).toBe(true);
    expect(earnsWarParticipation("SHRINE_WAR", 1, true)).toBe(true);
  });

  it.each(BattleTypes.filter((type) => !["COMBAT", "SHRINE_WAR"].includes(type)))(
    "%s never flags, even against an enemy war side",
    (battleType) => {
      expect(earnsWarParticipation(battleType, 1, true)).toBe(false);
    },
  );

  it("requires a win and an opposing war foe", () => {
    expect(earnsWarParticipation("COMBAT", 0, true)).toBe(false);
    expect(earnsWarParticipation("COMBAT", 1, false)).toBe(false);
  });
});
