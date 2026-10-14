import { describe, expect, it } from "bun:test";
import { MAP_RESERVED_SECTORS, WAR_OBJECTIVES_PER_SIDE } from "@/drizzle/constants";
import { getWarSide, maskWarObjectives, selectWarObjectives } from "@/libs/objectiveWar";
import { defaultWarRules, warRulesSchema } from "@/validators/war";
import type { War } from "@/drizzle/schema";

describe("objective war rules", () => {
  it("validates role damage, health and bounded duration", () => {
    expect(warRulesSchema.safeParse(defaultWarRules).success).toBe(true);
    expect(warRulesSchema.safeParse({ ...defaultWarRules, shrineHp: 40000 }).success).toBe(false);
    expect(warRulesSchema.safeParse({ ...defaultWarRules, durationDays: 0 }).success).toBe(false);
    expect(warRulesSchema.safeParse({ ...defaultWarRules, leaderDamage: -1 }).success).toBe(false);
  });
  const rows = [100, 101, 102, 103, MAP_RESERVED_SECTORS[0]!].map((sector) => ({ sector, villageId: "a", shrineLevel: 1, boostLockedUntil: null }));
  it("selects two distinct ordinary sectors before reserves", () => {
    const selected = selectWarObjectives(rows, "a", 100, defaultWarRules, () => 0.5);
    expect(selected).toHaveLength(WAR_OBJECTIVES_PER_SIDE);
    expect(new Set(selected.map((o) => o.sector)).size).toBe(2);
    expect(selected.every((o) => !o.isReserve && o.hp === 5000)).toBe(true);
  });
  it("falls back to reserves only without ordinary sectors", () => {
    const selected = selectWarObjectives(rows.filter((s) => s.sector === 100 || MAP_RESERVED_SECTORS.includes(s.sector)), "a", 100, defaultWarRules);
    expect(selected).toHaveLength(2);
    expect(selected.every((o) => o.isReserve)).toBe(true);
  });
  it("excludes locked sectors and other villages", () => {
    expect(selectWarObjectives([{ sector: 101, villageId: "a", shrineLevel: 1, boostLockedUntil: new Date(Date.now() + 10000) }, { sector: 102, villageId: "b", shrineLevel: 1, boostLockedUntil: null }], "a", 100, defaultWarRules)).toEqual([]);
  });
  it("does not select destroyed shrines or use reserves while ordinary land remains", () => {
    const destroyed = rows.map((s) => ({ ...s, shrineLevel: s.sector === 100 ? 1 : 0 }));
    expect(selectWarObjectives(destroyed, "a", 100, defaultWarRules)).toEqual([]);
  });
  it("hides both sides' objectives from nonleaders until their own espionage is full", () => {
    const activeWar = { attackerVillageId: "a", defenderVillageId: "b", warAllies: [{ villageId: "ally", supportVillageId: "a" }], objectiveState: {
      objectives: selectWarObjectives(rows, "a", 100, defaultWarRules), attackerEspionage: 0, defenderEspionage: 100,
    } } as War & { warAllies: { villageId: string; supportVillageId: string }[] };
    expect(getWarSide(activeWar, "ally")).toBe("a");
    expect(maskWarObjectives(activeWar, "ally", false).objectiveState?.objectives).toEqual([]);
    expect(maskWarObjectives(activeWar, "a", true).objectiveState?.objectives).toHaveLength(2);
    expect(maskWarObjectives(activeWar, "b", false).objectiveState?.objectives).toHaveLength(2);
    expect(maskWarObjectives(activeWar, "outsider", true).objectiveState?.objectives).toEqual([]);
    expect(activeWar.objectiveState?.objectives).toHaveLength(2);
  });
});
