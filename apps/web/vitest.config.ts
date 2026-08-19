import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // Worker threads start much faster than the default child-process forks
    // and share the transform cache, which dominates runtime for this suite
    // (~200 hermetic test files). Isolation stays on, so per-file module
    // state and vi.mock behavior are unchanged.
    pool: "threads",
    // tests/integration runs against a real Postgres via vitest.integration.config.ts
    // (test:integration); keep the unit suite hermetic and DB-free.
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.next/**", "**/tests/integration/**"]
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") }
  }
});
