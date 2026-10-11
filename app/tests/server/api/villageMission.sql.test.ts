import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { userData, village, villageStructure, quest, war, warKill } from "@/drizzle/schema";
import { updateWars } from "@/libs/combat/database";
import type { CompleteBattle, CombatResult } from "@/libs/combat/types";
import { SimpleObjective } from "@/validators/objectives";
import { ObjectiveReward } from "@/validators/rewards";
import { villageMissionRouter } from "@/server/api/routers/villageMission";
import { kageRouter } from "@/server/api/routers/kage";
import { recordVillageMissionProgress } from "@/server/utils/villageMission";
import { accrueVillageStructureMaintenance } from "@/server/utils/villageMaintenance";
import { insertUsers, insertQuests } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const state = async () => (await getTestDatabase()).query.village.findFirst({ where: eq(village.id, "v1") });
const leader = async () => callerFor(villageMissionRouter, "leader");
const objective = { id: "effort", task: "combined_mission_effort", description: "Complete missions together", value: 14 };

describeWithDatabase("Village Missions and maintenance on real MySQL", () => {
  beforeEach(async () => {
    await resetTables(userData, village, villageStructure, quest, war, warKill);
    const db = await getTestDatabase();
    await insertUsers([
      { userId: "leader", username: "leader", villageId: "v1" },
      { userId: "member", username: "member", villageId: "v1" },
      { userId: "outsider", username: "outsider", villageId: "v2" },
    ]);
    await db.insert(village).values({ id: "v1", name: "Test village", kageId: "leader", type: "VILLAGE", tokens: 500_000, structureMaintenanceMonth: "2026-09" });
    await db.insert(villageStructure).values({ id: "bank", name: "Bank", route: "/bank", image: "", villageId: "v1", level: 1 });
    await insertQuests([1, 2].map((id) => ({ id: `mission-${id}`, name: `Mission ${id}`, questType: "village_mission", questRank: "S", hidden: false, consecutiveObjectives: false, content: { reward: ObjectiveReward.parse({ reward_tokens: 100_000 }), objectives: [SimpleObjective.parse(objective)], sceneBackground: "", sceneCharacters: [] } })));
  });

  it("only the Kage can select; racing starts leave exactly one active mission", async () => {
    expect((await (await callerFor(villageMissionRouter, "member")).select({ villageId: "v1" })).success).toBe(false);
    const caller = await leader();
    const results = await Promise.all([caller.select({ villageId: "v1" }), caller.select({ villageId: "v1" })]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect((await state())?.activeMission).not.toBeNull();
    expect(await (await callerFor(villageMissionRouter, "outsider")).get({ id: "v1" })).toBeNull();
  });

  it("aggregates villagers atomically, denies early claims and grants a concurrent reward once", async () => {
    const db = await getTestDatabase();
    const caller = await leader();
    await caller.select({ villageId: "v1" });
    const missionId = (await state())?.activeMission?.id;
    expect((await caller.claim({ villageId: "v1", missionId })).success).toBe(false);
    await recordVillageMissionProgress(db, "v1", "outsider", { combined_mission_effort: 100 });
    await Promise.all(Array.from({ length: 14 }, (_, i) => recordVillageMissionProgress(db, "v1", i % 2 ? "member" : "leader", { combined_mission_effort: 1 })));
    expect((await caller.get({ id: "v1" }))?.mission?.objectives[0]?.current).toBe(14);
    const results = await Promise.all([caller.claim({ villageId: "v1", missionId }), caller.claim({ villageId: "v1", missionId })]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect((await state())?.tokens).toBe(600_000);
    expect((await state())?.activeMission).toBeNull();
    await caller.select({ villageId: "v1" });
    expect((await caller.get({ id: "v1" }))?.mission?.objectives[0]?.current).toBe(0);
  });

  it("rerolls to a different mission once and starts a new baseline", async () => {
    const db = await getTestDatabase(); const caller = await leader();
    await caller.select({ villageId: "v1" });
    const initial = (await state())?.activeMission;
    await recordVillageMissionProgress(db, "v1", "member", { combined_mission_effort: 7 });
    const results = await Promise.all([caller.select({ villageId: "v1", missionId: initial?.id }), caller.select({ villageId: "v1", missionId: initial?.id })]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    const rerolled = (await state())?.activeMission;
    expect(rerolled?.questId).not.toBe(initial?.questId);
    expect((await caller.get({ id: "v1" }))?.mission?.objectives[0]?.current).toBe(0);
    expect((await caller.select({ villageId: "v1", missionId: rerolled?.id })).success).toBe(false);
  });

  it("bills once per UTC month, pays automatically and carries insufficient-funds debt", async () => {
    const db = await getTestDatabase(); const now = new Date("2026-10-01T00:00:00Z");
    await Promise.all([accrueVillageStructureMaintenance(db, now), accrueVillageStructureMaintenance(db, now)]);
    expect((await state())?.tokens).toBe(400_000);
    expect((await state())?.structureMaintenanceDue).toBe(0);
    await db.update(village).set({ tokens: 0 }).where(eq(village.id, "v1"));
    await accrueVillageStructureMaintenance(db, new Date("2026-12-01T00:00:00Z"));
    expect((await state())?.structureMaintenanceDue).toBe(200_000);
    const kage = await callerFor(kageRouter, "leader");
    expect((await kage.upgradeStructure({ structureId: "bank", villageId: "v1" })).success).toBe(false);
    await db.update(village).set({ tokens: 200_000 }).where(eq(village.id, "v1"));
    const payments = await Promise.all([kage.payStructureMaintenance({ villageId: "v1" }), kage.payStructureMaintenance({ villageId: "v1" })]);
    expect(payments.filter((r) => r.success)).toHaveLength(1);
    expect((await state())?.tokens).toBe(0);
  });

  it("racing structure upgrades charge only once and reject maximum level", async () => {
    const caller = await callerFor(kageRouter, "leader"); const db = await getTestDatabase();
    const results = await Promise.all([caller.upgradeStructure({ structureId: "bank", villageId: "v1" }), caller.upgradeStructure({ structureId: "bank", villageId: "v1" })]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect((await state())?.tokens).toBe(350_000);
    expect((await db.query.villageStructure.findFirst({ where: eq(villageStructure.id, "bank") }))?.level).toBe(2);
    await db.update(villageStructure).set({ level: 10 }).where(eq(villageStructure.id, "bank"));
    expect((await caller.upgradeStructure({ structureId: "bank", villageId: "v1" })).success).toBe(false);
    expect((await state())?.tokens).toBe(350_000);
  });
  it("credits only shrine HP actually removed, including simultaneous overkill and ended wars", async () => {
    const db = await getTestDatabase();
    await (await leader()).select({ villageId: "v1" });
    await db.insert(war).values({ id: "w1", attackerVillageId: "v1", defenderVillageId: "v2", type: "VILLAGE_WAR", status: "ACTIVE", sector: 12, defenderShrineHp: 15, defenderShrineMaxHp: 100 });
    const persisted = await db.query.war.findFirst({ where: eq(war.id, "w1") });
    const battle = { battleType: "COMBAT", usersState: [
      { userId: "member", villageId: "v1", isAi: false, sector: 12, warIds: ["w1"] },
      { userId: "outsider", villageId: "v2", isAi: false, sector: 12, warIds: ["w1"] },
    ], extraState: { wars: { w1: { ...persisted, warAllies: [] } } } } as unknown as CompleteBattle;
    const settle = () => updateWars(db, {} as never, battle, { didWin: 1, shrineChangeHp: -10, villageWarShrineInfo: { w1: { attacker: 0, defender: -10 } }, warHealthChange: 0, notifications: [] } as unknown as CombatResult, "member");
    await Promise.all([settle(), settle()]);
    expect((await state())?.missionCounters.siege_operation).toBe(15);
    expect((await db.query.war.findFirst({ where: eq(war.id, "w1") }))?.defenderShrineHp).toBe(0);
    await settle();
    expect((await state())?.missionCounters.siege_operation).toBe(15);
    await db.update(war).set({ defenderShrineHp: 50, endedAt: new Date() }).where(eq(war.id, "w1"));
    await settle();
    expect((await state())?.missionCounters.siege_operation).toBe(15);
    expect((await db.query.war.findFirst({ where: eq(war.id, "w1") }))?.defenderShrineHp).toBe(50);
  });

});
