import "dotenv/config";
import type { Config } from "drizzle-kit";

const config: Config = {
  out: "./drizzle/migrations",
  schema: "./drizzle/db",
  connectionString: process.env.DRIZZLE_DATABASE_URL,
  breakpoints: false,
};

export default config;
