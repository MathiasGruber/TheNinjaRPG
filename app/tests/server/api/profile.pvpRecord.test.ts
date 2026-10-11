import { beforeEach, expect, it } from "bun:test";
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

describeWithDatabase("public PvP record visibility", () => {
  beforeEach(async () => {
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
