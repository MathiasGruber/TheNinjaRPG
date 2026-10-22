import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { DMG_SETTING_DEFAULTS, DMG_SETTING_NAMES } from "@/drizzle/constants";
import { gameSetting } from "@/drizzle/schema";
import { actualGameSettings } from "../setup/preload";
import { baselineTableSql } from "../setup/migrations";
import { describeWithDatabase, getTestDatabase, indexColumns, resetTables, runRawSql } from "../setup/testDatabase";
import snapshot from "../../drizzle/migrations/meta/0104_snapshot.json";

const { fetchDmgConfig, getGameSetting, initializeGameSettings, lockWithDailyTimer } = actualGameSettings;

describeWithDatabase("named game-setting initialization", () => {
  beforeEach(async () => resetTables(gameSetting));

  it("returns one persisted row to concurrent first callers", async () => {
    const database = await getTestDatabase();
    const settings = await Promise.all(Array.from({ length: 10 }, () => getGameSetting(database, "new-setting")));

    const rows = await database.query.gameSetting.findMany();
    expect(rows).toHaveLength(1);
    for (const setting of settings) expect(setting).toEqual(rows[0]!);
    expect(await indexColumns("GameSetting", "GameSetting_name_unique")).toEqual({ columns: ["name"], unique: true });
    await expect(Promise.resolve(database.insert(gameSetting).values({ ...rows[0]!, id: "another-id" }))).rejects.toThrow();
  });

  it("admits exactly one daily claim during concurrent cold start", async () => {
    const database = await getTestDatabase();
    const results = await Promise.all(Array.from({ length: 10 }, () => lockWithDailyTimer(database, "new-daily")));

    expect(results.filter(({ isNewDay }) => isNewDay)).toHaveLength(1);
    expect(await database.query.gameSetting.findMany()).toHaveLength(1);
    expect((await lockWithDailyTimer(database, "new-daily")).isNewDay).toBe(false);
  });

  it("preserves saved values and timestamps when batch initialization races", async () => {
    const database = await getTestDatabase();
    const saved = { id: "saved-boost", name: "war-village-regen", value: 25, time: new Date("2026-10-30T12:00:00.123Z") };
    await database.insert(gameSetting).values(saved);
    await Promise.all(Array.from({ length: 5 }, () => initializeGameSettings(database, [
      { name: saved.name, value: 0, time: new Date(0) },
      { name: "new-boost", value: 0, time: new Date(0) },
    ])));

    expect(await database.query.gameSetting.findFirst({ where: eq(gameSetting.name, saved.name) })).toEqual(saved);
    expect(await database.query.gameSetting.findMany()).toHaveLength(2);
  });

  it("initializes damage defaults concurrently without overwriting staff configuration", async () => {
    const database = await getTestDatabase();
    await database.insert(gameSetting).values({ id: "staff-scaling", name: "DMG_STATS_SCALING", value: 3, time: new Date() });
    const configs = await Promise.all(Array.from({ length: 5 }, () => fetchDmgConfig(database)));

    expect(await database.query.gameSetting.findMany()).toHaveLength(DMG_SETTING_NAMES.length);
    for (const config of configs) {
      expect(config.stats_scaling).toBe(3);
      expect(config.base_hits).toBe(DMG_SETTING_DEFAULTS.DMG_BASE_HITS ?? 0);
    }
  });
});

const fixtureTable = "GameSettingMigration";
const migration = readFileSync(new URL("../../drizzle/migrations/0105_unique_game_setting_names.sql", import.meta.url), "utf8").replaceAll("`GameSetting`", "`GameSettingMigration`");

describeWithDatabase("game-setting name reconciliation migration", () => {
  beforeEach(async () => {
    await runRawSql(baselineTableSql({ ...snapshot.tables.GameSetting, name: fixtureTable }));
    await runRawSql("CREATE INDEX `name` ON `GameSettingMigration` (`name`)");
  });
  afterEach(async () => runRawSql("DROP TABLE IF EXISTS `GameSettingMigration`"));

  it("collapses only identical state and enforces one row per name", async () => {
    const database = await getTestDatabase();
    await database.execute(sql`INSERT INTO GameSettingMigration (id, name, time, value) VALUES
      ('b', 'same', '2026-10-01 12:00:00.123', 42),
      ('a', 'same', '2026-10-01 12:00:00.123', 42),
      ('c', 'other', '2026-10-02 12:00:00.456', 7)`);

    await runRawSql(migration);

    const [rows] = await database.execute(sql`SELECT id, name, value, DATE_FORMAT(time, '%Y-%m-%d %H:%i:%s.%f') AS stamp FROM GameSettingMigration ORDER BY id`) as unknown as [{ id: string; name: string; value: number; stamp: string }[]];
    expect(rows).toEqual([
      { id: "a", name: "same", value: 42, stamp: "2026-10-01 12:00:00.123000" },
      { id: "c", name: "other", value: 7, stamp: "2026-10-02 12:00:00.456000" },
    ]);
    expect(await indexColumns(fixtureTable, "GameSetting_name_unique")).toEqual({ columns: ["name"], unique: true });
    await expect(database.execute(sql`INSERT INTO GameSettingMigration VALUES ('d', 'same', NOW(3), 0)`)).rejects.toThrow();
  });

  it.each([
    ["different timestamps", "2026-10-02 12:00:00.123", 42],
    ["different values", "2026-10-01 12:00:00.123", 99],
  ])("refuses to choose between %s and preserves both rows and the lookup index", async (_label, time, value) => {
    const database = await getTestDatabase();
    await database.execute(sql`INSERT INTO GameSettingMigration VALUES
      ('a', 'conflict', '2026-10-01 12:00:00.123', 42),
      ('b', 'conflict', ${time}, ${value})`);
    const readRows = () => database.execute(sql`SELECT * FROM GameSettingMigration ORDER BY id`);
    const before = await readRows();

    await expect(runRawSql(migration)).rejects.toThrow();

    expect(await readRows()).toEqual(before);
    expect(await indexColumns(fixtureTable, "name")).toEqual({ columns: ["name"], unique: false });
  });
});
