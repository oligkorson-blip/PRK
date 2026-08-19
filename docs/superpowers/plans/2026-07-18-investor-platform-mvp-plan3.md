# Parkwise Investor Platform MVP — Plan 3: Documents, Hardening, Launch Gate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the document vault (R2 uploads + investor downloads), close Plan 2 hardening gaps, polish the holdings portal summary, and ship a production launch checklist so the MVP can go to staging.

**Architecture:** Extend `apps/web`. Add `documents` table and an S3-compatible R2 client. Admin uploads PDFs attached to assets, holdings, or platform. Investors list/download only documents they are allowed to see. Harden interest create (unique-violation → friendly error) and admin email try/catch. Playwright covers the happy path when Clerk test credentials exist; otherwise document a manual gate.

**Tech Stack:** Next.js 15, Clerk, Drizzle, Neon, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (R2), Resend, Vitest, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-investor-platform-mvp-design.md`
- Setup: `apps/web/docs/SETUP.md`
- Preserve Parkwise brand and risk language; never say yields are guaranteed
- No payments, KYC vendor, or secondary market
- Presigned URLs for downloads; no public bucket listing
- Do not commit secrets
- Commit with: `git -c user.email="parkwise@local" -c user.name="Parkwise"` when needed
- When R2 env vars are missing, upload actions return a clear error; list pages still render empty

## File Structure (primary)

```
apps/web/
  lib/db/schema.ts                 # add documents
  lib/storage/r2.ts                # S3 client + presign helpers
  lib/documents/actions.ts         # admin upload metadata + create row
  lib/documents/access.ts          # authorization for list/download
  app/api/documents/[id]/download/route.ts
  app/admin/documents/page.tsx
  app/portal/documents/page.tsx
  lib/interests/actions.ts         # harden unique violation + already mostly done
  lib/interests/admin-actions.ts   # try/catch emails
  app/portal/page.tsx              # contractual income summary
  app/admin/assets/page.tsx        # minimal publish/draft toggle + list
  playwright.config.ts
  e2e/smoke.spec.ts
  docs/plan3-verify.md
  docs/PRODUCTION_CHECKLIST.md
```

---

### Task 1: Documents schema + R2 client

**Files:**
- Modify: `apps/web/lib/db/schema.ts`
- Create: `apps/web/lib/storage/r2.ts`
- Create: `apps/web/tests/r2-key.test.ts`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/docs/SETUP.md` (R2 section)
- Migration via `npm run db:generate`

**Interfaces:**
- Produces:
  - `documents` table per design (`owner_type`, `owner_id`, `title`, `category`, `r2_key`, `content_type`, `uploaded_by`, `created_at`)
  - `buildObjectKey(parts: { ownerType: string; ownerId: string | null; filename: string }): string`
  - `isR2Configured(): boolean`
  - `getPresignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>`
  - `putObject(key: string, body: Buffer, contentType: string): Promise<void>`

- [ ] **Step 1: Failing test for key builder**

```ts
// tests/r2-key.test.ts
import { describe, expect, it } from "vitest";
import { buildObjectKey } from "@/lib/storage/r2";

describe("buildObjectKey", () => {
  it("builds a stable prefixed key without path traversal", () => {
    const key = buildObjectKey({
      ownerType: "asset",
      ownerId: "11111111-1111-1111-1111-111111111111",
      filename: "../../evil.pdf"
    });
    expect(key.startsWith("docs/asset/11111111-1111-1111-1111-111111111111/")).toBe(true);
    expect(key.includes("..")).toBe(false);
    expect(key.endsWith(".pdf") || key.includes("evil")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web && npm test -- tests/r2-key.test.ts
```

- [ ] **Step 3: Implement schema + r2 module**

```ts
export const documentOwnerTypeEnum = pgEnum("document_owner_type", [
  "asset",
  "holding",
  "platform"
]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerType: documentOwnerTypeEnum("owner_type").notNull(),
  ownerId: uuid("owner_id"),
  title: text("title").notNull(),
  category: text("category").notNull(),
  r2Key: text("r2_key").notNull(),
  contentType: text("content_type").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
```

