import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// dotenv does not override already-set vars, so real env wins, then .env.local, then .env
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" }
});
