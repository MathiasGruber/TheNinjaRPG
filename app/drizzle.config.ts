import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle/migrations",
  schema: "./drizzle/schema.ts",
  dialect: "mysql",
  ...(process.env.MYSQL_URL ? { dbCredentials: { url: process.env.MYSQL_URL } } : {}),
  breakpoints: false,
  verbose: true, 
});
