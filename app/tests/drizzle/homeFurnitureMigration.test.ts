import { readFile } from "node:fs/promises";
import { expect, it } from "bun:test";
import mysql from "mysql2/promise";
import { describeWithDatabase } from "../setup/testDatabase";

describeWithDatabase("home furniture inventory migration", () => {
  it("preserves ownership and the active room without duplicating grants or replacing staff edits", async () => {
    const connection = await mysql.createConnection({
      uri: process.env.TEST_MYSQL_URL,
      multipleStatements: true,
    });
    try {
      // Temporary tables shadow the normal tables only on this connection, keeping
      // the historical schema isolated from the other suites' current schema.
      const snapshot = JSON.parse(
        await readFile("drizzle/migrations/meta/0076_snapshot.json", "utf8"),
      ) as { tables: Record<string, SnapshotTable> };
      for (const name of ["Item", "UserItem", "UserData"]) {
        await connection.query(temporaryTableSql(snapshot.tables[name]!));
      }
      const core = [
        { id: "bed", x: 22, y: 20, rotation: 0 },
        { id: "armory", x: 75, y: 20, rotation: 0 },
        { id: "kitchen", x: 76, y: 76, rotation: 0 },
        { id: "garden", x: 86, y: 92, rotation: 0 },
      ];
      for (const resident of [
        {
          userId: "active",
          homeType: "PALACE",
          homeFurniture: {
            owned: ["rug", "sofa"],
            layouts: {
              PALACE: [
                ...core,
                { id: "rug", x: 41, y: 70, rotation: 1 },
                { id: "table", x: 51, y: 50, rotation: 0 },
              ],
              NONE: [...core, { id: "rug", x: 40, y: 90, rotation: 0 }],
            },
          },
        },
        {
          userId: "fresh",
          homeType: "NONE",
          homeFurniture: { owned: [], layouts: {} },
        },
        {
          userId: "edge",
          homeType: "NONE",
          homeFurniture: {
            owned: ["rug"],
            layouts: { NONE: [...core, { id: "rug", x: 8, y: 8, rotation: 0 }] },
          },
        },
        {
          userId: "u".repeat(191),
          homeType: "NONE",
          homeFurniture: {
            owned: ["lantern"],
            layouts: {
              PALACE: [...core, { id: "lantern", x: 45, y: 65, rotation: 1 }],
            },
          },
        },
      ]) {
        await connection.query(
          "INSERT INTO UserData (userId, username, gender, homeType, homeFurniture, homeFurnitureRevision, money) VALUES (?, ?, 'Other', ?, ?, 7, 100000)",
          [
            resident.userId,
            resident.userId,
            resident.homeType,
            JSON.stringify(resident.homeFurniture),
          ],
        );
      }
      const migration = await readFile(
        "drizzle/migrations/0077_dear_kinsey_walden.sql",
        "utf8",
      );
      const dropLegacyColumn = "ALTER TABLE `UserData` DROP COLUMN `homeFurniture`;";
      expect(migration.trimEnd().endsWith(dropLegacyColumn)).toBe(true);
      await connection.query(migration.replace(dropLegacyColumn, ""));

      const [inventory] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT * FROM UserItem",
      );
      expect(inventory).toHaveLength(20);
      expect(
        inventory.find((row) => row.userId === "active" && row.itemId === "home-rug"),
      ).toMatchObject({ homeX: 41, homeY: 53.03, homeRotation: 1 });
      expect(
        inventory.find((row) => row.userId === "active" && row.itemId === "home-sofa"),
      ).toMatchObject({ homeX: null, homeY: null });
      expect(inventory.some((row) => row.itemId === "home-table")).toBe(false);
      expect(
        inventory.find((row) => row.userId === "edge" && row.itemId === "home-rug"),
      ).toMatchObject({ homeX: 8, homeY: 8 });
      expect(inventory.find((row) => row.itemId === "home-lantern")).toMatchObject({
        homeX: null,
        homeY: null,
      });
      expect(
        inventory
          .filter((row) => row.userId === "fresh")
          .map((row) => [row.itemId, row.homeX, row.homeY])
          .sort(),
      ).toEqual([
        ["home-armory", 75, 15.15],
        ["home-bed", 22, 15.15],
        ["home-garden", 86, 90.91],
        ["home-kitchen", 76, 57.58],
      ]);
      expect(
        inventory.every(
          (row) =>
            row.id.length === 64 &&
            row.storedAtHome === 1 &&
            row.quantity === 1 &&
            row.equipped === "NONE",
        ),
      ).toBe(true);

      await connection.query(
        "UPDATE Item SET name = 'Staff Rug', cost = 33333 WHERE id = 'home-rug'; UPDATE UserItem SET homeX = 44, homeY = 66 WHERE userId = 'active' AND itemId = 'home-rug';",
      );
      await connection.query(
        migration.slice(
          migration.indexOf("-- Furnishings use the ordinary content catalogue;"),
          migration.lastIndexOf(dropLegacyColumn),
        ),
      );
      const [retriedInventory] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT * FROM UserItem",
      );
      expect(retriedInventory).toHaveLength(20);
      expect(
        retriedInventory.find(
          (row) => row.userId === "active" && row.itemId === "home-rug",
        ),
      ).toMatchObject({ homeX: 44, homeY: 66 });
      const [definitions] =
        await connection.query<mysql.RowDataPacket[]>("SELECT * FROM Item");
      expect(definitions).toHaveLength(12);
      expect(definitions.find((row) => row.id === "home-rug")).toMatchObject({
        name: "Staff Rug",
        cost: 33333,
        furnitureIsFloor: 1,
      });
      expect(
        definitions
          .filter((row) => row.cost === 0)
          .every((row) => !row.inShop && !row.canBeTraded),
      ).toBe(true);
      const [residents] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT money, homeFurnitureRevision FROM UserData",
      );
      expect(
        residents.every(
          (row) => row.money === 100000 && row.homeFurnitureRevision === 7,
        ),
      ).toBe(true);
      await connection.query(dropLegacyColumn);
      const [columns] = await connection.query<mysql.RowDataPacket[]>(
        "SHOW COLUMNS FROM UserData",
      );
      expect(columns.some((column) => column.Field === "homeFurniture")).toBe(false);
      expect(columns.some((column) => column.Field === "homeFurnitureRevision")).toBe(
        true,
      );
    } finally {
      await connection.end();
    }
  }, 30_000);
});

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
