import { PrismaClient } from "@prisma/client";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import { connect } from "@planetscale/database";
import { env } from "../env/server.mjs";
import * as schema from "../../drizzle/schema";
import type { PlanetScaleDatabase } from "drizzle-orm/planetscale-serverless";

declare global {
  // eslint-disable-next-line no-var
  var drizzle: PlanetScaleDatabase<typeof schema> | undefined;
}

export const drizzleDB =
  global.drizzle ||
  drizzle(
    connect({
      host: process.env["DATABASE_HOST"],
      username: process.env["DATABASE_USERNAME"],
      password: process.env["DATABASE_PASSWORD"],
    }),
    { schema, logger: true }
  );

if (env.NODE_ENV !== "production") {
  global.drizzle = drizzleDB;
}
