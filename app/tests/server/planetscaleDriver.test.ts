import { describe, expect, it } from "bun:test";
import type { Config } from "@planetscale/database";
import { eq, sql } from "drizzle-orm";
import { mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import { createPlanetScaleClient } from "@/server/dbClient";

const records = mysqlTable("DriverRecord", {
  id: varchar("id", { length: 191 }).primaryKey(),
});

const createDatabase = () => {
  const queries: string[] = [];
  const fetch: NonNullable<Config["fetch"]> = async (_url, request) => {
    const { query } = JSON.parse(request?.body ?? "{}") as { query: string };
    queries.push(query);
    return new Response(
      JSON.stringify({
        result: {
          fields: [{ name: "id", type: "VARCHAR" }],
          rows: [{ lengths: ["5"], values: btoa("hello") }],
          rowsAffected: "1",
          insertId: "0",
        },
      }),
    );
  };
  const client = createPlanetScaleClient({ url: "https://user:password@database.test", fetch });
  return {
    client,
    queries,
    db: drizzle(client),
  };
};

describe("PlanetScale driver SQL binding", () => {
  it("escapes bound strings and preserves array result mapping", async () => {
    const { db, queries } = createDatabase();
    const rows = await db.select().from(records).where(eq(records.id, "a' OR 1=1 --"));
    expect(queries).toEqual([
      "select `id` from `DriverRecord` where `DriverRecord`.`id` = 'a\\' OR 1=1 --'",
    ]);
    expect(rows).toEqual([{ id: "hello" }]);
  });

  it("binds prepared placeholders, nulls and large integers", async () => {
    const { db, queries } = createDatabase();
    const prepared = db
      .select()
      .from(records)
      .where(eq(records.id, sql.placeholder("id")))
      .prepare();
    await prepared.execute({ id: "bound" });
    const result = await db.execute(sql`select ${null}, ${9007199254740993n}`);
    expect(queries[0]).toEndWith("= 'bound'");
    expect(queries[1]).toBe("select NULL, 9007199254740993");
    expect(result.rows).toEqual([{ id: "hello" }]);
    expect(result.rowsAffected).toBe(1);
  });

  it("uses the same binding inside transactions and rolls back failures", async () => {
    const { db, queries } = createDatabase();
    await expect(
      db.transaction(async (tx) => {
        await tx.delete(records).where(eq(records.id, "owner's row"));
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(queries).toEqual([
      "BEGIN",
      "delete from `DriverRecord` where `DriverRecord`.`id` = 'owner\\'s row'",
      "ROLLBACK",
    ]);
  });

  it("retains the driver's SQL-only calls and result options", async () => {
    const { client, queries } = createDatabase();
    const result = await client.execute("select '?' as id", { as: "array" });
    expect(queries).toEqual(["select '?' as id"]);
    expect(result.rows).toEqual([["hello"]]);
    expect(result.rowsAffected).toBe(1);
  });

  it("commits nested transactions using the same bound connection", async () => {
    const { db, queries } = createDatabase();
    await db.transaction(async (tx) => {
      await tx.transaction(async (nested) => {
        await nested.delete(records).where(eq(records.id, "owner's row"));
      });
    });
    expect(queries).toEqual([
      "BEGIN", "savepoint sp1",
      "delete from `DriverRecord` where `DriverRecord`.`id` = 'owner\\'s row'",
      "release savepoint sp1", "COMMIT",
    ]);
  });
});
