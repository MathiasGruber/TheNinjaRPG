import { Client, type Field } from "@planetscale/database";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import * as schema from "@/drizzle/schema";

type Result = {
  fields?: Field[];
  rows?: (string | null)[][];
  rowsAffected?: number;
};

/** Exercise the real PlanetScale wire decoding and Drizzle mapping without a database. */
export const planetScaleFixture = (respond: (query: string) => Result) => {
  const statements: string[] = [];
  const client = new Client({
    host: "fixture.invalid",
    username: "fixture",
    password: "fixture",
    fetch: async (_url, request) => {
      const { query } = JSON.parse(request?.body ?? "{}") as { query: string };
      statements.push(query);
      const result = respond(query);
      return Response.json({
        result: {
          fields: result.fields ?? [],
          rowsAffected: String(result.rowsAffected ?? 0),
          rows: (result.rows ?? []).map((row) => ({
            lengths: row.map((value) =>
              String(value === null ? -1 : Buffer.byteLength(value)),
            ),
            values: Buffer.from(row.join("")).toString("base64"),
          })),
        },
      });
    },
  });
  return { database: drizzle(client, { schema }), statements };
};
