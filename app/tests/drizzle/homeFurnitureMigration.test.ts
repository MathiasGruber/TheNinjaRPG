import { readFile } from "node:fs/promises";
import { expect, it } from "bun:test";
import mysql from "mysql2/promise";
import { describeWithDatabase } from "../setup/testDatabase";

describeWithDatabase("home furniture inventory migration", () => {
  it("seeds ordinary furniture and grants starter copies without changing balances or existing inventory", async () => {
    const connection = await mysql.createConnection({
      uri: process.env.TEST_MYSQL_URL,
      multipleStatements: true,
    });
    try {
      // Connection-local temporary tables isolate the baseline schema from other suites.
      const snapshot = JSON.parse(
        await readFile("drizzle/migrations/meta/0077_snapshot.json", "utf8"),
      ) as { tables: Record<string, SnapshotTable> };
      for (const name of ["Item", "UserItem", "UserData"])
        await connection.query(temporaryTableSql(snapshot.tables[name]!));
      for (const [userId, homeType] of [
        ["resident", "PALACE"],
        ["fresh", "NONE"],
        ["u".repeat(191), "STUDIO_APARTMENT"],
      ]) {
        await connection.query(
          "INSERT INTO UserData (userId, username, gender, homeType, money, bank) VALUES (?, ?, 'Other', ?, 100000, 54321)",
          [userId, userId, homeType],
        );
      }
      await connection.query(
        "INSERT INTO Item (id, name, description, image, effects, itemType, rarity, slot, target) VALUES ('gear', 'Existing gear', 'Existing gear', '/gear.webp', JSON_ARRAY(), 'WEAPON', 'COMMON', 'ITEM', 'CHARACTER'); INSERT INTO UserItem (id, userId, itemId, quantity, level, experience, durability, equipped) VALUES ('owned-gear', 'resident', 'gear', 2, 7, 45, 55, 'ITEM_1');",
      );
      const migration = await readFile(
        "drizzle/migrations/0078_icy_princess_powerful.sql",
        "utf8",
      );
      expect(migration).not.toMatch(/JSON_(EXTRACT|SEARCH|CONTAINS|SET)/i);
      await connection.query(migration);
      const [columns] = await connection.query<mysql.RowDataPacket[]>(
        "SHOW COLUMNS FROM UserData",
      );
      expect(
        columns
          .filter((column) => !snapshot.tables.UserData!.columns[column.Field])
          .map((column) => column.Field),
      ).toEqual(["homeFurnitureRevision"]);
      const [inventory] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT * FROM UserItem",
      );
      expect(inventory).toHaveLength(13);
      expect(inventory.find((row) => row.id === "owned-gear")).toMatchObject({
        quantity: 2,
        level: 7,
        experience: 45,
        durability: 55,
        equipped: "ITEM_1",
        storedAtHome: 0,
        homeX: null,
        homeY: null,
      });
      expect(
        inventory
          .filter((row) => row.userId === "fresh")
          .map((row) => [row.itemId, row.homeX, row.homeY, row.homeRotation])
          .sort(),
      ).toEqual([
        ["home-armory", 75, 15.15, 0],
        ["home-bed", 22, 15.15, 0],
        ["home-garden", 86, 90.91, 0],
        ["home-kitchen", 76, 57.58, 0],
      ]);
      expect(
        inventory
          .filter((row) => row.id !== "owned-gear")
          .every(
            (row) =>
              row.id.length === 64 &&
              row.quantity === 1 &&
              row.storedAtHome === 1 &&
              row.equipped === "NONE",
          ),
      ).toBe(true);
      await connection.query(
        "UPDATE Item SET name = 'Staff Rug', cost = 33333 WHERE id = 'home-rug'; UPDATE UserItem SET homeX = 44, homeY = 66 WHERE userId = 'resident' AND itemId = 'home-bed';",
      );
      await connection.query(
        migration.slice(
          migration.indexOf("-- Furnishings use the ordinary content catalogue;"),
        ),
      );
      const [retriedInventory] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT * FROM UserItem",
      );
      expect(retriedInventory).toHaveLength(13);
      expect(
        retriedInventory.find(
          (row) => row.userId === "resident" && row.itemId === "home-bed",
        ),
      ).toMatchObject({ homeX: 44, homeY: 66 });
      const [definitions] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT * FROM Item WHERE itemType = 'FURNITURE'",
      );
      expect(definitions).toHaveLength(12);
      expect(definitions.find((row) => row.id === "home-rug")).toMatchObject({
        name: "Staff Rug",
        cost: 33333,
        furnitureIsFloor: 1,
      });
      expect(definitions.filter((row) => row.cost === 0)).toHaveLength(4);
      expect(
        definitions
          .filter((row) => row.cost === 0)
          .every((row) => !row.inShop && !row.canBeTraded),
      ).toBe(true);
      const [residents] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT money, bank, homeFurnitureRevision FROM UserData",
      );
      expect(
        residents.every(
          (row) =>
            row.money === 100000 &&
            row.bank === 54321 &&
            row.homeFurnitureRevision === 0,
        ),
      ).toBe(true);
    } finally {
      await connection.end();
    }
  }, 30_000);
});

/** Reconstructs a pre-migration table from its snapshot as a connection-local temporary table. */
const temporaryTableSql = (table: SnapshotTable) => {
  const definitions = Object.values(table.columns).map(
    (column) =>
      `${quoteIdentifier(column.name)} ${column.type}${column.notNull ? " NOT NULL" : ""}${column.default !== undefined ? ` DEFAULT ${String(column.default).replaceAll("\\'", "'")}` : ""}`,
  );
  for (const key of Object.values(table.compositePrimaryKeys)) {
    definitions.push(`PRIMARY KEY (${key.columns.map(quoteIdentifier).join(", ")})`);
  }
  for (const index of Object.values(table.indexes).filter((index) => index.isUnique)) {
    definitions.push(
      `UNIQUE KEY ${quoteIdentifier(index.name)} (${index.columns.map(quoteIdentifier).join(", ")})`,
    );
  }
  return `CREATE TEMPORARY TABLE ${quoteIdentifier(table.name)} (${definitions.join(", ")})`;
};

const quoteIdentifier = (name: string) => `\`${name.replaceAll("`", "``")}\``;

type SnapshotTable = {
  name: string;
  columns: Record<
    string,
    { name: string; type: string; notNull: boolean; default?: unknown }
  >;
  compositePrimaryKeys: Record<string, { columns: string[] }>;
  indexes: Record<string, { name: string; columns: string[]; isUnique: boolean }>;
};
