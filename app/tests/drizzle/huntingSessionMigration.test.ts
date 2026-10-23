import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "bun:test";
import mysql from "mysql2/promise";
import { huntingContract, huntingHabitatContent } from "../setup/hunting";
import { baselineTableSql, quoteIdentifier, type SnapshotTable } from "../setup/migrations";
import { describeWithDatabase } from "../setup/testDatabase";

describeWithDatabase("accepted hunting terms migration", () => {
  it("backfills sessions and retains battle terms without losing unavailable sessions", async () => {
    const connection = await mysql.createConnection({ uri: process.env.TEST_MYSQL_URL, multipleStatements: true });
    const prefix = `hunting_${randomUUID().replaceAll("-", "")}_`;
    const names = ["HuntingSession", "HuntingHabitat", "Battle"];
    const query = <T extends mysql.QueryResult = mysql.QueryResult>(statement: string, values?: unknown[]) =>
      connection.query<T>(statement.replace(/\b(HuntingSession|HuntingHabitat|Battle)\b/g, `${prefix}$1`), values);
    try {
      const snapshot = JSON.parse(await readFile("drizzle/migrations/meta/0106_snapshot.json", "utf8")) as { tables: Record<string, SnapshotTable> };
      for (const name of names) await query(baselineTableSql(snapshot.tables[name]!));
      const content = huntingHabitatContent();
      await query("INSERT INTO HuntingHabitat (id, content, updatedAt) VALUES ('forest', ?, NOW(3))", [JSON.stringify(content)]);
      for (const [userId, habitatId, battleId] of [["accepted", "forest", null], ["fighting", "forest", "fight"], ["missing", "removed", null]]) {
        await query("INSERT INTO HuntingSession (userId, id, habitatId, contractId, sector, battleId, startedAt) VALUES (?, ?, ?, 'contract', 1, ?, NOW(3))", [userId, userId, habitatId, battleId]);
      }
      const battleContract = { ...huntingContract(), name: "Accepted boar", experience: 123 };
      await query("INSERT INTO Battle (id, background, battleType, usersState, usersEffects, groundEffects, extraState) VALUES ('fight', 'ground', 'HUNTING', '[]', '[]', '[]', ?)", [JSON.stringify({ hunting: { contract: battleContract } })]);
      const [before] = await query<mysql.RowDataPacket[]>("SELECT * FROM HuntingSession ORDER BY userId");
      const migration = await readFile("drizzle/migrations/0107_kind_sabra.sql", "utf8");
      expect(migration).not.toContain("--> statement-breakpoint");
      await query(migration);
      const [rows] = await query<mysql.RowDataPacket[]>("SELECT * FROM HuntingSession ORDER BY userId");
      expect(rows.map(({ content: _content, ...row }) => row)).toEqual(before);
      expect(rows.find((r) => r.userId === "accepted")!.content).toEqual(content);
      expect(rows.find((r) => r.userId === "fighting")!.content.contracts).toEqual([battleContract]);
      expect(rows.find((r) => r.userId === "missing")!.content).toBeNull();
    } finally {
      await connection.query(`DROP TABLE IF EXISTS ${names.map((name) => quoteIdentifier(prefix + name)).join(", ")}`);
      await connection.end();
    }
  });
});
