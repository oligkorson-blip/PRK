import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

/** Parse a CSP header into directive name → source tokens (order-insensitive). */
function parseCsp(header: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of header.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    directives.set(tokens[0], tokens.slice(1));
  }
  return directives;
}

function scriptNonce(header: string): string {
  const sources = parseCsp(header).get("script-src") ?? [];
  const nonce = sources.find((s) => s.startsWith("'nonce-"));
  expect(nonce, "script-src must carry a nonce").toBeTruthy();
  return nonce!.slice("'nonce-".length, -1);
}

// The catalogue is members-only; catalogue specs sign in as the seeded demo
// investor (scripts/create-test-users.ts) and skip without its password.
const INVESTOR_EMAIL = "investor@example.com";
const INVESTOR_PASSWORD = process.env.TEST_USER_PASSWORD;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 60_000 });
}

test("health endpoint is ok", async ({ request }) => {
  const res = await request.get("/api/health", { timeout: 60_000 });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toEqual({ ok: true });
});

test("home shows current campaign headline, navigation, and risk language", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("link", { name: /Skip to main content/i })).toBeAttached();
  await expect(page.getByRole("heading", { level: 1, name: /They park\. You earn\./i })).toBeVisible({
    timeout: 60_000
  });
  await expect(page.getByText(/Investment values and income can fall/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Sign in to explore/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /See how it works/i }).first()).toBeVisible();
});

test("opportunities catalogue responds when database configured", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
  test.skip(!INVESTOR_PASSWORD, "TEST_USER_PASSWORD not set");
  await signIn(page, INVESTOR_EMAIL, INVESTOR_PASSWORD!);
  const res = await page.goto("/opportunities", {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  expect(res?.ok()).toBeTruthy();
  await expect(
    page.getByRole("heading", { level: 1, name: /Find a parking opportunity/i })
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Sort")).toBeVisible();
});

test("community spaces catalogue responds when database configured", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
  test.skip(!INVESTOR_PASSWORD, "TEST_USER_PASSWORD not set");
  await signIn(page, INVESTOR_EMAIL, INVESTOR_PASSWORD!);
  const res = await page.goto("/spaces", {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  expect(res?.ok()).toBeTruthy();
  await expect(
    page.getByRole("heading", { level: 1, name: /Find a parking space near where you need to be/i })
  ).toBeVisible({ timeout: 60_000 });
});

test("community host can submit a space for manual review", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
  await page.goto("/list-a-space", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(
    page.getByRole("heading", { level: 1, name: /Turn an unused parking space/i })
  ).toBeVisible({ timeout: 60_000 });

  await page.getByLabel(/Full name/i).fill("CI Parking Host");
  await page.getByLabel(/Email/i).fill("host-ci@example.com");
  await page.getByLabel(/Phone/i).fill("+357 99 000000");
  await page.getByLabel(/Space type/i).selectOption("garage");
  await page.getByLabel(/^City/i).fill("Limassol");
  await page.getByLabel(/District or area/i).fill("Old Town");
  await page.getByLabel(/^Country/i).fill("Cyprus");
  await page.getByLabel(/Indicative monthly price/i).fill("120");
  await page.getByLabel(/When is the space available/i).fill("Weekdays");
  await page.getByLabel(/privacy notice/i).check();
  await page.getByRole("button", { name: /Send space details/i }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: /We will review the space with you/i })
  ).toBeVisible({ timeout: 60_000 });
});

test("faq, how-it-works, apply, and risk pages load", async ({ page }) => {
  await page.goto("/faq", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await page.goto("/how-it-works", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await page.goto("/apply", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await page.goto("/legal/risk", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
});

test("sign-in loads; admin, portal, and catalogue redirect when signed out", async ({ page }) => {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });

  await page.goto("/admin", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).toHaveURL(/\/(sign-in|apply)/);

  await page.goto("/portal", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).toHaveURL(/\/sign-in/);

  // The catalogue is members-only (middleware gate in lib/auth/route-gate.ts).
  await page.goto("/opportunities", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/spaces", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/help-me-choose", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).toHaveURL(/\/sign-in/);
});

test("bootstrap admin can create an account and reach the admin workspace", async ({ page }) => {
  test.skip(!process.env.ALLOW_BOOTSTRAP_SIGNUP, "bootstrap signup is disabled outside the isolated CI database");

  // The isolated CI database allowlists this email and is recreated for each run.
  const email = "ops@example.com";
  await page.goto("/sign-up", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: /Create ops account/i })).toBeVisible();

  await page.locator('input[name="name"]').fill("CI Operations Admin");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("Parkwise-ci-password-2026");
  const createAccount = page.getByRole("button", { name: "Create account", exact: true });
  await expect(createAccount).toBeEnabled();
  await createAccount.click();

  // Client-side router.push("/admin") does not fire a full load event, so
  // waitForURL({ waitUntil: "load" }) times out even after a successful signup.
  await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: /^Operations$/ })).toBeVisible({
    timeout: 60_000
  });

  await page.goto("/admin/platform", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: /Platform settings/i })).toBeVisible();
  await expect(page.getByText("Location-pool investments", { exact: true })).toBeVisible();
  const disablePool = page.getByRole("button", { name: "Disable pool requests" });
  if (await disablePool.count()) {
    await disablePool.click();
  }
  await expect(page.getByText("Disabled", { exact: true })).toBeVisible();

  await page.goto("/admin/spaces", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: /Community spaces/i })).toBeVisible();
});

