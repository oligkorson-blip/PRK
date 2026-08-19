/**
 * Authenticated end-to-end journey — the critical path no other test covers:
 *
 *   submit /apply → ops approves & invites → investor sets password via the
 *   invite → lands on /portal → uploads a KYC document → ops approves KYC →
 *   investor expresses interest → ops confirms → holding visible →
 *   the KYC document downloads via /api/documents/[id]/download.
 *
 * Step order note: the assignment listed "express interest → ops confirms"
 * before KYC, but confirmInterest (lib/interests/admin-actions.ts) hard-
 * requires kycStatus = "approved", so KYC approval must precede the confirm
 * step for the journey to be executable at all.
 *
 * Gating: the spec only runs against a live stack and skips cleanly
 * otherwise. Required env:
 *   E2E_BASE_URL       — base URL of a running Parkwise server
 *                        (e.g. http://127.0.0.1:3000; also set
 *                        PLAYWRIGHT_BASE_URL to the same value so relative
 *                        navigation resolves)
 *   E2E_DATABASE_URL   — Postgres URL for server-side fixtures
 *                        (falls back to DATABASE_URL)
 *   E2E_OPS_EMAIL      — staff sign-in email (default ops@parkwise.eu); the
 *                        SERVER must be started with SUPER_ADMIN_EMAILS
 *                        containing this address
 *   E2E_OPS_PASSWORD   — staff sign-in password (falls back to
 *                        TEST_USER_PASSWORD; the spec upserts the credential
 *                        account itself, mirroring scripts/create-test-users.ts)
 * The server must also have DOCUMENTS_DIR set (KYC upload/download storage)
 * and at least one published asset (npm run db:seed on a demo stack).
 */
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

const BASE_URL = process.env.E2E_BASE_URL;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
const OPS_EMAIL = process.env.E2E_OPS_EMAIL ?? "ops@parkwise.eu";
const OPS_PASSWORD = process.env.E2E_OPS_PASSWORD ?? process.env.TEST_USER_PASSWORD;
const READY = Boolean(BASE_URL && DATABASE_URL && OPS_PASSWORD);

const ACTION_TIMEOUT = 30_000;

test.describe.configure({ mode: "serial", timeout: 300_000 });

test.beforeEach(() => {
  test.skip(
    !READY,
    "live stack not configured (need E2E_BASE_URL + E2E_DATABASE_URL/DATABASE_URL + E2E_OPS_PASSWORD/TEST_USER_PASSWORD)"
  );
});

/** Minimal magic-byte-valid PDF (sniffMatchesType checks the %PDF header). */
const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
);

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
    timeout: ACTION_TIMEOUT
  });
}

