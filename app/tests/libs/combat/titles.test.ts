import { expect, it } from "bun:test";
import type { AiProfile } from "@/drizzle/schema";
import { applyEffects } from "@/libs/combat/process";
import type { CombatQueryUser } from "@/libs/combat/types";
import { processUsersForBattle } from "@/server/api/routers/combat";
import type { DrizzleClient } from "@/server/db";
import { makeCompleteBattle, makeUser } from "./helpers/battleScenario";

it("preloads every owned title mastery once, omits transient ownership and retains encounter snapshots", async () => {
  const caster = { ...makeUser({ userId: "title-caster", ninjutsuMastery: 100, activeTitleId: null }),
    effects: [], bloodright: [], regenAt: new Date(), regeneration: 0, bloodline: null, village: null, aiProfile: null, items: [], jutsus: [], userSkills: [],
    titles: [{ userId: "title-caster", titleId: "hero", createdAt: new Date(), effects: [{ type: "increasemastery", power: 15, masteryTypes: ["Ninjutsu"] }] }],
  } as unknown as CombatQueryUser;
  const preload = (battleType: "COMBAT" | "RANKED_PVP") => processUsersForBattle({} as DrizzleClient, {
    users: [caster], battleType, leftSideUserIds: [caster.userId], hide: false, isSummon: false,
    width: 10, height: 10, settings: [], relations: [], wars: [], villages: [], defaultProfile: { id: "default" } as AiProfile,
  });
  const loaded = await preload("COMBAT");
  expect(loaded.userEffects.filter((effect) => effect.type === "increasemastery")).toHaveLength(1);
  expect(loaded.usersState[0]).not.toHaveProperty("titles");
  caster.titles = [];
  const battle = makeCompleteBattle({ usersState: loaded.usersState, usersEffects: loaded.userEffects, extraState: loaded.extraState });
  expect(applyEffects(battle, caster.userId).newBattle.usersState[0]?.ninjutsuMastery).toBe(115);
  caster.titles = [{ userId: caster.userId, titleId: "hero", createdAt: new Date(), effects: [{ type: "increasemastery", power: 15, masteryTypes: ["Ninjutsu"] }] }];
  expect((await preload("RANKED_PVP")).userEffects.some((effect) => effect.type === "increasemastery")).toBe(false);
});
