import { test, expect, type Page } from "@playwright/test";

const PUBLIC_ROUTES = ["/", "/apply", "/guides", "/faq"] as const;

for (const route of PUBLIC_ROUTES) {
  test(`${route} remains usable at responsive widths`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("#main-content")).toBeVisible();
    const viewportWidth = page.viewportSize()?.width ?? 0;
    const bodyWidth = await page.locator("body").evaluate((element) => element.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
    await expect(page.locator("h1").first()).toBeVisible();
  });
}

// The catalogue is members-only; sign in as the seeded demo investor
// (scripts/create-test-users.ts) and skip without its password.
const INVESTOR_EMAIL = "investor@example.com";
const INVESTOR_PASSWORD = process.env.TEST_USER_PASSWORD;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 60_000 });
}

test("a members-only route redirects to sign-in at responsive widths", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.locator("#main-content")).toBeVisible();
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const bodyWidth = await page.locator("body").evaluate((element) => element.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
});

test("an opportunity card opens a usable detail page at responsive widths", async ({ page }) => {
  test.skip(!INVESTOR_PASSWORD, "TEST_USER_PASSWORD not set");
  await signIn(page, INVESTOR_EMAIL, INVESTOR_PASSWORD!);
  await page.goto("/opportunities");
  const card = page.locator(".asset-card-link").first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator(".opp-detail-title")).toBeVisible();
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const bodyWidth = await page.locator("body").evaluate((element) => element.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
});
