import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { eq, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  mpvpBattleUser,
  rankedPvpQueue,
  userData,
  userRequest,
  village,
  war,
  warAlly,
} from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import { acceptWarAllyOffer } from "@/server/utils/warAlly";
import * as contentReviewCleanup from "@/libs/contentReview/cleanup";
import * as gamesettings from "@/libs/gamesettings";
import * as travel from "@/routers/travel";
import * as raids from "@/routers/raids";
import * as grant from "@/server/utils/purchases/grant";
import * as processor from "@/server/utils/accountDeletion/process";
import { stubDatabase, resetServerModuleStubs } from "../../../setup/serverModules";
import { GET } from "@/app/api/cleaner/route";
import { insertUsers } from "../../../setup/factories";
import {
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../../setup/testDatabase";

const originalEnv = { ...process.env };

const mocks = { process: vi.fn(), lock: vi.fn(), reset: vi.fn(), execute: vi.fn() };

const request = (secret = "test-cron") => new Request("https://example.com/api/cleaner", {
  headers: { authorization: `Bearer ${secret}` },
});

const dialect = new MySqlDialect();
const offer = {
  offerId: "expiring-offer",
  warId: "expiry-war",
  villageId: "joining",
  supportVillageId: "supporting",
  userId: "joining-kage",
};
const addOffer = (db: DrizzleClient, offerId = offer.offerId) => db.insert(userRequest).values({
  id: offerId,
  type: "WAR_ALLY",
  status: "PENDING",
  senderId: "supporting-kage",
  receiverId: offer.userId,
  relatedId: offer.warId,
  value: 100,
  createdAt: new Date(Date.now() - 25 * 3_600_000),
});

const expireRequests = async (db: DrizzleClient) => {
  stubDatabase({
    execute: (query: SQL) => {
      const statement = dialect.sqlToQuery(query).sql;
      return statement.includes("DELETE") && statement.includes("UserRequest")
        ? db.execute(query)
        : Promise.resolve({ rowsAffected: 0 });
    },
    delete: (table: object) => table === userRequest ? db.delete(userRequest) : ({ where: vi.fn().mockResolvedValue(undefined) }),
    update: () => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) }),
  });
  vi.spyOn(gamesettings, "lockWithHourlyTimer").mockResolvedValue({ isNewHour: true, prevTime: new Date(0) } as Awaited<ReturnType<typeof gamesettings.lockWithHourlyTimer>>);
  vi.spyOn(gamesettings, "lockWithDailyTimer").mockResolvedValue({ isNewDay: false } as Awaited<ReturnType<typeof gamesettings.lockWithDailyTimer>>);
  vi.spyOn(travel, "completeExpiredGlobalTravel").mockResolvedValue(undefined);
  vi.spyOn(raids, "cleanupExpiredExclusiveRaids").mockResolvedValue(0);
  vi.spyOn(contentReviewCleanup, "cleanupContentProposals").mockResolvedValue({ removed: 0, filesDeleted: 0 });
  vi.spyOn(grant, "reconcileFederalStatuses").mockImplementation(vi.fn());
  vi.spyOn(processor, "processAccountDeletions").mockResolvedValue({ processed: 0, failed: 0 });
  process.env["CRON_SECRET"] = "test-cron";
  expect((await GET(request())).status).toBe(200);
};

describeWithDatabase("war ally reservations during request expiry", () => {
  beforeEach(async () => {
    await resetTables(userRequest, warAlly, war, village);
    const db = await getTestDatabase();
    await db.insert(village).values(["supporting", "joining", "defending"].map((id, index) => ({
      id, name: id, sector: 101 + index, kageId: `${id}-kage`, tokens: 1000,
    })));
    await db.insert(war).values({ id: offer.warId, type: "VILLAGE_WAR", status: "ACTIVE", attackerVillageId: "supporting", defenderVillageId: "defending" });
    await addOffer(db);
  });

  it("releases an interrupted reservation so a replacement offer can pay once", async () => {
    const db = await getTestDatabase();
    const interrupted = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "execute") return (query: SQL) => {
          if (dialect.sqlToQuery(query).sql.includes("UPDATE `UserRequest` r")) throw new Error("Payment interrupted");
          return target.execute(query);
        };
        return Reflect.get(target, property, receiver);
      },
    });
    await expect(acceptWarAllyOffer(interrupted, offer)).rejects.toThrow("Payment interrupted");
    expect(await db.select().from(warAlly)).toHaveLength(1);
    await expireRequests(db);
    expect(await db.select().from(userRequest)).toHaveLength(0);
    expect(await db.select().from(warAlly)).toHaveLength(0);
    await addOffer(db, "replacement-offer");
    const replacement = { ...offer, offerId: "replacement-offer" };
    expect((await Promise.all([acceptWarAllyOffer(db, replacement), acceptWarAllyOffer(db, replacement)])).every((row) => row.success)).toBe(true);
    expect(await db.select().from(warAlly)).toHaveLength(1);
    expect((await db.query.village.findFirst({ where: eq(village.id, "supporting") }))?.tokens).toBe(900);
    expect((await db.query.village.findFirst({ where: eq(village.id, "joining") }))?.tokens).toBe(1100);
  });

  it("preserves an accepted membership and its payment after the request expires", async () => {
    const db = await getTestDatabase();
    expect((await acceptWarAllyOffer(db, offer)).success).toBe(true);
    const accepted = await db.query.warAlly.findFirst();
    await expireRequests(db);
    expect(await db.select().from(userRequest)).toHaveLength(0);
    expect(await db.query.warAlly.findFirst()).toEqual(accepted);
    expect((await db.query.village.findFirst({ where: eq(village.id, "supporting") }))?.tokens).toBe(900);
    expect((await db.query.village.findFirst({ where: eq(village.id, "joining") }))?.tokens).toBe(1100);
  });

  it("expiry overlapping interrupted admission leaves neither reservation nor payment", async () => {
    const db = await getTestDatabase();
    const overlapping = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "execute") return async (query: SQL) => {
          if (dialect.sqlToQuery(query).sql.includes("UPDATE `UserRequest` r")) {
            await expireRequests(db);
            throw new Error("Payment interrupted after expiry");
          }
          return target.execute(query);
        };
        return Reflect.get(target, property, receiver);
      },
    });
    await expect(acceptWarAllyOffer(overlapping, offer)).rejects.toThrow("Payment interrupted after expiry");
    expect(await db.select().from(userRequest)).toHaveLength(0);
    expect(await db.select().from(warAlly)).toHaveLength(0);
    expect((await db.select().from(village)).every((row) => row.tokens === 1000)).toBe(true);
  });
});

