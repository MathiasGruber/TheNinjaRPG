import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "bun:test";
import mysql from "mysql2/promise";
import { baselineTableSql, quoteIdentifier, type SnapshotTable } from "../setup/migrations";
import { describeWithDatabase, indexColumns } from "../setup/testDatabase";

const logIndex = "BattleAction_battleId_battleRound_battleVersion_idx";

describeWithDatabase("battle action log index", () => {
  it("matches the latest-log order while preserving the action receipt key", async () => {
    expect(await indexColumns("BattleAction", logIndex)).toEqual({
      columns: ["battleId", "battleRound", "battleVersion"], unique: false,
    });
    expect(await indexColumns("BattleAction", "BattleAction_round_key")).toEqual({
      columns: ["battleId", "battleVersion", "battleRound"], unique: true,
    });
  });

  it("migrates populated logs without changing pages or requiring a latest-log sort", async () => {
    const connection = await mysql.createConnection({ uri: process.env.TEST_MYSQL_URL });
    const table = `BattleAction_${randomUUID().replaceAll("-", "")}`;
    const query = <T extends mysql.QueryResult = mysql.QueryResult>(statement: string, values?: unknown[]) =>
      connection.query<T>(statement.replaceAll("`BattleAction`", quoteIdentifier(table)), values);
    try {
      const snapshot = JSON.parse(await readFile("drizzle/migrations/meta/0108_snapshot.json", "utf8")) as { tables: Record<string, SnapshotTable> };
      const baseline = snapshot.tables.BattleAction!;
      await query(baselineTableSql(baseline));
      for (const index of Object.values(baseline.indexes).filter((entry) => !entry.isUnique)) {
        await query(`CREATE INDEX ${quoteIdentifier(index.name)} ON \`BattleAction\` (${index.columns.map(quoteIdentifier).join(", ")})`);
      }
      const values = Array.from({ length: 1000 }, (_, index) => [
        `action-${index}`, "fight", index + 1, Math.floor(index / 4),
        index % 3 ? "strike" : "wait", index % 2 ? "hero" : "opponent", "An action.", "[]",
      ]);
      await query("INSERT INTO `BattleAction` (id,battleId,battleVersion,battleRound,actionId,userId,description,appliedEffects) VALUES ?", [values]);
      await query("ANALYZE TABLE `BattleAction`");
      const latest = "SELECT * FROM `BattleAction` WHERE battleId = 'fight' ORDER BY battleRound DESC,battleVersion DESC LIMIT 30";
      const [beforePlan] = await query<mysql.RowDataPacket[]>(`EXPLAIN ${latest}`);
      expect(beforePlan[0]!.Extra).toContain("Using filesort");
      const variants = ["", " AND userId = 'hero'", " AND userId <> 'hero'"].flatMap((filter) =>
        ["", " AND actionId NOT IN ('wait', 'move', 'flee')"].flatMap((basic) =>
          [0, 30].map((offset) => `SELECT * FROM \`BattleAction\` WHERE battleId = 'fight'${filter}${basic} ORDER BY battleRound DESC,battleVersion DESC LIMIT 30 OFFSET ${offset}`),
        ),
      );
      const before = [];
      for (const statement of variants) before.push((await query<mysql.RowDataPacket[]>(statement))[0]);
      const migration = await readFile("drizzle/migrations/0109_great_black_knight.sql", "utf8");
      expect(migration).not.toContain("--> statement-breakpoint");
      await query(migration);
      await query("ANALYZE TABLE `BattleAction`");
      for (const [index, statement] of variants.entries()) {
        expect((await query<mysql.RowDataPacket[]>(statement))[0]).toEqual(before[index]!);
      }
      const [afterPlan] = await query<mysql.RowDataPacket[]>(`EXPLAIN ${latest}`);
      expect(afterPlan[0]!.key).toBe(logIndex);
      expect(afterPlan[0]!.Extra).not.toContain("filesort");
      // Distinct primary keys must still collide on the same battle/version/round receipt.
      const receipt = (id: string) => query("INSERT INTO `BattleAction` (id,battleId,battleVersion,battleRound,description,appliedEffects) VALUES (?, 'receipt', 1, 1, 'Receipt.', '[]')", [id]);
      const claims = await Promise.allSettled([receipt("claim-one"), receipt("claim-two")]);
      expect(claims.filter((claim) => claim.status === "fulfilled")).toHaveLength(1);
      expect(claims.filter((claim) => claim.status === "rejected")).toHaveLength(1);
      const [indexes] = await query<mysql.RowDataPacket[]>("SHOW INDEX FROM `BattleAction`");
      for (const name of Object.keys(baseline.indexes)) {
        expect(indexes.some((index) => index.Key_name === name)).toBe(true);
      }
    } finally {
      await query("DROP TABLE IF EXISTS `BattleAction`");
      await connection.end();
    }
  });
});
