import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { and, eq } from "drizzle-orm";
import { userData, userRequest, village } from "@/drizzle/schema";
import { getServerPusher } from "@/libs/pusher";
import * as combat from "@/server/api/routers/combat";
import { kageRouter } from "@/server/api/routers/kage";
import * as sparring from "@/server/api/routers/sparring";
import { insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

describeWithDatabase("kage acceptance generated prestige PvP boost", () => {
  beforeEach(async () => {
    await resetTables(userRequest, userData, village);
    const db = await getTestDatabase();
    await db.insert(village).values({ id: "pvp-home", name: "PvP home", sector: 30, kageId: "pvp-kage" });
    await insertUsers([
      { userId: "pvp-kage", username: "pvp-kage", villageId: "pvp-home", rank: "JONIN", status: "AWAKE", pvpExperience: 1400, villagePrestige: 10000 },
      { userId: "pvp-challenger", username: "pvp-challenger", villageId: "pvp-home", rank: "JONIN", status: "AWAKE", pvpExperience: 600 },
    ]);
    await db.insert(userRequest).values({ id: "pvp-challenge", senderId: "pvp-challenger", receiverId: "pvp-kage", status: "PENDING", type: "KAGE" });
    // Read real fixture rows even when another suite replaces the shared request helper.
    vi.spyOn(sparring, "fetchRequest").mockImplementation(async (client, id, type) => {
      const request = await client.query.userRequest.findFirst({ where: and(eq(userRequest.id, id), eq(userRequest.type, type)) });
      if (!request) throw new Error("Missing challenge fixture");
      return request;
    });
    vi.spyOn(getServerPusher(), "trigger").mockResolvedValue({} as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([true, false])("pays boosted prestige only after successful initiation=%s", async success => {
    // Isolate the acceptance payout while keeping its request guards and writes on real SQL.
    const initiation = vi.spyOn(combat, "initiateBattle").mockResolvedValue({ success, message: "Initiation result" } as never);
    const db = await getTestDatabase();
    const caller = await callerFor(kageRouter, "pvp-kage");
    const result = await caller.acceptChallenge({ id: "pvp-challenge" });
    expect(result).toMatchObject({ success });
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "pvp-kage") })).toMatchObject({ villagePrestige: success ? 12300 : 10000 });
    expect(await db.query.userRequest.findFirst({ where: eq(userRequest.id, "pvp-challenge") })).toMatchObject({ status: success ? "ACCEPTED" : "PENDING" });
    if (success) {
      expect((await caller.acceptChallenge({ id: "pvp-challenge" })).success).toBe(false);
      expect(initiation).toHaveBeenCalledTimes(1);
      expect(await db.query.userData.findFirst({ where: eq(userData.userId, "pvp-kage") })).toMatchObject({ villagePrestige: 12300 });
    }
  });
});