test("apply → invite → portal → KYC → interest → holding → download", async ({
  browser,
  page
}) => {
  const sql = postgres(DATABASE_URL!, { max: 2 });
  const runId = Date.now().toString(36);
  const investorEmail = `e2e-journey-${runId}@example.com`;
  const investorPassword = `E2e-${randomUUID()}aa`;
  let opsPage: Page | undefined;

  try {
    await test.step("fixture: ops staff user with a known credential password", async () => {
      await sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
                values (${randomUUID()}, 'E2E Ops', ${OPS_EMAIL}, true, now(), now())
                on conflict (email) do nothing`;
      const [ops] = await sql`select id from "user" where email = ${OPS_EMAIL}`;
      const hashed = await hashPassword(OPS_PASSWORD!);
      const [cred] =
        await sql`select id from account where user_id = ${ops.id} and provider_id = 'credential'`;
      if (cred) {
        await sql`update account set password = ${hashed}, updated_at = now() where id = ${cred.id}`;
      } else {
        await sql`insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
                  values (${randomUUID()}, ${ops.id}, 'credential', ${ops.id}, ${hashed}, now(), now())`;
      }
    });

    let investorId = "";

    await test.step("investor submits the /apply application", async () => {
      await page.goto("/apply", { waitUntil: "domcontentloaded" });
      await page.locator("#apply-first").fill("E2E");
      await page.locator("#apply-last").fill("Journey");
      await page.locator("#apply-email").fill(investorEmail);
      await page.locator("#apply-phone").fill("+353 1 555 0100");
      await page.locator("#apply-country").selectOption("Ireland");
      await page.getByRole("button", { name: /Continue/ }).click();

      // Step 2 — pick the first ticket band and continue.
      await page
        .getByRole("group", { name: "Investment amount" })
        .getByRole("button")
        .first()
        .click();
      await page.getByRole("button", { name: /Continue/ }).click();

      // Step 3 — accept terms + risk, submit.
      await page.locator('input[name="terms"]').check();
      await page.locator('input[name="risk"]').check();
      await page.getByRole("button", { name: "Submit application" }).click();
      await expect(
        page.getByRole("heading", { name: /Application received/i })
      ).toBeVisible({ timeout: ACTION_TIMEOUT });

      const [row] =
        await sql`select id from investors where lower(email) = lower(${investorEmail})`;
      expect(row, "application should create an investor row").toBeTruthy();
      investorId = row.id;
    });

    let inviteUrl = "";

    await test.step("ops signs in and approves & invites the applicant", async () => {
      const ops = await browser.newContext().then((ctx) => ctx.newPage());
      opsPage = ops;
      await signIn(ops, OPS_EMAIL, OPS_PASSWORD!);
      // Requires the server to run with SUPER_ADMIN_EMAILS containing OPS_EMAIL.
      await ops.goto(`/admin/investors/${investorId}`, {
        waitUntil: "domcontentloaded"
      });
      await expect(ops).toHaveURL(new RegExp(`/admin/investors/${investorId}`));

      await ops.getByRole("button", { name: "Approve & invite" }).click();
      const inviteLine = ops.getByText(/Invite URL/);
      await expect(inviteLine).toBeVisible({ timeout: ACTION_TIMEOUT });
      const text = await inviteLine.textContent();
      inviteUrl = text?.match(/https?:\/\/\S+/)?.[0] ?? "";
      expect(inviteUrl, "ops UI should surface the manual invite URL").toContain(
        "/set-password?token="
      );
    });

    await test.step("investor sets a password via the invite and lands on the portal", async () => {
      await page.goto(inviteUrl, { waitUntil: "domcontentloaded" });
      await page.locator('input[name="password"]').fill(investorPassword);
      await page.locator('input[name="confirm"]').fill(investorPassword);
      await page.getByRole("button", { name: "Set password" }).click();
      // Happy path auto-signs-in and pushes /portal (onboarding gate may
      // bounce to /onboarding). Sign-in?set=1 is only the failure fallback.
      await page.waitForURL(
        (url) =>
          /\/(portal|onboarding)/.test(url.pathname) ||
          (url.pathname.startsWith("/sign-in") && url.searchParams.get("set") === "1"),
        { timeout: ACTION_TIMEOUT }
      );
      if (new URL(page.url()).pathname.startsWith("/sign-in")) {
        await signIn(page, investorEmail, investorPassword);
      }

      // createInterest and uploadKycDocument gate on investors.onboarding_status
      // + terms/risk timestamps; the wizard captured consent on the application,
      // so mirror the completed state before asserting /portal stays reachable.
      await sql`update investors
                set onboarding_status = 'completed',
                    pool_investments_enabled = true,
                    terms_accepted_at = coalesce(terms_accepted_at, now()),
                    risk_accepted_at = coalesce(risk_accepted_at, now())
                where id = ${investorId}`;

      await page.goto("/portal", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/portal/);
    });

    let kycDocumentId = "";

    await test.step("investor uploads a KYC document and submits for review", async () => {
      await page.goto("/portal/kyc", { waitUntil: "domcontentloaded" });

      // Individual pack requires ID + address proof before submit.
      await page.locator('select[name="category"]').selectOption("kyc_id");
      await page.locator('input[name="file"]').setInputFiles({
        name: "e2e-passport.pdf",
        mimeType: "application/pdf",
        buffer: PDF_BYTES
      });
      await page.getByRole("button", { name: "Upload", exact: true }).click();
      await expect(page.getByText(/Document uploaded\./)).toBeVisible({
        timeout: ACTION_TIMEOUT
      });
      // Soft refresh can race the list RSC payload; hard-reload for the title.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText("e2e-passport.pdf")).toBeVisible({
        timeout: ACTION_TIMEOUT
      });

      await page.locator('select[name="category"]').selectOption("kyc_address");
      await page.locator('input[name="file"]').setInputFiles({
        name: "e2e-address.pdf",
        mimeType: "application/pdf",
        buffer: PDF_BYTES
      });
      await page.getByRole("button", { name: "Upload", exact: true }).click();
      await expect(page.getByText(/Document uploaded\./)).toBeVisible({
        timeout: ACTION_TIMEOUT
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText("e2e-address.pdf")).toBeVisible({
        timeout: ACTION_TIMEOUT
      });

      await page.getByRole("button", { name: "Submit for review" }).click();
      await expect(page.getByText("Submitted for review.")).toBeVisible({
        timeout: ACTION_TIMEOUT
      });

      const [doc] =
        await sql`select id from documents
                  where owner_type = 'investor' and owner_id = ${investorId}
                    and category = 'kyc_id'
                  order by created_at desc limit 1`;
      expect(doc, "uploaded KYC document row").toBeTruthy();
      kycDocumentId = doc.id;
    });

    await test.step("ops approves KYC", async () => {
      await opsPage!.goto(`/admin/investors/${investorId}`, {
        waitUntil: "domcontentloaded"
      });
      await opsPage!.getByRole("button", { name: "Approve KYC" }).click();
      await expect(opsPage!.getByText("KYC approved.")).toBeVisible({
        timeout: ACTION_TIMEOUT
      });

      // confirmInterest also requires a clear sanctions/PEP screening
      // (kyc_checks). There is no screening UI tied to this flow yet, so seed
      // the record as a fixture; the ops staff profile exists by now (created
      // on first admin page load).
      const [staff] =
        await sql`select id from staff_profiles where lower(email) = lower(${OPS_EMAIL})`;
      expect(staff, "ops staff profile").toBeTruthy();
      await sql`insert into kyc_checks (investor_id, result, screening_note, reviewed_by_staff_id)
                values (${investorId}, 'clear', 'E2E journey screening.', ${staff.id})`;
    });

    let assetSlug = "";

    await test.step("investor expresses interest in a published opportunity", async () => {
      // Production defaults the investment lane to off; this converted-user
      // journey explicitly enables it before testing an interest request.
      await sql`insert into platform_settings (key, enabled, updated_by)
                values ('pool_investments_enabled', true, ${OPS_EMAIL})
                on conflict (key) do update set enabled = true, updated_by = ${OPS_EMAIL}, updated_at = now()`;
      const [asset] =
        await sql`select slug, min_ticket_eur from assets
                  where status = 'published' and min_ticket_eur < 50000
                  order by created_at asc limit 1`;
      expect(
        asset,
        "need a published asset under the four-eyes threshold — run npm run db:seed"
      ).toBeTruthy();
      assetSlug = asset.slug;

      await page.goto(`/opportunities/${asset.slug}`, { waitUntil: "domcontentloaded" });
      // Interest form is scroll-gated: #terms / #risks must enter the viewport
      // before AllocationCta renders the amount field.
      await page.locator("#terms").scrollIntoViewIfNeeded();
      const form = page.locator("aside.detail-side");
      await expect(form.locator('input[name="amountEur"]')).toBeVisible({
        timeout: ACTION_TIMEOUT
      });
      await form.locator('input[name="amountEur"]').fill(String(asset.min_ticket_eur));
      await form.locator('input[type="checkbox"]').check();
      await form.getByRole("button", { name: /Express interest/ }).click();
      await expect(page.getByText(/Interest received/)).toBeVisible({
        timeout: ACTION_TIMEOUT
      });
    });

    await test.step("ops confirms the interest (KYC already approved)", async () => {
      await opsPage!.goto("/admin/interests", { waitUntil: "domcontentloaded" });
      const row = opsPage!.getByRole("row", { name: new RegExp(investorEmail) });
      await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT });
      await row.getByRole("button", { name: "Confirm" }).click();
      await expect(
        opsPage!.getByText("Interest confirmed — holding created")
      ).toBeVisible({ timeout: ACTION_TIMEOUT });
    });

    await test.step("investor sees the holding in the portal", async () => {
      await page.goto("/portal/holdings", { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: /Your portfolio/i })
      ).toBeVisible();
      const [holding] =
        await sql`select h.id, a.name from holdings h join assets a on a.id = h.asset_id
                  where h.investor_id = ${investorId} and h.status = 'active'`;
      expect(holding, "confirm should have created an active holding").toBeTruthy();
      await expect(page.getByText(holding.name)).toBeVisible({ timeout: ACTION_TIMEOUT });
    });

    await test.step("the KYC document downloads via /api/documents/[id]/download", async () => {
      const res = await page.request.get(`/api/documents/${kycDocumentId}/download`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-disposition"]).toContain("attachment");
      expect(res.headers()["content-type"]).toContain("application/pdf");
      const body = await res.body();
      expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    });
  } finally {
    await sql`update platform_settings
              set enabled = false, updated_by = ${OPS_EMAIL}, updated_at = now()
              where key = 'pool_investments_enabled'`;
    await opsPage?.context().close();
    await sql.end({ timeout: 5 });
  }
});
