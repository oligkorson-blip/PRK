import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Integration suite (tests/integration) — real Postgres, real transactions.
 * Separate from the unit suite on purpose: the unit config excludes
 * tests/integration so `vitest run` stays hermetic, and this config runs the
 * integration files serially (each builds its own scratch database on a
 * shared server). No DB configured → every file skips cleanly with exit 0.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    // Scratch databases are per-file, but they share one server; serial files
    // keep connection counts and create/drop races boring.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") }
  }
});
