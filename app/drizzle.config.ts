import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle/migrations",
  schema: "./drizzle/schema.ts",
  dialect: "mysql",
  ...(process.env.DATABASE_URL
    ? { dbCredentials: { uri: process.env.DATABASE_URL } }
    : {}),
  breakpoints: false,
});