test("robots and sitemap are served", async ({ request }) => {
  const robots = await request.get("/robots.txt", { timeout: 60_000 });
  expect(robots.ok()).toBeTruthy();
  const robotsText = await robots.text();
  expect(robotsText).toMatch(/Sitemap:/i);
  expect(robotsText).toMatch(/Disallow:\s*\/admin(?:\/|\s|$)/i);

  const sitemap = await request.get("/sitemap.xml", { timeout: 90_000 });
  expect(sitemap.ok()).toBeTruthy();
  const xml = await sitemap.text();
  expect(xml).toContain("<urlset");
  // Members-only catalogue URLs stay out of the public sitemap.
  expect(xml).not.toContain("/opportunities");
  expect(xml).not.toContain("/spaces");
  expect(xml).toContain("/list-a-space");
});

test("unknown route shows consumer 404", async ({ page }) => {
  const res = await page.goto("/this-route-does-not-exist-parkwise", {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  expect(res?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: /not on the map/i })
  ).toBeVisible({ timeout: 60_000 });
  // Page CTA (signed-out visitors are pointed at registration; scope to main
  // to avoid strict-mode clashes with nav links)
  await expect(
    page.getByRole("main").getByRole("link", { name: /Request access/i })
  ).toBeVisible();
});

test("security headers include frame denial and a nonce-based CSP", async ({ request }) => {
  const res = await request.get("/", { timeout: 60_000 });
  expect(res.ok()).toBeTruthy();
  const xfo = res.headers()["x-frame-options"];
  expect(xfo?.toLowerCase()).toBe("deny");

  // Production policy is assembled per request in middleware.ts (lib/csp.ts).
  const csp = res.headers()["content-security-policy"];
  expect(csp).toBeTruthy();
  expect(csp).not.toContain("unsafe-eval");
  const directives = parseCsp(csp!);

  // script-src: per-request nonce + strict-dynamic; no inline/eval escapes.
  const scriptSrc = directives.get("script-src") ?? [];
  expect(scriptSrc).toContain("'self'");
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
  const nonce = scriptNonce(csp!);
  expect(nonce.length).toBeGreaterThan(8);

  // The nonce must be regenerated per request, not cached across responses.
  const second = await request.get("/", { timeout: 60_000 });
  expect(second.ok()).toBeTruthy();
  const secondNonce = scriptNonce(second.headers()["content-security-policy"] ?? "");
  expect(secondNonce).not.toBe(nonce);

  // Remaining directives unchanged (img-src is https-only for remote assets).
  const expected: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'"],
    "upgrade-insecure-requests": []
  };
  for (const [name, sources] of Object.entries(expected)) {
    expect(
      new Set(directives.get(name)),
      `CSP directive ${name}`
    ).toEqual(new Set(sources));
  }
});

test("every script tag on the home page carries the CSP nonce", async ({ request }) => {
  const res = await request.get("/", { timeout: 60_000 });
  expect(res.ok()).toBeTruthy();
  const nonce = scriptNonce(res.headers()["content-security-policy"] ?? "");
  const html = await res.text();
  const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scriptTags.length).toBeGreaterThan(0);
  for (const tag of scriptTags) {
    expect(tag, `script tag missing nonce: ${tag}`).toContain(`nonce="${nonce}"`);
  }
});
