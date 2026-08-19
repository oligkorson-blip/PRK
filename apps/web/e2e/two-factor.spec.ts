/**
 * Two-factor end-to-end: enroll at /account/security → sign out → challenge
 * with an authenticator code → challenge with a one-time backup code.
 *
 * Gating mirrors journey.spec.ts: the spec only runs against a live stack
 * and skips cleanly otherwise. Required env:
 *   E2E_BASE_URL       — base URL of a running Parkwise server (also set
 *                        PLAYWRIGHT_BASE_URL to the same value)
 *   E2E_DATABASE_URL   — Postgres URL for server-side fixtures
 *                        (falls back to DATABASE_URL)
 *   E2E_2FA_PASSWORD   — fixture account password (falls back to
 *                        TEST_USER_PASSWORD)
 * TOTP codes are generated locally with createOTP from @better-auth/utils/otp
 * after base32-decoding the manual setup key (already in the tree via
 * better-auth — no new dependency).
 */
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import postgres from "postgres";

/**
 * Enrollment shows the otpauth URI's base32 secret (what authenticator apps
 * scan). better-auth verifies against the raw secret string, so decode first.
 */
function totpFromManualSetupKey(manualKey: string): Promise<string> {
  const raw = new TextDecoder().decode(base32.decode(manualKey.trim()));
  return createOTP(raw, { digits: 6, period: 30 }).totp();
}

const BASE_URL = process.env.E2E_BASE_URL;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
const PASSWORD = process.env.E2E_2FA_PASSWORD ?? process.env.TEST_USER_PASSWORD;
const READY = Boolean(BASE_URL && DATABASE_URL && PASSWORD);

const ACTION_TIMEOUT = 30_000;

test.describe.configure({ mode: "serial", timeout: 300_000 });

test.beforeEach(() => {
  test.skip(
    !READY,
    "live stack not configured (need E2E_BASE_URL + E2E_DATABASE_URL/DATABASE_URL + E2E_2FA_PASSWORD/TEST_USER_PASSWORD)"
  );
});

async function fillSignIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
      timeout: ACTION_TIMEOUT
    }),
    page.getByRole("button", { name: "Sign in", exact: true }).click()
  ]);
}

test("2FA: enroll → TOTP challenge → backup-code challenge", async ({ browser }) => {
  const sql = postgres(DATABASE_URL!, { max: 2 });
  const runId = Date.now().toString(36);
  const email = `e2e-2fa-${runId}@example.com`;
  const password = PASSWORD!;

  try {
    await test.step("fixture: account with a known credential password", async () => {
      await sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
                values (${randomUUID()}, 'E2E 2FA', ${email}, true, now(), now())`;
      const [usr] = await sql`select id from "user" where email = ${email}`;
      const hashed = await hashPassword(password);
      await sql`insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
                values (${randomUUID()}, ${usr.id}, 'credential', ${usr.id}, ${hashed}, now(), now())`;
      // Portal layout redirects incomplete investors to /onboarding. Enrollment
      // and challenge both navigate to /portal, so mirror a finished apply.
      await sql`insert into investors (
                  id, auth_user_id, email, full_name, onboarding_status,
                  terms_accepted_at, risk_accepted_at, created_at, updated_at
                ) values (
                  ${randomUUID()}, ${usr.id}, ${email}, 'E2E 2FA', 'completed',
                  now(), now(), now(), now()
                )`;
    });

    let secret = "";
    let backupCode = "";

    const first = await browser.newContext().then((ctx) => ctx.newPage());
    try {
      await test.step("password sign-in, then enroll at /account/security", async () => {
        await fillSignIn(first, email, password);

        await first.goto("/account/security", { waitUntil: "domcontentloaded" });
        await first.locator('input[name="password"]').fill(password);
        await first.getByRole("button", { name: "Set up authenticator" }).click();

        const manualKey = first.locator("p.field-hint code").first();
        await expect(manualKey).toBeVisible({ timeout: ACTION_TIMEOUT });
        secret = (await manualKey.textContent())?.trim() ?? "";
        expect(secret.length, "manual setup key").toBeGreaterThan(10);

        const codes = await first.locator(".security-code-list code").allTextContents();
        expect(codes.length, "backup codes listed").toBeGreaterThan(0);
        backupCode = codes[0].trim();

        await first
          .getByRole("checkbox", { name: /I saved the backup codes/ })
          .check();
        const code = await totpFromManualSetupKey(secret);
        await first.locator('input[name="code"]').fill(code);
        await Promise.all([
          first.waitForURL(/\/portal/, { timeout: ACTION_TIMEOUT }),
          first.getByRole("button", { name: /Verify and enable two-factor/ }).click()
        ]);
        const [flag] =
          await sql`select two_factor_enabled from "user" where email = ${email}`;
        expect(flag?.two_factor_enabled, "2FA flag after enrollment").toBe(true);
      });
    } finally {
      await first.context().close();
    }

    const second = await browser.newContext().then((ctx) => ctx.newPage());
    try {
      await test.step("fresh sign-in is challenged and passes with an authenticator code", async () => {
        await fillSignIn(second, email, password);
        await expect(second).toHaveURL(/\/two-factor/, { timeout: ACTION_TIMEOUT });
        await expect(
          second.getByRole("heading", { name: "Two-factor verification" })
        ).toBeVisible();

        const code = await totpFromManualSetupKey(secret);
        await second.locator('input[name="code"]').fill(code);
        await Promise.all([
          second.waitForURL(/\/portal/, { timeout: ACTION_TIMEOUT }),
          second.getByRole("button", { name: "Verify and sign in" }).click()
        ]);
      });
    } finally {
      await second.context().close();
    }

    const third = await browser.newContext().then((ctx) => ctx.newPage());
    try {
      await test.step("backup-code challenge signs in and consumes the code", async () => {
        await fillSignIn(third, email, password);
        await expect(third).toHaveURL(/\/two-factor/, { timeout: ACTION_TIMEOUT });
        await third.getByRole("button", { name: "Use a backup code" }).click();
        await third.locator('input[name="code"]').fill(backupCode);
        await Promise.all([
          third.waitForURL(/\/portal/, { timeout: ACTION_TIMEOUT }),
          third.getByRole("button", { name: "Verify and sign in" }).click()
        ]);
      });
    } finally {
      await third.context().close();
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
});
