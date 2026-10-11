import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { userData } from "@/drizzle/schema";
import { profileRouter } from "@/server/api/routers/profile";
import { insertUsers } from "../../setup/factories";
import {
  callerFor,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

const stubRateLimitTransport = () => {
  const realFetch = globalThis.fetch;
  // Keep the middleware active without requiring Redis in SQL tests.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (typeof init?.body !== "string" || !init.body.includes("trpc-ratelimit")) {
      return realFetch(input, init);
    }
    const commands = JSON.parse(init.body) as unknown[];
    const resultFor = (command: unknown[]) => ({
      result: command[0] === "evalsha" || command[0] === "eval" ? [59, 60] : 1,
    });
    return Response.json(
      Array.isArray(commands[0])
        ? commands.map((command) => resultFor(command as unknown[]))
        : resultFor(commands),
    );
  });
};

describeWithDatabase("public PvP record visibility", () => {
  beforeEach(async () => {
    stubRateLimitTransport();
    await resetTables(userData);
    await insertUsers([
      {
        userId: "owner",
        username: "Owner",
        role: "USER",
        pvpWins: 3,
        pvpLosses: 2,
        showPvpRecord: false,
        avatarLight: "",
      },
      { userId: "viewer", username: "Viewer", role: "USER", avatarLight: "" },
      { userId: "staff", username: "Staff", role: "OWNER", avatarLight: "" },
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["viewer", "signed-out"])("hides private records from %s", async (viewer) => {
    const profile = await (await callerFor(profileRouter, viewer)).getPublicUser({
      userId: "owner",
    });
    expect(profile?.pvpWins).toBeNull();
    expect(profile?.pvpLosses).toBeNull();
  });

  it.each(["owner", "staff"])("allows %s to see a private record", async (viewer) => {
    const profile = await (await callerFor(profileRouter, viewer)).getPublicUser({
      userId: "owner",
    });
    expect(profile?.pvpWins).toBe(3);
    expect(profile?.pvpLosses).toBe(2);
  });

  it("publishes the record only after its owner opts in", async () => {
    expect(
      (
        await (
          await callerFor(profileRouter, "owner")
        ).updatePreferences({ showPvpRecord: true })
      ).success,
    ).toBe(true);
    const profile = await (await callerFor(profileRouter, "viewer")).getPublicUser({
      userId: "owner",
    });
    expect(profile?.pvpWins).toBe(3);
    expect(profile?.pvpLosses).toBe(2);
    expect(
      (
        await (
          await getTestDatabase()
        ).query.userData.findFirst({ where: eq(userData.userId, "owner") })
      )?.showPvpRecord,
    ).toBe(true);
  });
});