afterEach(() => { process.env = { ...originalEnv }; vi.restoreAllMocks(); resetServerModuleStubs(); });
describe("account deletion in the existing cleaner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubDatabase({ execute: mocks.execute, delete: () => ({ where: vi.fn().mockResolvedValue(undefined) }), update: () => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) }) });
    vi.spyOn(gamesettings, "lockWithHourlyTimer").mockImplementation(mocks.lock);
    vi.spyOn(gamesettings, "lockWithDailyTimer").mockResolvedValue({ isNewDay: false } as Awaited<ReturnType<typeof gamesettings.lockWithDailyTimer>>);
    vi.spyOn(gamesettings, "updateGameSetting").mockImplementation(mocks.reset);
    vi.spyOn(travel, "completeExpiredGlobalTravel").mockResolvedValue(undefined);
    vi.spyOn(raids, "cleanupExpiredExclusiveRaids").mockImplementation(vi.fn());
    vi.spyOn(contentReviewCleanup, "cleanupContentProposals").mockResolvedValue({ removed: 0, filesDeleted: 0 });
    vi.spyOn(grant, "reconcileFederalStatuses").mockImplementation(vi.fn());
    vi.spyOn(processor, "processAccountDeletions").mockImplementation(mocks.process);
    process.env["CRON_SECRET"] = "test-cron";
    mocks.execute.mockResolvedValue([]);
    mocks.process.mockResolvedValue({ processed: 1, failed: 0 });
    mocks.lock.mockResolvedValue({ isNewHour: false, response: Response.json("hourly work already ran") });
  });
  it("skips deletion cleanup with the rest of hourly maintenance", async () => {
    expect((await GET(request())).status).toBe(200);
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("processes due deletions as part of the hourly cleanup", async () => {
    mocks.lock.mockResolvedValueOnce({ isNewHour: true, prevTime: new Date(0) });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.execute).toHaveBeenCalled();
    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(travel.completeExpiredGlobalTravel).toHaveBeenCalledTimes(1);
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("still processes deletions when content review cleanup fails", async () => {
    mocks.lock.mockResolvedValueOnce({ isNewHour: true, prevTime: new Date(0) });
    vi.spyOn(contentReviewCleanup, "cleanupContentProposals").mockRejectedValue(new Error("storage down"));
    expect((await GET(request())).status).toBe(200);
    expect(mocks.process).toHaveBeenCalledTimes(1);
  });
  it("uses the standard cleaner failure and timer rollback for deletion failures", async () => {
    const previous = new Date(0);
    mocks.lock.mockResolvedValueOnce({ isNewHour: true, prevTime: previous });
    mocks.process.mockResolvedValue({ processed: 0, failed: 1 });
    expect((await GET(request())).status).toBe(500);
    expect(mocks.reset).toHaveBeenCalledWith(expect.anything(), "cleaner-hourly", 0, previous);
  });
  describeWithDatabase("ranked queue status repair", () => {
    it("releases an orphan with a provisional ranked row while preserving a claimed queue", async () => {
      const db = await getTestDatabase();
      await resetTables(mpvpBattleUser, rankedPvpQueue, userData);
      await insertUsers([
        { userId: "provisional", username: "provisional", status: "QUEUED" },
        { userId: "claimed", username: "claimed", status: "QUEUED" },
      ]);
      await db.insert(rankedPvpQueue).values([
        { id: "provisional", userId: "provisional", rankedLp: 1000, hasClaimed: false },
        { id: "claimed", userId: "claimed", rankedLp: 1000, hasClaimed: true },
      ]);
      let repairs = 0;
      const dialect = new MySqlDialect();
      mocks.execute.mockImplementation(async (query: SQL) => {
        // Execute the route's queue repair against SQL; unrelated maintenance stays stubbed.
        if (
          /^UPDATE `UserData` a SET a.status="AWAKE" WHERE a.status="QUEUED"/.test(
            dialect.sqlToQuery(query).sql,
          )
        ) {
          repairs += 1;
          return db.execute(query);
        }
        return [];
      });
      mocks.lock.mockResolvedValueOnce({ isNewHour: true, prevTime: new Date(0) });
      expect((await GET(request())).status).toBe(200);
      expect(repairs).toBe(1);
      expect(
        (await db.query.userData.findFirst({
          where: eq(userData.userId, "provisional"),
        }))?.status,
      ).toBe("AWAKE");
      expect(
        (await db.query.userData.findFirst({
          where: eq(userData.userId, "claimed"),
        }))?.status,
      ).toBe("QUEUED");
    });
  });
});
