import { afterEach, beforeEach, expect, it, setSystemTime, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { VILLAGE_SYNDICATE_ID } from "@/drizzle/constants";
import { bloodline, gameSetting, trainingLog, userData, userQueue, userVote, village } from "@/drizzle/schema";
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
    await resetTables(trainingLog, userQueue, userVote, userData, village, bloodline, gameSetting);
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
    expect(first.user).toMatchObject({ isOutlaw: true, regeneration: 50, curHealth: 115, curChakra: 115, curStamina: 115 });
    expect(persisted).toMatchObject({ regeneration: 100, curHealth: 115, regenAt: NOW });
    expect(next.user?.regeneration).toBe(first.user?.regeneration);
    setSystemTime(new Date(NOW.getTime() + 60_000));
    expect(calcCurrent(first.user?.curHealth, first.user?.maxHealth, first.user?.status, first.user?.regeneration, first.user?.regenAt).current).toBe(165);
  });

  it("returns the outlaw rate without an accrued regeneration tick", async () => {
    const db = await getTestDatabase();
    await db.update(userData).set({ status: "BATTLE", battleId: "battle-1", regenAt: NOW }).where(eq(userData.userId, "expelled"));
    const first = await fetchUpdatedUser({ client: db, userId: "expelled" });
    const next = await fetchUpdatedUser({ client: db, userId: "expelled" });
    expect(first.user).toMatchObject({ regeneration: 50, curHealth: 0, curEnergy: 0 });
    expect(next.user?.regeneration).toBe(first.user?.regeneration);
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
