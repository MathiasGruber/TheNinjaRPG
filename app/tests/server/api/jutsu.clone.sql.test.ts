import { beforeEach, expect, it } from "bun:test";
import { actionLog, jutsu, userData } from "@/drizzle/schema";
import { jutsuRouter } from "@/server/api/routers/jutsu";
import { insertUsers } from "../../setup/factories";
import {
  callerFor,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
  runRawSql,
} from "../../setup/testDatabase";

describeWithDatabase("jutsu clone audit atomicity", () => {
  beforeEach(async () => {
    await resetTables(actionLog, jutsu, userData);
    await insertUsers([{ userId: "clone-editor", username: "Editor", role: "CONTENT" }]);
    const database = await getTestDatabase();
    await database.insert(jutsu).values({
      id: "clone-source",
      name: "Fireball",
      description: "A fire technique",
      battleDescription: "%user uses %jutsu",
      effects: [],
      target: "SELF",
      range: 0,
      requiredRank: "GENIN",
      jutsuType: "NORMAL",
      image: "/fireball.webp",
    });
  });

  it("rolls back the copy when its audit fails, then allows one clean retry", async () => {
    const database = await getTestDatabase();
    const caller = await callerFor(jutsuRouter, "clone-editor");
    await runRawSql(
      "CREATE TRIGGER reject_clone_audit BEFORE INSERT ON ActionLog FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit unavailable'",
    );
    try {
      await expect(caller.clone({ id: "clone-source" })).rejects.toThrow();
      expect(await database.select({ id: jutsu.id }).from(jutsu)).toEqual([
        { id: "clone-source" },
      ]);
      expect(await database.select().from(actionLog)).toEqual([]);
    } finally {
      await runRawSql("DROP TRIGGER reject_clone_audit");
    }

    const result = await caller.clone({ id: "clone-source" });
    expect(result.success).toBe(true);
    expect(await database.select({ id: jutsu.id }).from(jutsu)).toHaveLength(2);
    const logs = await database.select().from(actionLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      userId: "clone-editor",
      relatedId: result.message,
      relatedMsg: `Clone: Fireball - copy ${result.message}`,
      changes: ["Cloned from Fireball"],
    });
  });
});
