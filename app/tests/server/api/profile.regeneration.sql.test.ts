import { afterEach, beforeEach, expect, it, setSystemTime, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { VILLAGE_SYNDICATE_ID } from "@/drizzle/constants";
import { bloodline, gameSetting, trainingLog, userData, userQueue, userVote, village, villageStructure } from "@/drizzle/schema";
import { calcCurrent } from "@/layout/StatusBar";
import { Pusher } from "@/libs/pusher";
import { fetchUpdatedUser } from "@/server/api/routers/profile";
import { insertUsers } from "../../setup/factories";
import { queueEnergy } from "../../setup/queues";
import { describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const NOW = new Date("2026-10-14T12:00:00Z");

describeWithDatabase("profile regeneration after village expulsion", () => {
  beforeEach(async () => {
    setSystemTime(NOW);
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    await resetTables(trainingLog, userQueue, userVote, userData, village, villageStructure, bloodline, gameSetting);
    const db = await getTestDatabase();
    await db.insert(village).values([
      { id: "home", name: "Home", type: "VILLAGE", sector: 1, kageId: "" },
      { id: VILLAGE_SYNDICATE_ID, name: "Syndicate", type: "OUTLAW", sector: 2, kageId: "" },
    ]);
    await insertUsers([{
      userId: "expelled", villageId: "home", villagePrestige: -100,
      rank: "JONIN", level: 50, status: "AWAKE", regeneration: 100,
      joinedVillageAt: new Date(NOW.getTime() - 100 * 86_400_000),
      regenAt: new Date(NOW.getTime() - 60_000), updatedAt: NOW,
      curHealth: 0, curChakra: 0, curStamina: 0, curEnergy: 0,
      maxHealth: 1000, maxChakra: 1000, maxStamina: 1000,
      primaryElement: "Fire", secondaryElement: "Water",
    }]);
  });
  afterEach(() => { setSystemTime(); vi.restoreAllMocks(); });

  it("settles accrued ticks at the member rate and projects future ticks at the outlaw rate", async () => {
    const db = await getTestDatabase();
    const first = await fetchUpdatedUser({ client: db, userId: "expelled" });
    const persisted = await db.query.userData.findFirst({ where: eq(userData.userId, "expelled") });
    const next = await fetchUpdatedUser({ client: db, userId: "expelled" });
    expect(first.user).toMatchObject({ isOutlaw: true, regeneration: 50, regenerationWithoutTimedBuffs: 50, curHealth: 115, curChakra: 115, curStamina: 115 });
    expect(persisted).toMatchObject({ regeneration: 100, curHealth: 115, regenAt: NOW,
      villagePrestige: 100, villageId: VILLAGE_SYNDICATE_ID, isOutlaw: true, joinedVillageAt: NOW,
    });
    expect(next.user?.regeneration).toBe(first.user?.regeneration);
    expect(next.user?.regenerationWithoutTimedBuffs).toBe(first.user?.regenerationWithoutTimedBuffs);
    setSystemTime(new Date(NOW.getTime() + 60_000));
    expect(calcCurrent(first.user?.curHealth, first.user?.maxHealth, first.user?.status, first.user?.regenerationWithoutTimedBuffs, first.user?.regenAt, 0, undefined, first.user?.raidBuffs).current).toBe(165);
  });

  it("returns the outlaw rate without an accrued regeneration tick", async () => {
    const db = await getTestDatabase();
    await db.update(userData).set({ status: "BATTLE", battleId: "battle-1", regenAt: NOW }).where(eq(userData.userId, "expelled"));
    const first = await fetchUpdatedUser({ client: db, userId: "expelled" });
    const next = await fetchUpdatedUser({ client: db, userId: "expelled" });
    expect(first.user).toMatchObject({ regeneration: 50, regenerationWithoutTimedBuffs: 50, curHealth: 0, curEnergy: 0 });
    expect(next.user?.regeneration).toBe(first.user?.regeneration);
  });

  it.each([
    { status: "AWAKE", homeWar: 0, syndicateStructure: 0, syndicateWar: 0, accrued: 138, future: 50 },
    { status: "AWAKE", homeWar: 40, syndicateStructure: 10, syndicateWar: 20, accrued: 193, future: 66 },
    { status: "BATTLE", homeWar: 0, syndicateStructure: 0, syndicateWar: 0, accrued: 0, future: 50 },
    { status: "BATTLE", homeWar: 40, syndicateStructure: 10, syndicateWar: 20, accrued: 0, future: 66 },
  ] as const)("uses destination structure and war regeneration after expulsion (%j)", async ({ status, homeWar, syndicateStructure, syndicateWar, accrued, future }) => {
    const db = await getTestDatabase();
    await Promise.all([
      db.insert(villageStructure).values([
        { id: "home-regen", villageId: "home", name: "Recovery", image: "", level: 1, regenIncreasePerLvl: 20 },
        { id: "syndicate-regen", villageId: VILLAGE_SYNDICATE_ID, name: "Recovery", image: "", level: 1, regenIncreasePerLvl: syndicateStructure },
      ]),
      db.insert(gameSetting).values([
        { id: "home-war-regen", name: "war-home-regen", value: homeWar, time: new Date(NOW.getTime() + 86_400_000) },
        { id: "syndicate-war-regen", name: `war-${VILLAGE_SYNDICATE_ID}-regen`, value: syndicateWar, time: new Date(NOW.getTime() + 86_400_000) },
      ]),
      db.update(userData).set({ status, battleId: status === "BATTLE" ? "battle-1" : null }).where(eq(userData.userId, "expelled")),
    ]);
    const first = await fetchUpdatedUser({ client: db, userId: "expelled" });
    const persisted = await db.query.userData.findFirst({ where: eq(userData.userId, "expelled") });
    const next = await fetchUpdatedUser({ client: db, userId: "expelled" });
    expect(first.user).toMatchObject({ isOutlaw: true, curHealth: accrued, curChakra: accrued, curStamina: accrued });
    expect(first.user?.regeneration).toBeCloseTo(future);
    expect(first.user?.regenerationWithoutTimedBuffs).toBeCloseTo(future);
    expect(persisted).toMatchObject({ regeneration: 100, curHealth: accrued, curChakra: accrued, curStamina: accrued,
      villagePrestige: 100, villageId: VILLAGE_SYNDICATE_ID, isOutlaw: true, joinedVillageAt: NOW,
      regenAt: status === "BATTLE" ? new Date(NOW.getTime() - 60_000) : NOW,
    });
    expect(next.user?.regeneration).toBe(first.user?.regeneration);
    expect(next.user?.joinedVillageAt).toEqual(NOW);
    setSystemTime(new Date(NOW.getTime() + 60_000));
    if (status === "AWAKE") {
      expect(calcCurrent(first.user?.curHealth, first.user?.maxHealth, first.user?.status, first.user?.regeneration, first.user?.regenAt).current).toBeCloseTo(accrued + future);
    }
  });

  it.each([true, false])("applies bloodline and event modifiers once with expulsion %s", async (isExpelled) => {
    const db = await getTestDatabase();
    await db.insert(bloodline).values({ id: "regen-bloodline", name: "Recovery", image: "", description: "", effects: [], rank: "C", regenIncrease: 20 });
    await db.insert(gameSetting).values({ id: "regen-event", name: "regenGainMultiplier", value: 2, time: new Date(NOW.getTime() + 86_400_000) });
    await db.update(userData).set({ bloodlineId: "regen-bloodline", villagePrestige: isExpelled ? -100 : 100 }).where(eq(userData.userId, "expelled"));
    const first = await fetchUpdatedUser({ client: db, userId: "expelled", forceRegen: true });
    const next = await fetchUpdatedUser({ client: db, userId: "expelled" });
    expect(first.user?.regeneration).toBeCloseTo(isExpelled ? 120 : 276);
    expect(next.user?.regeneration).toBeCloseTo(first.user!.regeneration);
    expect(first.user?.curHealth).toBe(276);
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "expelled") })).toMatchObject({ regeneration: 100, curHealth: 276 });
  });

  it("keeps accrued Energy queue settlement at the member rate", async () => {
    const db = await getTestDatabase();
    await queueEnergy("expelled", [{ stat: "offence", energy: 100 }]);
    const first = await fetchUpdatedUser({ client: db, userId: "expelled" });
    expect(first.user?.regeneration).toBe(50);
    expect(first.user?.curEnergy).toBeCloseTo(15);
    expect(first.user?.energyQueueHead).toBe(1);
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "expelled") })).toMatchObject({ energyQueueHead: 1 });
  });
});