`lib/storage/r2.ts`: sanitize filename (basename only, replace unsafe chars), prefix `docs/{ownerType}/{ownerId|platform}/`. Use `@aws-sdk/client-s3` with:

```ts
endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
region: "auto",
credentials: { accessKeyId, secretAccessKey },
forcePathStyle: true // if needed for R2
```

Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, optional `R2_PUBLIC_BASE_URL` (unused for private vault).

`isR2Configured()` returns true only when account, keys, and bucket are set.

- [ ] **Step 4: Generate migration; update `.env.example` + SETUP.md**

```bash
cd apps/web && npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm run db:generate
# npm run db:migrate if DATABASE_URL present
npm test
```

- [ ] **Step 5: Commit**

```bash
git commit -m "add documents schema and R2 storage client"
```

---

### Task 2: Document access, upload, download

**Files:**
- Create: `apps/web/lib/documents/access.ts`
- Create: `apps/web/lib/documents/actions.ts`
- Create: `apps/web/app/api/documents/[id]/download/route.ts`
- Create: `apps/web/app/admin/documents/page.tsx`
- Create: `apps/web/app/portal/documents/page.tsx`
- Create: `apps/web/components/document-upload-form.tsx`
- Modify: `apps/web/app/admin/page.tsx` (link)
- Modify: `apps/web/app/portal/page.tsx` (link to documents)
- Create: `apps/web/tests/document-access.test.ts`

**Interfaces:**
- Produces:
  - `canInvestorAccessDocument(investorId, doc): Promise<boolean>`
    - `platform` → any active onboarded investor
    - `asset` → investor has interest (any status) or holding on that asset
    - `holding` → `ownerId` is a holding belonging to the investor
  - `listDocumentsForInvestor(investorId)`
  - `adminUploadDocument({ ownerType, ownerId, title, category, file })` — admin only; PDF only (`application/pdf`); max 15MB
  - `GET /api/documents/[id]/download` — auth + access check → 302/redirect to short-lived presigned URL (60–300s) or stream

- [ ] **Step 1: Access helper tests (pure cases with fixture-like inputs)**

Test platform always allowed for active investor flag; holding owner match; asset requires membership set passed in.

- [ ] **Step 2: Implement access + actions + pages**

Admin page: form (owner type select, owner id text/select for assets from DB, title, category, file). On success show toast/message.

Portal documents: table of title, category, owner label, download link.

Audit: `document.uploaded`, `document.downloaded` (download may be high volume — log upload always; download optional once per request).

- [ ] **Step 3: `npm test` + commit**

```bash
git commit -m "add admin document upload and investor document vault"
```

---

### Task 3: Plan 2 hardening + portal income summary

**Files:**
- Modify: `apps/web/lib/interests/actions.ts`
- Modify: `apps/web/lib/interests/admin-actions.ts`
- Modify: `apps/web/app/portal/page.tsx` and/or `app/portal/holdings/page.tsx`
- Create: `apps/web/lib/portfolio/summary.ts`
- Create: `apps/web/tests/portfolio-summary.test.ts`

**Interfaces:**
- Produces:
  - `annualTargetIncomeEur(holdings: { amountEur: number; targetYieldPct: string | number }[]): number`
  - Friendly mapping when Postgres unique violation on pending interest insert (`code === "23505"`)
  - try/catch around admin confirm/decline emails (same pattern as createInterest)

- [ ] **Step 1: TDD portfolio summary**

```ts
expect(annualTargetIncomeEur([{ amountEur: 10000, targetYieldPct: 8 }])).toBe(800);
expect(annualTargetIncomeEur([])).toBe(0);
```

Formula: sum of `amountEur * Number(targetYieldPct) / 100`, rounded to nearest euro integer.

