import "dotenv/config";
import type { Config } from "drizzle-kit";

console.log(process.env.DRIZZLE_DATABASE_URL);
export default {
  out: "./drizzle/migrations",
  schema: "./drizzle/schema.ts",
  driver: "mysql2",
  ...(process.env.DRIZZLE_DATABASE_URL
    ? { dbCredentials: { connectionString: process.env.DRIZZLE_DATABASE_URL } }
    : {}),
  breakpoints: false,
} satisfies Config;
