import { afterEach, beforeEach, expect, it, setSystemTime } from "bun:test";
import { eq } from "drizzle-orm";
import { KAGE_PRESTIGE_REQUIREMENT } from "@/drizzle/constants";
import {
  notification,
  userData,
  village,
  villageElderVote,
  villageElderVoteEntry,
} from "@/drizzle/schema";
import { kageRouter } from "@/server/api/routers/kage";
import { insertUsers } from "../../setup/factories";
import {
  callerFor,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

const now = new Date("2026-10-12T12:00:00.000Z");
const tenureStart = new Date("2026-09-28T12:00:00.000Z");

describeWithDatabase("elder kage removal protection", () => {
  beforeEach(async () => {
    setSystemTime(now);
    await resetTables(notification, userData, village, villageElderVote, villageElderVoteEntry);
    const db = await getTestDatabase();
    await db.insert(village).values({
      id: "removal-village", name: "Removal village", kageId: "kage", leaderUpdatedAt: tenureStart,
    });
    await insertUsers([
      { userId: "kage", villageId: "removal-village", villagePrestige: KAGE_PRESTIGE_REQUIREMENT },
      ...["elder-1", "elder-2", "elder-3"].map((userId) => ({
        userId, villageId: "removal-village", rank: "ELDER" as const, villagePrestige: KAGE_PRESTIGE_REQUIREMENT,
      })),
    ]);
  });

  afterEach(() => setSystemTime());

  it.each([
    new Date("2026-10-08T12:00:00.000Z"),
    new Date("2026-09-28T12:00:00.001Z"),
  ])("rejects initiation before 14 days without creating votes or notifications (tenure %s)", async (leaderUpdatedAt) => {
    const db = await getTestDatabase();
    await db.update(village).set({ leaderUpdatedAt }).where(eq(village.id, "removal-village"));
    const result = await (await callerFor(kageRouter, "elder-1")).initiateKageRemovalVote({ villageId: "removal-village" });
    expect(result.success).toBe(false);
    expect(result.message).toContain("protected");
    expect(await db.query.villageElderVote.findMany()).toHaveLength(0);
    expect(await db.query.notification.findMany()).toHaveLength(0);
  });

  it("allows initiation at exactly 14 days", async () => {
    const result = await (await callerFor(kageRouter, "elder-1")).initiateKageRemovalVote({ villageId: "removal-village" });
    expect(result.success).toBe(true);
    const db = await getTestDatabase();
    expect(await db.query.villageElderVote.findMany()).toHaveLength(1);
    expect(await db.query.notification.findMany()).toHaveLength(3);
  });

  it.each([true, false])("enforces protection on existing motions at removal time (protected: %s)", async (isProtected) => {
    const db = await getTestDatabase();
    if (isProtected) {
      await db.update(village).set({ leaderUpdatedAt: new Date("2026-10-07T12:00:00.000Z") }).where(eq(village.id, "removal-village"));
    }
    await db.insert(villageElderVote).values({
      id: "removal-vote", villageId: "removal-village", type: "KAGE_REMOVAL", initiatedByUserId: "elder-1",
      targetId: "kage", endsAt: new Date("2026-10-14T12:00:00.000Z"),
    });
    await db.insert(villageElderVoteEntry).values({ id: "first-yes", voteId: "removal-vote", userId: "elder-1", vote: "YES" });
    const result = await (await callerFor(kageRouter, "elder-2")).voteOnKageRemoval({ voteId: "removal-vote", vote: "YES" });
    const [storedVillage, storedKage, vote, notices] = await Promise.all([
      db.query.village.findFirst(), db.query.userData.findFirst({ where: eq(userData.userId, "kage") }),
      db.query.villageElderVote.findFirst(), db.query.notification.findMany(),
    ]);
    expect(result.success).toBe(!isProtected);
    expect(vote?.status).toBe(isProtected ? "REJECTED" : "APPROVED");
    if (isProtected) {
      expect(result.message).toContain("protected");
      expect(storedVillage?.kageId).toBe("kage");
      expect(storedKage?.villagePrestige).toBe(KAGE_PRESTIGE_REQUIREMENT);
      expect(notices).toHaveLength(0);
    } else {
      expect(storedVillage?.kageId).not.toBe("kage");
      expect(storedVillage?.leaderUpdatedAt).toEqual(now);
      expect(storedKage?.villagePrestige).toBe(0);
      expect(notices.length).toBeGreaterThan(0);
    }
  });
});
