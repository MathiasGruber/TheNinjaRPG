import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
  out: "./drizzle/migrations",
  schema: "./drizzle/schema.ts",
  driver: "mysql2",
  ...(process.env.DATABASE_URL
    ? { dbCredentials: { connectionString: process.env.DATABASE_URL } }
    : {}),
  breakpoints: false,
} satisfies Config;
