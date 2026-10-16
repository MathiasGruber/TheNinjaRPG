import { afterEach, beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { KAGE_WAR_DECLARE_COST, WAR_FUNDS_COST } from "@/drizzle/constants";
import {
  notification,
  userData,
  userRequest,
  village,
  villageAlliance,
} from "@/drizzle/schema";
import { villageRouter } from "@/server/api/routers/village";
import { insertUsers } from "../../setup/factories";
import { resetServerModuleStubs, stubProfile } from "../../setup/serverModules";
import {
  callerForDatabase,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

const kage = "declaring-kage";

const seed = async () => {
  const database = await getTestDatabase();
  await database.insert(village).values(
    ["declaring", "target", "bystander"].map((id, index) => ({
      id,
      name: id,
      sector: 101 + index,
      kageId: id === "declaring" ? kage : `${id}-kage`,
      tokens: WAR_FUNDS_COST * 2,
    })),
  );
  await insertUsers([
    { userId: kage, username: kage, villageId: "declaring", villagePrestige: KAGE_WAR_DECLARE_COST * 2 },
    { userId: "declaring-member", username: "declaring-member", villageId: "declaring" },
    { userId: "target-member", username: "target-member", villageId: "target" },
    { userId: "bystander-member", username: "bystander-member", villageId: "bystander" },
  ]);
  stubProfile("fetchUpdatedUser", async () => ({
    user: await database.query.userData.findFirst({
      where: eq(userData.userId, kage),
      with: { village: true },
    }),
    requiresUserRefresh: false,
  }));
  return database;
};

describeWithDatabase("declare enemy", () => {
  beforeEach(async () => {
    await resetTables(notification, userRequest, villageAlliance, userData, village);
  });
  afterEach(resetServerModuleStubs);

  it("only bumps unread notifications for the two villages involved", async () => {
    const database = await seed();
    const result = await callerForDatabase(villageRouter, kage, database).declareEnemy({
      villageId: "target",
    });
    expect(result.success).toBe(true);

    const users = await database.query.userData.findMany({
      columns: { userId: true, unreadNotifications: true, villagePrestige: true },
    });
    const unread = Object.fromEntries(users.map((u) => [u.userId, u.unreadNotifications]));
    expect(unread).toEqual({
      [kage]: 1,
      "declaring-member": 1,
      "target-member": 1,
      "bystander-member": 0,
    });
    expect(users.find((u) => u.userId === kage)?.villagePrestige).toBe(KAGE_WAR_DECLARE_COST);
    expect(await database.query.notification.findMany()).toHaveLength(1);
  });
});
