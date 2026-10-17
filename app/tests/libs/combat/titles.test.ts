import { expect, it } from "bun:test";
import { RANKED_PVP_STATS } from "@/drizzle/constants";
import type { AiProfile } from "@/drizzle/schema";
import { applyEffects } from "@/libs/combat/process";
import { clear } from "@/libs/combat/tags";
import type { CombatQueryUser } from "@/libs/combat/types";
import { isEffectActive } from "@/libs/combat/util";
import { hasMasteryRequirements } from "@/libs/mastery";
import { processUsersForBattle } from "@/server/api/routers/combat";
import type { DrizzleClient } from "@/server/db";
import { makeCompleteBattle, makeEffect, makeUser } from "./helpers/battleScenario";

const titleUser = () => ({ ...makeUser({ userId: "title-caster", ninjutsuMastery: 100, activeTitleId: null }),
    effects: [], bloodright: [], regenAt: new Date(), regeneration: 0, bloodline: null, village: null, aiProfile: null, items: [], jutsus: [], userSkills: [],
    titles: [{ userId: "title-caster", titleId: "hero", createdAt: new Date(), effects: [{ type: "increasemastery", power: 15, masteryTypes: ["Ninjutsu"] }] }],
  } as unknown as CombatQueryUser);

const preload = (caster: CombatQueryUser, battleType: "COMBAT" | "RANKED_PVP" | "RANKED_SPARRING" = "COMBAT") => processUsersForBattle({} as DrizzleClient, {
    users: [caster], battleType, leftSideUserIds: [caster.userId], hide: false, isSummon: false,
    width: 10, height: 10, settings: [], relations: [], wars: [], villages: [], defaultProfile: { id: "default" } as AiProfile,
  });

it("preloads every owned title mastery once, omits transient ownership and retains encounter snapshots", async () => {
  const caster = titleUser();
  const loaded = await preload(caster);
  expect(loaded.userEffects.filter((effect) => effect.type === "increasemastery")).toHaveLength(1);
  expect(loaded.usersState[0]).not.toHaveProperty("titles");
  caster.titles = [];
  const battle = makeCompleteBattle({ usersState: loaded.usersState, usersEffects: loaded.userEffects, extraState: loaded.extraState });
  expect(applyEffects(battle, caster.userId).newBattle.usersState[0]?.ninjutsuMastery).toBe(115);
  caster.titles = [{ userId: caster.userId, titleId: "hero", createdAt: new Date(), effects: [{ type: "increasemastery", power: 15, masteryTypes: ["Ninjutsu"] }] }];
  Object.assign(caster, RANKED_PVP_STATS);
  for (const battleType of ["RANKED_PVP", "RANKED_SPARRING"] as const) {
    const ranked = await preload(caster, battleType);
    expect(ranked.userEffects.some((effect) => effect.type === "increasemastery")).toBe(false);
    const battle = makeCompleteBattle({ battleType, usersState: ranked.usersState, usersEffects: ranked.userEffects, extraState: ranked.extraState });
    expect(applyEffects(battle, caster.userId).newBattle.usersState[0]?.ninjutsuMastery).toBe(RANKED_PVP_STATS.ninjutsuMastery);
  }
});

it("Clear preserves owned title mastery and its action gates while removing temporary mastery", async () => {
  const caster = titleUser();
  const loaded = await preload(caster);
  const temporary = makeEffect("increasemastery", {
    masteryTypes: ["Ninjutsu"], power: 30, powerPerLevel: 0, calculation: "static", rounds: 5,
  }, { creatorId: caster.userId, targetId: caster.userId, targetType: "user", fromType: "jutsu" });
  let battle = makeCompleteBattle({ usersState: loaded.usersState, usersEffects: [...loaded.userEffects, temporary], extraState: loaded.extraState });
  expect(hasMasteryRequirements(caster, { requiredNinjutsuMastery: 110 })).toBe(false);
  battle = applyEffects(battle, caster.userId).newBattle;
  expect(battle.usersState[0]?.ninjutsuMastery).toBe(145);
  expect(hasMasteryRequirements(battle.usersState[0]!, { requiredNinjutsuMastery: 140 })).toBe(true);

  clear(makeEffect("clear", { power: 100 }, { targetId: caster.userId }), battle.usersEffects, battle.usersState[0]!);

  expect(battle.usersEffects.find((effect) => effect.id === temporary.id)?.rounds).toBe(0);
  const title = battle.usersEffects.find((effect) => effect.actionId === "hero")!;
  expect(isEffectActive(title)).toBe(true);
  expect(title.rounds).toBeUndefined();
  battle = applyEffects(battle, caster.userId).newBattle;
  expect(battle.usersState[0]?.ninjutsuMastery).toBe(115);
  expect(hasMasteryRequirements(battle.usersState[0]!, { requiredNinjutsuMastery: 110 })).toBe(true);
  expect(hasMasteryRequirements(battle.usersState[0]!, { requiredNinjutsuMastery: 140 })).toBe(false);
});
