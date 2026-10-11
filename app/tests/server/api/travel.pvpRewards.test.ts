import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { MAP_WAR_TORN_BATTLEGROUND_SECTOR } from "@/drizzle/constants";
import { actionLog, userData, village } from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { travelRouter } from "@/server/api/routers/travel";
import { insertUsers } from "../../setup/factories";
import { beforeStatements } from "../../setup/statements";
import { callerFor, callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const ROBBER = "pvp-robber";
const VICTIM = "pvp-victim";
const location = { sector: MAP_WAR_TORN_BATTLEGROUND_SECTOR, longitude: 10, latitude: 10 };
const readRobber = async () => (await getTestDatabase()).query.userData.findFirst({ where: eq(userData.userId, ROBBER) });

const stubRateLimitTransport = () => {
  const realFetch = globalThis.fetch;
  // Keep rate-limit middleware active, stubbing only Redis transport for this test.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (typeof init?.body !== "string" || !init.body.includes("trpc-ratelimit")) {
      return realFetch(input, init);
    }
    const commands = JSON.parse(init.body) as unknown[];
    const resultFor = (command: unknown[]) => ({
      result: command[0] === "evalsha" || command[0] === "eval" ? [59, 60] : 1,
    });
    const response = Array.isArray(commands[0])
      ? commands.map((command) => resultFor(command as unknown[]))
      : resultFor(commands);
    return Response.json(response);
  });
};

describeWithDatabase("robbery generated prestige PvP boost", () => {
  beforeEach(async () => {
    stubRateLimitTransport();
    await resetTables(actionLog, userData, village);
    await insertUsers([
      { userId: ROBBER, username: ROBBER, rank: "JONIN", isOutlaw: true, status: "AWAKE", ...location, pvpExperience: 1400, money: 500, villagePrestige: 0 },
      { userId: VICTIM, username: VICTIM, rank: "JONIN", status: "AWAKE", ...location, pvpExperience: 600, money: 1000, immunityUntil: new Date(0), robImmunityUntil: new Date(0) },
    ]);
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([{ xp: 1400, prestige: 5.75 }, { xp: 0, prestige: 5 }])("boosts generated prestige for XP=$xp while preserving stolen ryo", async ({ xp, prestige }) => {
    const db = await getTestDatabase();
    await db.update(userData).set({ pvpExperience: xp }).where(eq(userData.userId, ROBBER));
    const result = await (await callerFor(travelRouter, ROBBER)).robPlayer({ userId: VICTIM, ...location });
    expect(result.success).toBe(true);
    expect(result.money).toBe(800);
    expect(await readRobber()).toMatchObject({ money: 800, villagePrestige: prestige });
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, VICTIM) })).toMatchObject({ money: 700 });
  });

  it("rolls back the entire boosted prestige award when the target deduction fails", async () => {
    const db = await getTestDatabase();
    const client = beforeStatements(db, userData, [async () => {}, async () => {
      await db.delete(userData).where(eq(userData.userId, VICTIM));
    }]);
    const result = await callerForDatabase(travelRouter, ROBBER, client).robPlayer({ userId: VICTIM, ...location });
    expect(result.success).toBe(false);
    expect(await readRobber()).toMatchObject({ money: 500, villagePrestige: 0 });
    expect(await db.query.actionLog.findMany()).toHaveLength(0);
  });
});
