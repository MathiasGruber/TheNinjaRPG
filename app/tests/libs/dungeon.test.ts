import { availableUserActions, calcActiveUser } from "@/libs/combat/actions";
import type { ReturnedBattle } from "@/libs/combat/types";
import { describe, expect, it } from "bun:test";
import { advanceDungeonWave, dungeonBattleOutcome, dungeonNextState } from "@/libs/dungeon";
import { alignBattle, calcBattleResult, maskBattle } from "@/libs/combat/util";
import { dungeonContentSchema } from "@/validators/dungeon";
import { dungeonBattleState, dungeonContent } from "../setup/dungeon";
import { makeCompleteBattle, makeUser } from "./combat/helpers/battleScenario";

const floorBattle = () => makeCompleteBattle({
  battleType: "QUEST", round: 0, width: 12, height: 10,
  usersState: [makeUser({userId: "a", controllerId: "a", direction: "left"}), makeUser({userId: "b", controllerId: "b", direction: "left"}), makeUser({userId: "c", controllerId: "c", direction: "left"}), makeUser({userId: "enemy", isAi: true, direction: "right"})],
  extraState: {dungeon: dungeonBattleState()},
});
describe("dungeon combat rules", () => {
  it("advances rounds for a lone survivor waiting for the next wave", () => {
    const battle = floorBattle();
    battle.activeUserId = "a"; battle.roundStartAt = new Date(0);
    battle.usersState.slice(1).forEach((u) => {u.curHealth = 0;});
    battle.extraState.dungeon!.pendingWaves.push({users: [makeUser({userId:"next", isAi:true, direction:"right"})],effects:[],delayRounds:2});
    expect(calcActiveUser(battle as unknown as ReturnedBattle, "a").progressRound).toBe(true);
    alignBattle(battle, [], "a");
    expect(battle.round).toBe(1);
    expect(alignBattle(battle, [], "a").progressRound).toBe(false);
  });
  it("keeps defeated members in a live party battle until team settlement", () => {
    const battle = floorBattle(); battle.usersState[0]!.curHealth = 0;
    expect(calcBattleResult(battle, "a")).toBeNull();
    battle.usersState[3]!.curHealth = 0;
    expect(calcBattleResult(battle, "a")?.outcome).toBe("Won");
    expect(calcBattleResult(battle, "a")?.money).toBe(0);
  });
  it("spawns preloaded waves only after defeat and the minimum round delay", () => {
    const battle = floorBattle();
    battle.extraState.dungeon!.pendingWaves.push({users: [makeUser({userId: "next", isAi: true, direction: "right"})], effects: [], delayRounds: 2});
    battle.usersState[3]!.curHealth = 0;
    expect(calcBattleResult(battle, "a")).toBeNull();
    expect(advanceDungeonWave(battle)).toBe(false);
    battle.round = 2;
    expect(advanceDungeonWave(battle)).toBe(true);
    expect(battle.extraState.dungeon!.wave).toBe(2);
    expect(battle.usersState.some((u) => u.userId === "next" && u.curHealth > 0)).toBe(true);
  });
  it("retains hidden summon sources across wave transitions", () => {
    const battle = floorBattle();
    battle.usersState.push(makeUser({userId: "template", controllerId: "summon-ai", isAi: true, isSummon: true, isSummonTemplate: true, direction: "right", curHealth: 0}));
    battle.usersState[3]!.curHealth = 0;
    battle.extraState.dungeon!.pendingWaves.push({users: [makeUser({userId: "next", isAi: true, direction: "right"})], effects: [], delayRounds: 0});
    advanceDungeonWave(battle);
    expect(battle.usersState.some((u) => u.userId === "template")).toBe(true);
  });
  it("hides future enemy state and removes the flee action from the masked client", () => {
    const battle=floorBattle();battle.extraState.dungeon!.pendingWaves.push({users:[makeUser({userId:"secret-enemy",isAi:true,direction:"right"})],effects:[],delayRounds:0});
    const masked=maskBattle(battle,"a");expect(masked.extraState.dungeon).not.toHaveProperty("pendingWaves");
    expect(JSON.stringify(masked)).not.toContain("secret-enemy");expect(availableUserActions(masked,"a").some((a)=>a.id==="flee")).toBe(false);
  });
  it("ends at the exact deadline and after three inactive rounds", () => {
    const battle = floorBattle();
    expect(dungeonBattleOutcome(battle, battle.extraState.dungeon!.expiresAt)).toBe("ended");
    const idle = floorBattle(); idle.round = 2;
    expect(dungeonBattleOutcome(idle)).toBeNull(); idle.round = 3;
    expect(dungeonBattleOutcome(idle)).toBe("ended");
  });
  it("retries the current tier on ordinary wipes and the same room on mini-boss wipes", () => {
    const state = {...dungeonBattleState().runState, floor: 7};
    expect(dungeonNextState(state, "wipe", "floor").floor).toBe(5);
    expect(dungeonNextState({...state, floor: 9}, "wipe", "mini-boss").floor).toBe(9);
    expect(dungeonNextState({...state, floor: 19}, "wipe", "boss").floor).toBe(15);
  });
  it("rejects a sixth room, more than ten enemies and delayed initial waves", () => {
    const content = dungeonContent();
    content.tiers[0]!.push(content.tiers[0]![0]!);
    expect(dungeonContentSchema.safeParse(content).success).toBe(false);
    const next = dungeonContent(); next.tiers[0]![0]!.waves[0]!.aiIds = Array(11).fill("enemy");
    expect(dungeonContentSchema.safeParse(next).success).toBe(false);
    const delayed = dungeonContent(); delayed.tiers[0]![0]!.waves[0]!.delayRounds = 1;
    expect(dungeonContentSchema.safeParse(delayed).success).toBe(false);
  });
});