- [ ] **Step 2: Harden interest create**

Wrap insert in try/catch; on unique violation return `{ ok: false, error: "You already have a pending interest in this asset." }`.

- [ ] **Step 3: Harden admin emails with try/catch**

- [ ] **Step 4: Show on portal/holdings: total committed EUR + estimated annual contractual target income + disclaimer**

- [ ] **Step 5: Commit**

```bash
git commit -m "harden interest mutations and add portfolio income summary"
```

---

### Task 4: Minimal admin assets console

**Files:**
- Create: `apps/web/app/admin/assets/page.tsx`
- Create: `apps/web/lib/assets/admin-actions.ts`
- Modify: `apps/web/app/admin/page.tsx`

**Interfaces:**
- Produces:
  - `setAssetStatus({ assetId, status: "draft" | "published" | "closed" })` admin-only
  - Admin list of all assets with status badges and actions Publish / Unpublish (draft) / Close
- No full create/edit form in Plan 3 (seed remains source for new assets). Audit `asset.status_changed`.

- [ ] **Step 1: Implement list + status actions**
- [ ] **Step 2: Commit**

```bash
git commit -m "add admin asset status console"
```

---

### Task 5: Playwright smoke + Plan 3 verify + production checklist

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/smoke.spec.ts`
- Create: `apps/web/docs/plan3-verify.md`
- Create: `apps/web/docs/PRODUCTION_CHECKLIST.md`
- Modify: `apps/web/package.json` scripts `test:e2e`
- Modify: `apps/web/docs/SETUP.md` (link Plan 3 docs)
- Modify: `README.md` (link production checklist)

**Interfaces:**
- Produces documented launch gate

- [ ] **Step 1: Install Playwright as devDependency**

```bash
cd apps/web && npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Smoke e2e (no auth required)**

```ts
import { test, expect } from "@playwright/test";

test("home and opportunities load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /parkwise/i }).first()).toBeVisible();
  await page.goto("/opportunities");
  // May 500 without DB — assert either asset cards OR a recoverable error region;
  // Prefer: skip if process.env.DATABASE_URL missing
});
```

If `DATABASE_URL` unset, mark opportunities test as `test.skip`. Always assert `/api/health` JSON ok via `request` fixture.

Optional auth e2e behind `E2E_CLERK_USER` / `E2E_CLERK_PASSWORD` env — skip if unset.

- [ ] **Step 3: `plan3-verify.md` checklist**

Include: unit tests, build, health, documents upload (if R2), investor download, income summary, asset status toggle, unique-violation friendly error, production checklist reviewed.

- [ ] **Step 4: `PRODUCTION_CHECKLIST.md`**

Must include:

1. `DEMO_MODE=false` only after counsel sign-off  
2. Clerk production instance + admin metadata process  
3. Neon backups enabled  
4. R2 private bucket, no public ACL  
5. Resend domain verified  
6. Legal pages reviewed by counsel (replace draft copy)  
7. Static demo portal/register/dashboard **not** served on production domain  
8. Vercel env secrets set; no secrets in repo  
9. Run migrate + seed on production DB  
10. Smoke: sign-up → onboard → interest → admin confirm → holding + document  

- [ ] **Step 5: Commit**

```bash
git commit -m "add Plan 3 verify docs, Playwright smoke, and production checklist"
```

---

## Spec coverage (Plan 3)

| Spec area | Task |
|---|---|
| Document vault + R2 | Tasks 1–2 |
| Portfolio holdings view polish | Task 3 |
| Admin assets management (minimal) | Task 4 |
| Rate limit / audit (already mostly done) | Task 3 hardening |
| E2E + production checklist | Task 5 |
| Plan 2 follow-ups (unique error, admin email catch) | Task 3 |

## Out of Plan 3

- Full asset create/edit CMS
- Neon serverless transactions / WebSocket driver migration (note in PRODUCTION_CHECKLIST as follow-up)
- Real KYC provider
- Payments
