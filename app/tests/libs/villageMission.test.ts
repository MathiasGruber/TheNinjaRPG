import { expect, it } from "bun:test";
import { getVillageMissionCombatEvents } from "@/libs/combat/villageMission";
import type { CombatResult } from "@/libs/combat/types";
import { villageMissionCompletionEvents } from "@/libs/villageMission";
import { villageMissionContentError } from "@/validators/villageMission";
import { makeBattleUser, makeCompleteBattle } from "./combat/helpers/battleScenario";

it.each([["D", 1], ["C", 3], ["B", 7], ["A", 14]] as const)("credits %s missions with %s shared points", (questRank, points) => {
  expect(villageMissionCompletionEvents({ questType: "mission", questRank })).toEqual({ [`${questRank.toLowerCase()}_missions_total`]: 1, combined_mission_effort: points });
});

it("counts defeated human opponents while excluding escapees, allies, summons and AI", () => {
  const battle = makeCompleteBattle({ usersState: [
    makeBattleUser("winner", { villageId: "v1", direction: "left" }),
    makeBattleUser("dead", { direction: "right", curHealth: 0, leftBattle: true }),
    makeBattleUser("fled", { direction: "right", curHealth: 0, fledBattle: true }),
    makeBattleUser("alive", { direction: "right", curHealth: 100 }),
    makeBattleUser("ally", { direction: "left", curHealth: 0 }),
    makeBattleUser("ai", { direction: "right", curHealth: 0, isAi: true }),
    makeBattleUser("summon", { direction: "right", curHealth: 0, isSummon: true }),
  ] });
  const result = { didWin: 1 } as CombatResult;
  expect(getVillageMissionCombatEvents(battle, "winner", result)).toEqual({ pvp_kills: 1 });
  expect(getVillageMissionCombatEvents({ ...battle, battleType: "SPARRING" }, "winner", result)).toEqual({});
  expect(getVillageMissionCombatEvents(battle, "winner", { ...result, didWin: 0 })).toEqual({});
});

it("rejects story objectives and sequential village missions", () => {
  const content = { reward: { reward_tokens: 100 }, objectives: [{ id: "x", task: "siege_operation", description: "Siege", value: 1 }] };
  expect(villageMissionContentError(content, false)).toBeNull();
  expect(villageMissionContentError(content, true)).not.toBeNull();
  expect(villageMissionContentError({ ...content, reward: { reward_tokens: 0 } }, false)).not.toBeNull();
  expect(villageMissionContentError({ ...content, objectives: [{ id: "x", task: "dialog" }] }, false)).not.toBeNull();
  expect(villageMissionContentError({ ...content, objectives: [{ ...content.objectives[0], attackers: [{ id: "ai" }] }] }, false)).not.toBeNull();
  expect(villageMissionCompletionEvents({ questType: "crime", questRank: "A" })).toEqual({});
});
