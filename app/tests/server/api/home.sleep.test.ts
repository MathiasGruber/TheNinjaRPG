import { afterEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { userData } from "@/drizzle/schema";
import { Pusher } from "@/libs/pusher";
import { homeRouter } from "@/server/api/routers/home";
import { insertUsers } from "../../setup/factories";
import { resetServerModuleStubs, stubProfile } from "../../setup/serverModules";
import { beforeStatements } from "../../setup/statements";
import { callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const userId = "sleep-account";
describeWithDatabase("sleep status concurrency", () => {
  afterEach(() => { resetServerModuleStubs(); vi.restoreAllMocks(); });
  it.each(["AWAKE", "ASLEEP"] as const)("does not overwrite combat that begins after reading %s", async (status) => {
    await resetTables(userData);
    const database = await getTestDatabase();
    await insertUsers([{ userId, username: userId, status, curHealth: 100, maxHealth: 100 }]);
    const user = await database.query.userData.findFirst({ where: eq(userData.userId, userId) });
    stubProfile("fetchUpdatedUser", async () => ({ user: { ...user, sector: 1, village: { sector: 1 } } }) as never);
    const trigger = vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    // Interleave hospitalization after the profile read and before its guarded write.
    const client = beforeStatements(database, userData, [async () => {
      await database.update(userData).set({ status: "HOSPITALIZED", curHealth: 0 }).where(eq(userData.userId, userId));
    }]);
    const caller = await callerForDatabase(homeRouter, userId, client);
    expect(await caller.toggleSleep()).toEqual({ success: false, message: "Your status changed. Refresh and try again." });
    expect((await database.query.userData.findFirst({ where: eq(userData.userId, userId) }))?.status).toBe("HOSPITALIZED");
    expect(trigger).not.toHaveBeenCalled();
  });
});
