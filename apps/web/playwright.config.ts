import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "responsive-mobile",
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices["Pixel 5"] }
    },
    {
      name: "responsive-tablet",
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices["Galaxy S9"] }
    }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Production build: the CSP/security-header assertions must exercise the
        // production policy (dev adds 'unsafe-eval' to script-src). Never reuse an
        // existing server: a developer's `npm run dev` on port 3000 would satisfy
        // the health check but fail the production CSP assertion spuriously.
        command: "npm run build && npm run start",
        url: "http://127.0.0.1:3000/api/health",
        reuseExistingServer: false,
        timeout: 300_000
      }
});
