import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "bun:test";
import mysql from "mysql2/promise";
import { describeWithDatabase } from "../setup/testDatabase";

describeWithDatabase("home furniture inventory migration", () => {
  it("expands existing room enums while preserving placed furniture and accepting every added room", async () => {
    const connection = await mysql.createConnection({ uri: process.env.TEST_MYSQL_URL });
    const tableName = `home_rooms_${randomUUID().replaceAll("-", "")}`;
    try {
      const snapshot = JSON.parse(
        await readFile("drizzle/migrations/meta/0087_snapshot.json", "utf8"),
      ) as { tables: Record<string, SnapshotTable> };
      await connection.query(baselineTableSql({ ...snapshot.tables.UserItem!, name: tableName }));
      const insert = (id: string, room: string) => connection.query(
        `INSERT INTO ${quoteIdentifier(tableName)} (id, userId, itemId, homeRoom, homeX, homeY) VALUES (?, 'owner', 'furniture', ?, 50, 50)`,
        [id, room],
      );
      for (const room of ["main", "room-6", "yard"]) await insert(room, room);
      const migration = await readFile("drizzle/migrations/0088_mixed_abomination.sql", "utf8");
      expect(migration).not.toContain("--> statement-breakpoint");
      await connection.query(migration.replaceAll("`UserItem`", quoteIdentifier(tableName)));
      for (const room of ["room-7", "room-8", "room-9"]) await insert(room, room);
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT id, homeRoom, homeX, homeY FROM ${quoteIdentifier(tableName)} ORDER BY id`,
      );
      expect(rows.map((row) => [row.id, row.homeRoom, row.homeX, row.homeY])).toEqual(
        ["main", "room-6", "room-7", "room-8", "room-9", "yard"].map((room) => [room, room, 50, 50]),
      );
    } finally {
      await connection.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
      await connection.end();
    }
  });

  it("moves home settings and existing grants without changing balances or access", async () => {
    const connection = await mysql.createConnection({ uri: process.env.TEST_MYSQL_URL, multipleStatements: true });
    const prefix = `home_settings_${randomUUID().replaceAll("-", "")}_`;
    const names = ["UserData", "UserRequest", "UserHome"];
    const query = <T extends mysql.QueryResult = mysql.QueryResult>(statement: string, values?: unknown[]) =>
      connection.query<T>(statement.replace(/\b(UserData|UserRequest|UserHome)\b/g, `${prefix}$1`), values);
    try {
      const snapshot = JSON.parse(await readFile("drizzle/migrations/meta/0088_snapshot.json", "utf8")) as { tables: Record<string, SnapshotTable> };
      for (const name of ["UserData", "UserRequest"]) await query(baselineTableSql(snapshot.tables[name]!));
      const styles = [{ room: "main", paint: "sage", floor: "slate" }];
      const guests = Array.from({ length: 100 }, (_, index) => ({ userId: `guest-${index}`, username: `Guest ${index}` }));
      for (const id of ["host", "public-host", "default-owner", ...guests.map(({ userId }) => userId)])
        await query("INSERT INTO UserData (userId, username, gender, money, bank, homeFurnitureRevision) VALUES (?, ?, 'Other', 123456, 654321, 7)", [id, id]);
      await query("UPDATE UserData SET homeRoomStyles = ?, homeInvitations = ? WHERE userId = 'host'", [JSON.stringify(styles), JSON.stringify([guests[0], guests[0], { userId: "host" }, { userId: "deleted-guest" }, guests[99]])]);
      await query("UPDATE UserData SET homePublic = true, homeInvitations = ? WHERE userId = 'public-host'", [JSON.stringify(guests)]);
      await query("INSERT INTO UserRequest (id, senderId, receiverId, status, type) VALUES ('spar', 'host', 'guest-0', 'PENDING', 'SPAR')");
      const migration = await readFile("drizzle/migrations/0089_aspiring_shotgun.sql", "utf8");
      expect(migration).not.toContain("--> statement-breakpoint");
      await query(migration);
      const [homes] = await query<mysql.RowDataPacket[]>("SELECT * FROM UserHome ORDER BY userId");
      expect(homes.map(({ userId, roomStyles, isPublic }) => ({ userId, roomStyles, isPublic }))).toEqual([{ userId: "host", roomStyles: styles, isPublic: 0 }, { userId: "public-host", roomStyles: [], isPublic: 1 }]);
      const [requests] = await query<mysql.RowDataPacket[]>("SELECT * FROM UserRequest WHERE type = 'HOME'");
      expect(requests).toHaveLength(102);
      expect(requests.every((row) => row.status === "ACCEPTED" && row.receiverId === row.activeHomeReceiverId)).toBe(true);
      expect(requests.some((row) => row.senderId === "public-host" && row.receiverId === "guest-99")).toBe(true);
      const [existing] = await query<mysql.RowDataPacket[]>("SELECT type, status FROM UserRequest WHERE id = 'spar'");
      expect(existing.map(({ type, status }) => ({ type, status }))).toEqual([{ type: "SPAR", status: "PENDING" }]);
      const [accounts] = await query<mysql.RowDataPacket[]>("SELECT money, bank, homeFurnitureRevision FROM UserData");
      expect(accounts.every((row) => row.money === 123456 && row.bank === 654321 && row.homeFurnitureRevision === 7)).toBe(true);
      const [columns] = await query<mysql.RowDataPacket[]>("SHOW COLUMNS FROM UserData");
      expect(columns.some((column) => ["homeRoomStyles", "homePublic", "homeInvitations"].includes(column.Field))).toBe(false);
    } finally {
      await connection.query(`DROP TABLE IF EXISTS ${names.map((name) => quoteIdentifier(prefix + name)).join(", ")}`);
      await connection.end();
    }
  }, 30_000);

  it("seeds ordinary furniture and grants starter copies without changing balances or existing inventory", async () => {
    const connection = await mysql.createConnection({
      uri: process.env.TEST_MYSQL_URL,
      multipleStatements: true,
    });
    const prefix = `home_migration_${randomUUID().replaceAll("-", "")}_`;
    const names = ["Item", "ItemVariant", "UserItem", "UserData"];
    const query = <T extends mysql.QueryResult = mysql.QueryResult>(statement: string, values?: unknown[]) =>
      connection.query<T>(statement.replace(/\b(Item|ItemVariant|UserItem|UserData)\b/g, `${prefix}$1`), values);
    try {
      // Unique tables isolate the baseline schema. MySQL temporary tables cannot be
      // both the insert target and the inventory read used to skip existing starter copies.
      const snapshot = JSON.parse(
        await readFile("drizzle/migrations/meta/0079_snapshot.json", "utf8"),
      ) as { tables: Record<string, SnapshotTable> };
      for (const name of names)
        await query(baselineTableSql(snapshot.tables[name]!));
      for (const [userId, homeType] of [
        ["resident", "PALACE"],
        ["fresh", "NONE"],
        ["u".repeat(191), "STUDIO_APARTMENT"],
      ]) {
        await query(
          "INSERT INTO UserData (userId, username, gender, homeType, money, bank) VALUES (?, ?, 'Other', ?, 100000, 54321)",
          [userId, userId, homeType],
        );
      }
      await query(
        "INSERT INTO Item (id, name, description, image, effects, itemType, rarity, slot, target) VALUES ('gear', 'Existing gear', 'Existing gear', '/gear.webp', JSON_ARRAY(), 'WEAPON', 'COMMON', 'ITEM', 'CHARACTER'); INSERT INTO UserItem (id, userId, itemId, quantity, level, experience, durability, equipped) VALUES ('owned-gear', 'resident', 'gear', 2, 7, 45, 55, 'ITEM_1');",
      );
      const migration = await readFile(
        "drizzle/migrations/0080_curious_snowbird.sql",
        "utf8",
      );
      expect(migration).not.toMatch(/JSON_(EXTRACT|SEARCH|CONTAINS|SET)/i);
      const backfillStart = migration.indexOf("INSERT INTO `UserItem`");
      const backfillSql = migration.slice(backfillStart);
      await query(migration.slice(0, backfillStart));
      const catalogue = (await readFile("data/item.sql", "utf8")).split(
        "-- Furniture catalogue imports preserve content-team edits when repeated.",
      )[1]!;
      // Existing accounts receive only published furniture; a missing catalogue creates no rows.
      await query(backfillSql);
      const [unseededInventory] = await query<mysql.RowDataPacket[]>("SELECT * FROM UserItem");
      expect(unseededInventory).toHaveLength(1);
      await query(catalogue);
      // Registration uses independent row IDs; the backfill must preserve its starter copy.
      await query("INSERT INTO UserItem (id, userId, itemId, quantity, equipped, storedAtHome, homeX, homeY) VALUES ('registered-bed', 'fresh', 'home-bed', 1, 'NONE', true, 35, 45)");
      await query(backfillSql);
      const [columns] = await query<mysql.RowDataPacket[]>(
        "SHOW COLUMNS FROM UserData",
      );
      expect(
        columns
          .filter((column) => !snapshot.tables.UserData!.columns[column.Field])
          .map((column) => column.Field),
      ).toEqual(["homeFurnitureRevision"]);
      const [inventory] = await query<mysql.RowDataPacket[]>(
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
        ["home-bed", 35, 45, 0],
        ["home-garden", 86, 90.91, 0],
        ["home-kitchen", 76, 57.58, 0],
      ]);
      expect(
        inventory
          .filter((row) => row.id !== "owned-gear")
          .every(
            (row) =>
              (row.id.length === 64 || row.id === "registered-bed") &&
              row.quantity === 1 &&
              row.storedAtHome === 1 &&
              row.equipped === "NONE",
          ),
      ).toBe(true);
      await query(
        "UPDATE Item SET name = 'Staff Rug', cost = 33333 WHERE id = 'home-rug'; UPDATE UserItem SET homeX = 44, homeY = 66 WHERE userId = 'resident' AND itemId = 'home-bed';",
      );
      await query(catalogue);
      await query(backfillSql);
      const [retriedInventory] = await query<mysql.RowDataPacket[]>(
        "SELECT * FROM UserItem",
      );
      expect(retriedInventory).toHaveLength(13);
      expect(
        retriedInventory.find(
          (row) => row.userId === "resident" && row.itemId === "home-bed",
        ),
      ).toMatchObject({ homeX: 44, homeY: 66 });
      const [definitions] = await query<mysql.RowDataPacket[]>(
        "SELECT * FROM Item WHERE itemType = 'FURNITURE'",
      );
      expect(definitions).toHaveLength(15);
      expect(definitions.find((row) => row.id === "home-rug")).toMatchObject({
        name: "Staff Rug",
        cost: 33333,
        furnitureData: { action: null, width: 25, groundAnchor: 88.5417, isFloor: true },
      });
      expect(definitions.filter((row) => row.cost === 0)).toHaveLength(7);
      expect(
        definitions
          .filter((row) => row.cost === 0)
          .every((row) => !row.inShop && !row.canBeTraded),
      ).toBe(true);
      const [residents] = await query<mysql.RowDataPacket[]>(
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
      await connection.query(`DROP TABLE IF EXISTS ${names.map((name) => quoteIdentifier(prefix + name)).join(", ")}`);
      await connection.end();
    }
  }, 30_000);
});

/** Reconstructs a pre-migration table from its snapshot for isolated migration validation. */
const baselineTableSql = (table: SnapshotTable) => {
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
  return `CREATE TABLE ${quoteIdentifier(table.name)} (${definitions.join(", ")})`;
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
