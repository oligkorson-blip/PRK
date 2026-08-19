# Assisted KYC + Flow Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add staff-assisted KYC/onboarding on behalf of investors, and fix all findings from four reviewed flows: auth, 2FA/account security, content/legal, and the opportunity catalogue.

**Architecture:** Workstream 1 adds three scoped server actions (`assistedKycUpload`, `assistedOnboardingProfile`, `assistedAcceptDeclarations`) reusing the existing investor pipelines with staff actors and audit events, surfaced in a new "Assisted KYC" section of the admin investor-detail KYC tab. Workstream 2 funnels behavior changes into pure `lib/` helpers with vitest coverage (the repo has no component-test harness), with exact before/after edits for markup/copy changes.

**Tech Stack:** Next.js 15 App Router, Better Auth, Postgres + Drizzle, vitest, Playwright (e2e), `qrcode` (one new dependency, Task 12).

**Spec:** `docs/superpowers/specs/2026-07-23-assisted-kyc-and-flow-fixes-design.md`

## Global Constraints

- Run all JS commands from `apps/web`; node/npm need `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` first.
- Server actions return `{ ok: true, ... }` / `{ ok: false, error }`; never throw for expected failures. Authorization checks live inside the action.
- Staff scoping: `investorVisibleToStaff` from `lib/auth/staff` (agents/IBs see only their book; super admins unrestricted). Out-of-scope targets return a not-found-style error — no existence oracle.
- Never edit an applied migration in `apps/web/drizzle/` (head: 0017) or `drizzle/meta` snapshots.
- Demo-mode semantics (`lib/demo-mode.ts`) untouched.
- Verify before done: `npx tsc --noEmit`, `npx vitest run` (and `npm run build` where a task says so).
- `npm install` always with `--legacy-peer-deps`.

## Execution Order Notes

- **Tasks must land in numeric order.** Known cross-task dependencies: Task 8 moves auth pages into an `app/(auth)/` route group that Tasks 5-7 edit; Task 11's enrollment rewrite builds on Task 9's copy change; Task 15's challenge-page edit applies on top of Task 13's rewrite; Task 18 assumes Task 17's text as its before-state.
- Task 16 Step 1 adds `esbuild: { jsx: "automatic" }` to `vitest.config.ts` — it is the only task that edits that file; do not duplicate the edit.
- Real-code divergences discovered during planning (already reflected in the tasks): `investorVisibleToStaff` lives in `lib/auth/staff.ts`; the catalogue component is `app/opportunities/opportunities-catalogue.tsx`; the catalogue default sort is already neutral (locked by test); `formatYieldBand` stays exported for the OG image; `app/legal/complaints/page.tsx` already had metadata and is rewired through the shared constants.
- `LEGAL_META` effective dates (Task 16) are set to `2026-07-23` as placeholders in one constants file — confirm/adjust before release.

---
# Workstream 1 — Agent-assisted manual KYC (Tasks 1–4)

Spec: `docs/superpowers/specs/2026-07-23-assisted-kyc-and-flow-fixes-design.md`, section "Workstream 1".

Scope: `apps/web`. All commands run from `/Users/mac/Documents/Park/apps/web`, after:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
```

## Conventions used throughout (verified against real code)

- Server actions return `{ ok: true, ... }` / `{ ok: false, error }`; authz inside the action (house rule).
- Staff auth: `requireAdmin()` from `@/lib/auth/investor` (returns `{ id, email, staffId, role, user, staff }`, throws on non-staff — wrap in try/catch like `setKycStatus` does).
- Scoping: `investorVisibleToStaff({ role, staffId, investor: { assignedAgentId, ibId } })` imported from **`@/lib/auth/staff`** (not `lib/access/scope.ts` — that file only wraps it for auth-user targeting).
- Missing or out-of-scope investor → `{ ok: false, error: "Not found" }` (spec: no existence oracle).
- Audit pattern (copied exactly from `lib/kyc/actions.ts` / `lib/onboarding/actions.ts`):
  ```ts
  await db.insert(auditEvents).values({
    actorUserId: admin.id,
    action: "<event>",
    entityType: "investor",
    entityId: investorId,
    payload: { ... }
  });
  ```
- Test style follows `tests/kyc-set-status.test.ts` (mock `next/cache`, `@/lib/auth/investor`, `@/lib/auth/session`, `@/lib/db` with `{}` table stubs) and `tests/document-upload-actions.test.ts` (storage/sniff mocks).

## Divergences from the assignment's assumptions (verified in code)

1. `investorVisibleToStaff` lives in `lib/auth/staff.ts`, not `lib/access/scope.ts`.
2. The upload constants (`MAX_BYTES`, `ALLOWED`, `ALLOWED_CATEGORIES`) in `lib/kyc/actions.ts` are module-private and **cannot be exported** — the file starts with `"use server"`, and `"use server"` modules may only export async functions. They are duplicated (3 lines) in `lib/kyc/assisted-actions.ts`.
3. `onboardingFormSchema` (`lib/onboarding/schema.ts`) includes declaration literals (`acceptTerms`, `acceptRisk`, `isQualifyingInvestor`, `understandsCapitalAtRisk`) that cannot be validated from stored DB data. Task 2 adds an `onboardingProfileSchema` (a `.pick()` of the same schema) used by both assisted actions — this keeps "same Zod schema" semantics while making stored-profile validation possible.
4. `InvestorDetail` / `getInvestorDetailForStaff` (`lib/access/queries.ts`) does not select `dateOfBirth`, `address`, `nationality`, `pepDeclaration`, or `eligibilityAnswers` — Task 4 extends both to prefill the profile form. No page change is needed (`app/admin/investors/[investorId]/page.tsx` already passes the whole `investor` object).
5. The investor upload pipeline has no title field — it stores `file.name` as the document title. The spec's upload form has a title input, so `assistedKycUpload` accepts an optional `title` form field, falling back to `file.name`.
6. `assistedKycUpload` deliberately has **no** `requireCompletedOnboarding` / `accountStatus` gate (unlike `uploadKycDocument`) — assisted upload exists precisely for investors who have not completed onboarding.

---

### Task 1: `assistedKycUpload` server action

**Files:**
- Create: `apps/web/lib/kyc/assisted-actions.ts`
- Test: `apps/web/tests/kyc-assisted-upload.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `assistedKycUpload(investorId: string, formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }>` — form fields: `category` (kyc_id / kyc_address / kyc_company / kyc_other), `title` (optional, ≤200 chars, defaults to file name), `file` (File). Consumed by Task 4.

- [ ] **Step 1: write the failing test**

Create `apps/web/tests/kyc-assisted-upload.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
  requireSessionUser: vi.fn()
}));

const selectQueue: unknown[] = [];
const txSelectQueue: unknown[][] = [];
const txAuditValues = vi.fn();

function thenableWithLimit(rows: unknown[]) {
  const promise = Promise.resolve(rows) as Promise<unknown[]> & {
    limit: (n: number) => Promise<unknown[]>;
  };
  promise.limit = vi.fn().mockResolvedValue(rows);
  return promise;
}

function txWhereResult(rows: unknown[]) {
  const promise = Promise.resolve(rows) as Promise<unknown[]> & {
    for: (mode: string) => Promise<unknown[]>;
  };
  promise.for = vi.fn().mockResolvedValue(rows);
  return promise;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => selectQueue.shift() ?? thenableWithLimit([]))
      }))
    })),
    insert: vi.fn(),
    transaction: vi.fn()
  },
  auditEvents: {},
  documents: {},
  investors: {}
}));
vi.mock("@/lib/storage/local", () => ({
  buildObjectKey: vi.fn().mockReturnValue("docs/investor/inv/key.pdf"),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  isStorageConfigured: vi.fn().mockReturnValue(true),
  putObject: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/storage/sniff", () => ({ sniffMatchesType: vi.fn().mockResolvedValue(true) }));

import { requireAdmin } from "@/lib/auth/investor";
import { db, documents } from "@/lib/db";
import { deleteObject, putObject } from "@/lib/storage/local";
import { sniffMatchesType } from "@/lib/storage/sniff";
import { assistedKycUpload } from "@/lib/kyc/assisted-actions";

const INVESTOR_ID = "11111111-1111-4111-8111-111111111111";

function staff(role: "super_admin" | "agent" | "ib", staffId = "staff-1") {
  return {
    id: "user-1",
    email: "staff@example.com",
    staffId,
    role,
    user: { id: "user-1", email: "staff@example.com" },
    staff: { id: staffId, role, ibId: null }
  };
}

function uploadForm(overrides?: { category?: string; title?: string; file?: File }): FormData {
  const data = new FormData();
  data.set("category", overrides?.category ?? "kyc_id");
  data.set("title", overrides?.title ?? "");
  data.set(
    "file",
    overrides?.file ?? new File(["%PDF-1.4 fake"], "passport.pdf", { type: "application/pdf" })
  );
  return data;
}

/** Queue the two db.select calls: investor lookup (.limit(1)), then pre-insert cap count. */
function queueInvestor(row: { assignedAgentId: string | null; ibId: string | null } | null, preCount: unknown[] = []) {
  selectQueue.push(thenableWithLimit(row ? [row] : []));
  selectQueue.push(thenableWithLimit(preCount));
}

const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => txWhereResult(txSelectQueue.shift() ?? []))
    }))
  })),
  insert: vi.fn((table: unknown) => ({
    values: vi.fn((values: unknown) => {
      if (table === documents) {
        return { returning: vi.fn().mockResolvedValue([{ id: "doc-1" }]) };
      }
      txAuditValues(values);
      return Promise.resolve(undefined);
    }
  }))
};

describe("assistedKycUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue.length = 0;
    txSelectQueue.length = 0;
    // In-transaction selects: row lock, then cap recount (empty = under cap).
    txSelectQueue.push([{ id: INVESTOR_ID }], []);
    vi.mocked(db.transaction).mockImplementation(
      ((cb: (txArg: typeof tx) => unknown) => Promise.resolve(cb(tx))) as never
    );
    vi.mocked(requireAdmin).mockResolvedValue(staff("agent") as never);
    queueInvestor({ assignedAgentId: "staff-1", ibId: null });
  });

  it("rejects callers without a staff session", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm());

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("rejects an agent acting on an investor outside their book (no existence oracle)", async () => {
    selectQueue.length = 0;
    queueInvestor({ assignedAgentId: "staff-2", ibId: null });

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm());

    expect(result).toEqual({ ok: false, error: "Not found" });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("uploads a document for an investor in the agent's book and audits it", async () => {
    const result = await assistedKycUpload(INVESTOR_ID, uploadForm({ title: "Passport" }));

    expect(result).toEqual({ ok: true, id: "doc-1" });
    expect(putObject).toHaveBeenCalledOnce();
    expect(txAuditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "kyc.assisted_upload",
        entityType: "investor",
        entityId: INVESTOR_ID,
        payload: expect.objectContaining({ documentId: "doc-1", staffId: "staff-1" })
      })
    );
  });

  it("rejects files over 10 MB before touching storage", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", {
      type: "application/pdf"
    });

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm({ file: big }));

    expect(result).toEqual({ ok: false, error: "File must be 10 MB or smaller." });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("rejects a file whose bytes do not match its declared type", async () => {
    vi.mocked(sniffMatchesType).mockResolvedValue(false);

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm());

    expect(result).toEqual({ ok: false, error: "File content does not match its type." });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("rejects when the investor already has 10 files", async () => {
    selectQueue.length = 0;
    queueInvestor({ assignedAgentId: "staff-1", ibId: null }, Array.from({ length: 10 }, (_, i) => ({ id: `d${i}` })));

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm());

    expect(result).toEqual({ ok: false, error: "This investor already has 10 files." });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("deletes the stored object when the database insert fails", async () => {
    vi.mocked(db.transaction).mockRejectedValueOnce(new Error("db down"));

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm());

    expect(result).toEqual({ ok: false, error: "Could not save the document." });
    expect(deleteObject).toHaveBeenCalledWith("docs/investor/inv/key.pdf");
  });
});
```

Run:

```bash
npx vitest run tests/kyc-assisted-upload.test.ts
```

Expected: FAIL — module `@/lib/kyc/assisted-actions` does not exist.

- [ ] **Step 2: implement `assistedKycUpload`**

Create `apps/web/lib/kyc/assisted-actions.ts`:

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/investor";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import { auditEvents, db, documents, investors } from "@/lib/db";
import { buildObjectKey, deleteObject, isStorageConfigured, putObject } from "@/lib/storage/local";
import { sniffMatchesType } from "@/lib/storage/sniff";

// Mirrors the investor pipeline in ./actions. Duplicated (not exported there)
// because "use server" modules may only export async functions.
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_CATEGORIES = new Set(["kyc_id", "kyc_address", "kyc_company", "kyc_other"]);

/**
 * Staff upload on behalf of an investor. Same pipeline as uploadKycDocument
 * (MIME + magic-byte sniffing, 10 MB cap, category validation,
 * storage-write-then-DB-insert with cleanup, 10-file cap) but actor = staff
 * and no onboarding/account gate — assisted upload exists for investors who
 * have not completed onboarding themselves.
 */
export async function assistedKycUpload(
  investorId: string,
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }
  if (!isStorageConfigured()) {
    return { ok: false, error: "Document storage is not configured." };
  }

  const [target] = await db
    .select({ assignedAgentId: investors.assignedAgentId, ibId: investors.ibId })
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);
  // One "Not found" for missing and out-of-scope alike — no existence oracle.
  if (!target) return { ok: false, error: "Not found" };
  if (
    !investorVisibleToStaff({
      role: admin.role,
      staffId: admin.staffId,
      investor: { assignedAgentId: target.assignedAgentId, ibId: target.ibId }
    })
  ) {
    return { ok: false, error: "Not found" };
  }

  const rawCategory = String(formData.get("category") ?? "kyc_other");
  const category = ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : "kyc_other";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file." };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "File must be 10 MB or smaller." };
  if (!ALLOWED.has(file.type)) return { ok: false, error: "PDF, JPEG, or PNG only." };
  if (!(await sniffMatchesType(file, file.type))) {
    return { ok: false, error: "File content does not match its type." };
  }
  const title = String(formData.get("title") ?? "").trim().slice(0, 200) || file.name;

  const ownerFilter = and(eq(documents.ownerType, "investor"), eq(documents.ownerId, investorId));
  const existing = await db.select({ id: documents.id }).from(documents).where(ownerFilter);
  if (existing.length >= 10) {
    return { ok: false, error: "This investor already has 10 files." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = buildObjectKey({
    ownerType: "investor",
    ownerId: investorId,
    filename: file.name
  });
  try {
    await putObject(storageKey, buffer, file.type);
  } catch (err) {
    console.error("[storage:put]", err);
    return { ok: false, error: "Upload to storage failed." };
  }

  try {
    // Lock the investor row so concurrent uploads serialize on the cap check.
    const doc = await db.transaction(async (tx) => {
      await tx
        .select({ id: investors.id })
        .from(investors)
        .where(eq(investors.id, investorId))
        .for("update");
      const count = await tx.select({ id: documents.id }).from(documents).where(ownerFilter);
      if (count.length >= 10) throw new Error("KYC_CAP_EXCEEDED");
      const [inserted] = await tx
        .insert(documents)
        .values({
          ownerType: "investor",
          ownerId: investorId,
          title,
          category,
          storageKey,
          contentType: file.type,
          uploadedBy: admin.id
        })
        .returning();
      await tx.insert(auditEvents).values({
        actorUserId: admin.id,
        action: "kyc.assisted_upload",
        entityType: "investor",
        entityId: investorId,
        payload: { documentId: inserted.id, category, contentType: file.type, staffId: admin.staffId }
      });
      return inserted;
    });

    revalidatePath(`/admin/investors/${investorId}`);
    revalidatePath("/portal/kyc");
    return { ok: true, id: doc.id };
  } catch (err) {
    await deleteObject(storageKey).catch((cleanupErr) => {
      console.error("[storage:cleanup]", cleanupErr);
    });
    if (err instanceof Error && err.message === "KYC_CAP_EXCEEDED") {
      return { ok: false, error: "This investor already has 10 files." };
    }
    console.error("[kyc:assisted-upload]", err);
    return { ok: false, error: "Could not save the document." };
  }
}
```

Run:

```bash
npx vitest run tests/kyc-assisted-upload.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 3: commit**

```bash
git add apps/web/lib/kyc/assisted-actions.ts apps/web/tests/kyc-assisted-upload.test.ts
git commit -m "Add staff-assisted KYC document upload action"
```

---

### Task 2: `assistedOnboardingProfile` server action

**Files:**
- Modify: `apps/web/lib/onboarding/schema.ts`
- Create: `apps/web/lib/onboarding/assisted-actions.ts`
- Test: `apps/web/tests/onboarding-schema.test.ts` (extend), `apps/web/tests/onboarding-assisted-actions.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `onboardingProfileSchema` (Zod object: fullName, country, phone, dateOfBirth, address, nationality, pepDeclaration, investmentHorizon, sourceOfFunds) from `lib/onboarding/schema.ts` — also consumed by Task 3 and Task 4.
  - `assistedOnboardingProfile(investorId: string, fields: unknown): Promise<{ ok: true } | { ok: false; error: string }>` — consumed by Task 4.

- [ ] **Step 1: write the failing schema test**

In `apps/web/tests/onboarding-schema.test.ts`, change the import line to:

```ts
import { onboardingFormDataToInput, onboardingFormSchema, onboardingProfileSchema } from "@/lib/onboarding/schema";
```

Append at the end of the file:

```ts
describe("onboardingProfileSchema", () => {
  const validProfile = {
    fullName: "Jane Investor",
    country: "Ireland",
    phone: "+353 1 234 5678",
    dateOfBirth: "1985-04-12",
    address: "12 Harbour Road, Sligo",
    nationality: "Irish",
    pepDeclaration: false,
    investmentHorizon: "5-10",
    sourceOfFunds: "Employment income and prior investment proceeds."
  };

  it("accepts a valid profile without declaration fields", () => {
    expect(onboardingProfileSchema.safeParse(validProfile).success).toBe(true);
  });

  it("accepts a blank phone", () => {
    expect(onboardingProfileSchema.safeParse({ ...validProfile, phone: "" }).success).toBe(true);
  });

  it("rejects an incomplete profile", () => {
    expect(onboardingProfileSchema.safeParse({ ...validProfile, dateOfBirth: "" }).success).toBe(false);
    expect(onboardingProfileSchema.safeParse({ ...validProfile, pepDeclaration: null }).success).toBe(false);
    expect(onboardingProfileSchema.safeParse({ ...validProfile, investmentHorizon: "1-3" }).success).toBe(false);
  });
});
```

Run:

```bash
npx vitest run tests/onboarding-schema.test.ts
```

Expected: FAIL — `onboardingProfileSchema` is not exported.

- [ ] **Step 2: add `onboardingProfileSchema` to the schema**

In `apps/web/lib/onboarding/schema.ts`, append after the `OnboardingFormInput` type export:

```ts
// Profile-only subset used by the staff-assisted actions. The full schema's
// declaration literals (acceptTerms/acceptRisk/isQualifyingInvestor/
// understandsCapitalAtRisk) are form checkboxes, not stored columns, so they
// can't be validated from the investors row — assistedAcceptDeclarations
// validates this profile shape against stored data instead.
export const onboardingProfileSchema = onboardingFormSchema.pick({
  fullName: true,
  country: true,
  phone: true,
  dateOfBirth: true,
  address: true,
  nationality: true,
  pepDeclaration: true,
  investmentHorizon: true,
  sourceOfFunds: true
});

export type OnboardingProfileInput = z.infer<typeof onboardingProfileSchema>;
```

Run:

```bash
npx vitest run tests/onboarding-schema.test.ts
```

Expected: PASS.

- [ ] **Step 3: commit the schema addition**

```bash
git add apps/web/lib/onboarding/schema.ts apps/web/tests/onboarding-schema.test.ts
git commit -m "Add onboardingProfileSchema for assisted KYC profile validation"
```

- [ ] **Step 4: write the failing action test**

Create `apps/web/tests/onboarding-assisted-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
  requireSessionUser: vi.fn()
}));

const selectLimit = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const insertValues = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: selectLimit })) }))
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => {
        updateSet(values);
        return { where: updateWhere };
      })
    })),
    insert: vi.fn(() => ({ values: insertValues }))
  },
  auditEvents: {},
  investors: {}
}));

import { requireAdmin } from "@/lib/auth/investor";
import { db } from "@/lib/db";
import { assistedOnboardingProfile } from "@/lib/onboarding/assisted-actions";

const INVESTOR_ID = "11111111-1111-4111-8111-111111111111";

function staff(role: "super_admin" | "agent" | "ib", staffId = "staff-1") {
  return {
    id: "user-1",
    email: "staff@example.com",
    staffId,
    role,
    user: { id: "user-1", email: "staff@example.com" },
    staff: { id: staffId, role, ibId: null }
  };
}

function investorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVESTOR_ID,
    authUserId: "auth-inv-1",
    email: "jane@example.com",
    fullName: "Jane Investor",
    country: "Ireland",
    phone: "+353 1 234 5678",
    dateOfBirth: "1985-04-12",
    address: "12 Harbour Road, Sligo",
    nationality: "Irish",
    pepDeclaration: false,
    onboardingStatus: "started",
    accountStatus: "active",
    kycStatus: "not_started",
    kycRejectReason: null,
    accountType: "individual",
    eligibilityAnswers: { investmentHorizon: "5-10", sourceOfFunds: "Savings" },
    termsAcceptedAt: null,
    riskAcceptedAt: null,
    assignedAgentId: "staff-1",
    ibId: null,
    ...overrides
  };
}

const validFields = {
  fullName: "Jane Investor",
  country: "Ireland",
  phone: "+353 9 999 9999",
  dateOfBirth: "1985-04-12",
  address: "12 Harbour Road, Sligo",
  nationality: "Irish",
  pepDeclaration: false,
  investmentHorizon: "5-10",
  sourceOfFunds: "Savings"
};

describe("assistedOnboardingProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(staff("agent") as never);
    selectLimit.mockResolvedValue([investorRow()]);
  });

  it("rejects an agent acting on an investor outside their book", async () => {
    selectLimit.mockResolvedValue([investorRow({ assignedAgentId: "staff-2" })]);

    const result = await assistedOnboardingProfile(INVESTOR_ID, validFields);

    expect(result).toEqual({ ok: false, error: "Not found" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns not found when the investor does not exist", async () => {
    selectLimit.mockResolvedValue([]);

    const result = await assistedOnboardingProfile(INVESTOR_ID, validFields);

    expect(result).toEqual({ ok: false, error: "Not found" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("saves a valid profile and audits the change", async () => {
    const result = await assistedOnboardingProfile(INVESTOR_ID, validFields);

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "Jane Investor",
        phone: "+353 9 999 9999",
        dateOfBirth: "1985-04-12",
        eligibilityAnswers: expect.objectContaining({
          investmentHorizon: "5-10",
          sourceOfFunds: "Savings"
        })
      })
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "onboarding.assisted_profile_saved",
        entityType: "investor",
        entityId: INVESTOR_ID
      })
    );
  });

  it("preserves the existing phone when the field is blank", async () => {
    const result = await assistedOnboardingProfile(INVESTOR_ID, { ...validFields, phone: "" });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ phone: "+353 1 234 5678" }));
  });

  it("rejects an invalid profile without writing", async () => {
    const result = await assistedOnboardingProfile(INVESTOR_ID, { ...validFields, fullName: "J" });

    expect(result.ok).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
```

Run:

```bash
npx vitest run tests/onboarding-assisted-actions.test.ts
```

Expected: FAIL — module `@/lib/onboarding/assisted-actions` does not exist.

- [ ] **Step 5: implement `assistedOnboardingProfile`**

Create `apps/web/lib/onboarding/assisted-actions.ts`:

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/investor";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import { auditEvents, db, investors } from "@/lib/db";
import { onboardingProfileSchema } from "./schema";

export type AssistedActionResult = { ok: true } | { ok: false; error: string };

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

// Full-row lookup + staff scoping shared by the assisted onboarding actions.
// Returns null for missing and out-of-scope alike — no existence oracle.
async function findScopedInvestor(investorId: string, admin: AdminContext) {
  const [target] = await db
    .select()
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);
  if (!target) return null;
  if (
    !investorVisibleToStaff({
      role: admin.role,
      staffId: admin.staffId,
      investor: { assignedAgentId: target.assignedAgentId, ibId: target.ibId }
    })
  ) {
    return null;
  }
  return target;
}

/**
 * Staff save of the onboarding profile on behalf of an investor. Validates
 * with onboardingProfileSchema (same rules as the self-serve form, minus the
 * declaration checkboxes) and writes the same investors columns. A blank
 * phone preserves the existing value — partial edits don't null out data.
 */
export async function assistedOnboardingProfile(
  investorId: string,
  fields: unknown
): Promise<AssistedActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const target = await findScopedInvestor(investorId, admin);
  if (!target) return { ok: false, error: "Not found" };

  const parsed = onboardingProfileSchema.safeParse(fields);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { ok: false, error: firstIssue?.message ?? "Please check the profile and try again." };
  }

  const {
    fullName,
    country,
    phone,
    dateOfBirth,
    address,
    nationality,
    pepDeclaration,
    investmentHorizon,
    sourceOfFunds
  } = parsed.data;
  const now = new Date();

  await db
    .update(investors)
    .set({
      fullName,
      country,
      phone: phone ? phone : target.phone,
      dateOfBirth,
      address,
      nationality,
      pepDeclaration,
      eligibilityAnswers: {
        ...target.eligibilityAnswers,
        investmentHorizon,
        sourceOfFunds
      },
      updatedAt: now
    })
    .where(eq(investors.id, investorId));

  await db.insert(auditEvents).values({
    actorUserId: admin.id,
    action: "onboarding.assisted_profile_saved",
    entityType: "investor",
    entityId: investorId,
    payload: { staffId: admin.staffId, investmentHorizon, sourceOfFunds }
  });

  revalidatePath(`/admin/investors/${investorId}`);
  revalidatePath("/portal");
  return { ok: true };
}
```

Run:

```bash
npx vitest run tests/onboarding-assisted-actions.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: commit**

```bash
git add apps/web/lib/onboarding/assisted-actions.ts apps/web/tests/onboarding-assisted-actions.test.ts
git commit -m "Add staff-assisted onboarding profile save action"
```

---

### Task 3: `assistedAcceptDeclarations` server action

**Files:**
- Modify: `apps/web/lib/onboarding/assisted-actions.ts`
- Test: `apps/web/tests/onboarding-assisted-actions.test.ts`

**Interfaces:**
- Consumes: `onboardingProfileSchema` and the `findScopedInvestor` helper pattern from Task 2; `isOnboardingComplete` from `@/lib/auth/gates`.
- Produces: `assistedAcceptDeclarations(investorId: string): Promise<{ ok: true } | { ok: false; error: string }>` — consumed by Task 4.

- [ ] **Step 1: write the failing test**

In `apps/web/tests/onboarding-assisted-actions.test.ts`, change the import line to:

```ts
import {
  assistedAcceptDeclarations,
  assistedOnboardingProfile
} from "@/lib/onboarding/assisted-actions";
```

Append at the end of the file:

```ts
describe("assistedAcceptDeclarations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(staff("agent") as never);
    selectLimit.mockResolvedValue([investorRow()]);
  });

  it("rejects an agent acting on an investor outside their book", async () => {
    selectLimit.mockResolvedValue([investorRow({ assignedAgentId: null, ibId: null })]);

    const result = await assistedAcceptDeclarations(INVESTOR_ID);

    expect(result).toEqual({ ok: false, error: "Not found" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("refuses when the stored profile does not validate", async () => {
    selectLimit.mockResolvedValue([investorRow({ dateOfBirth: null })]);

    const result = await assistedAcceptDeclarations(INVESTOR_ID);

    expect(result).toEqual({
      ok: false,
      error: "Profile is incomplete — save the onboarding profile first."
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("sets the same acceptance flags and status as completeOnboarding", async () => {
    const result = await assistedAcceptDeclarations(INVESTOR_ID);

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        onboardingStatus: "completed",
        termsAcceptedAt: expect.any(Date),
        riskAcceptedAt: expect.any(Date),
        eligibilityAnswers: expect.objectContaining({
          investmentHorizon: "5-10",
          sourceOfFunds: "Savings",
          isQualifyingInvestor: true,
          understandsCapitalAtRisk: true
        })
      })
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "onboarding.assisted_completed",
        entityType: "investor",
        entityId: INVESTOR_ID
      })
    );
  });

  it("is a no-op success when onboarding is already complete", async () => {
    selectLimit.mockResolvedValue([
      investorRow({ onboardingStatus: "completed", termsAcceptedAt: new Date(), riskAcceptedAt: new Date() })
    ]);

    const result = await assistedAcceptDeclarations(INVESTOR_ID);

    expect(result).toEqual({ ok: true });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
```

Run:

```bash
npx vitest run tests/onboarding-assisted-actions.test.ts
```

Expected: FAIL — `assistedAcceptDeclarations` is not exported by the module.

- [ ] **Step 2: implement `assistedAcceptDeclarations`**

In `apps/web/lib/onboarding/assisted-actions.ts`, add the import of the gate helper to the import block:

```ts
import { requireAdmin } from "@/lib/auth/investor";
import { isOnboardingComplete } from "@/lib/auth/gates";
```

Append at the end of the file:

```ts
/**
 * Staff acceptance of the onboarding declarations on behalf of an investor.
 * Refuses unless the stored profile fully validates (same rules as
 * completeOnboarding), then sets the same acceptance timestamps/flags and
 * onboardingStatus: "completed". Idempotent like completeOnboarding.
 */
export async function assistedAcceptDeclarations(
  investorId: string
): Promise<AssistedActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const target = await findScopedInvestor(investorId, admin);
  if (!target) return { ok: false, error: "Not found" };

  // Idempotent, mirrors completeOnboarding: a repeat click changes nothing.
  if (isOnboardingComplete(target)) {
    return { ok: true };
  }

  const eligibility = target.eligibilityAnswers;
  const candidate = {
    fullName: target.fullName,
    country: target.country,
    phone: target.phone ?? "",
    dateOfBirth: target.dateOfBirth ?? "",
    address: target.address ?? "",
    nationality: target.nationality ?? "",
    pepDeclaration: target.pepDeclaration,
    investmentHorizon: eligibility.investmentHorizon,
    sourceOfFunds: eligibility.sourceOfFunds
  };
  if (!onboardingProfileSchema.safeParse(candidate).success) {
    return { ok: false, error: "Profile is incomplete — save the onboarding profile first." };
  }

  const now = new Date();
  await db
    .update(investors)
    .set({
      onboardingStatus: "completed",
      eligibilityAnswers: {
        ...eligibility,
        isQualifyingInvestor: true,
        understandsCapitalAtRisk: true
      },
      termsAcceptedAt: now,
      riskAcceptedAt: now,
      updatedAt: now
    })
    .where(eq(investors.id, investorId));

  await db.insert(auditEvents).values({
    actorUserId: admin.id,
    action: "onboarding.assisted_completed",
    entityType: "investor",
    entityId: investorId,
    payload: { staffId: admin.staffId }
  });

  revalidatePath(`/admin/investors/${investorId}`);
  revalidatePath("/portal");
  return { ok: true };
}
```

Run:

```bash
npx vitest run tests/onboarding-assisted-actions.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 3: commit**

```bash
git add apps/web/lib/onboarding/assisted-actions.ts apps/web/tests/onboarding-assisted-actions.test.ts
git commit -m "Add staff-assisted onboarding declarations acceptance"
```

---

### Task 4: "Assisted KYC" section in the KYC tab

**Files:**
- Modify: `apps/web/lib/access/queries.ts` (extend `InvestorDetail` + its select)
- Create: `apps/web/components/admin-assisted-kyc.tsx`
- Modify: `apps/web/components/admin-investor-detail-tabs.tsx`

**Interfaces:**
- Consumes: `assistedKycUpload` (Task 1), `assistedOnboardingProfile` and `assistedAcceptDeclarations` (Tasks 2–3), `onboardingProfileSchema` (Task 2).
- Produces: nothing consumed by later tasks.

This task is UI wiring of already-tested actions — markup-only edits with typecheck + full test-suite verification (the repo has no client-component test harness; all `tests/` are node-run vitest).

- [ ] **Step 1: extend `InvestorDetail` and its select for profile prefill**

In `apps/web/lib/access/queries.ts`, extend the type (after the `ibEmail: string | null;` line):

```ts
  ibId: string | null;
  ibEmail: string | null;
  dateOfBirth: string | null;
  address: string | null;
  nationality: string | null;
  pepDeclaration: boolean | null;
  eligibilityAnswers: Record<string, unknown>;
};
```

and add the matching columns to the `.select({ ... })` in `getInvestorDetailForStaff` (after `ibEmail: ib.email`):

```ts
      ibId: investors.ibId,
      ibEmail: ib.email,
      dateOfBirth: investors.dateOfBirth,
      address: investors.address,
      nationality: investors.nationality,
      pepDeclaration: investors.pepDeclaration,
      eligibilityAnswers: investors.eligibilityAnswers
    })
```

(`dateOfBirth` is `date("date_of_birth", { mode: "string" })` in `lib/db/schema.ts:113`, so `string | null` is correct. `eligibilityAnswers` is `jsonb(...).$type<Record<string, unknown>>()` — `lib/db/schema.ts:119`.)

- [ ] **Step 2: create the Assisted KYC client component**

Create `apps/web/components/admin-assisted-kyc.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InvestorDetail } from "@/lib/access/queries";
import { assistedKycUpload } from "@/lib/kyc/assisted-actions";
import {
  assistedAcceptDeclarations,
  assistedOnboardingProfile
} from "@/lib/onboarding/assisted-actions";
import { investmentHorizonOptions, onboardingProfileSchema } from "@/lib/onboarding/schema";

export function AdminAssistedKyc({ investor }: { investor: InvestorDetail }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const eligibility = investor.eligibilityAnswers;
  const profileValid = onboardingProfileSchema.safeParse({
    fullName: investor.fullName,
    country: investor.country,
    phone: investor.phone ?? "",
    dateOfBirth: investor.dateOfBirth ?? "",
    address: investor.address ?? "",
    nationality: investor.nationality ?? "",
    pepDeclaration: investor.pepDeclaration,
    investmentHorizon: eligibility.investmentHorizon,
    sourceOfFunds: eligibility.sourceOfFunds
  }).success;
  const onboardingDone = investor.onboardingStatus === "completed";

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Failed");
        return;
      }
      setMessage(done);
      router.refresh();
    });
  }

  function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const result = await assistedKycUpload(investor.id, fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("File uploaded.");
      form.reset();
      router.refresh();
    });
  }

  function handleProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const pep = fd.get("pepDeclaration");
    run(
      () =>
        assistedOnboardingProfile(investor.id, {
          fullName: String(fd.get("fullName") ?? ""),
          country: String(fd.get("country") ?? ""),
          phone: String(fd.get("phone") ?? ""),
          dateOfBirth: String(fd.get("dateOfBirth") ?? ""),
          address: String(fd.get("address") ?? ""),
          nationality: String(fd.get("nationality") ?? ""),
          pepDeclaration: pep === "yes" ? true : pep === "no" ? false : null,
          investmentHorizon: String(fd.get("investmentHorizon") ?? ""),
          sourceOfFunds: String(fd.get("sourceOfFunds") ?? "")
        }),
      "Profile saved."
    );
  }

  const defaultHorizon =
    typeof eligibility.investmentHorizon === "string" ? eligibility.investmentHorizon : "";
  const defaultSourceOfFunds =
    typeof eligibility.sourceOfFunds === "string" ? eligibility.sourceOfFunds : "";

  return (
    <div className="admin-assisted-kyc">
      <p className="field-hint" style={{ marginBottom: 16 }}>
        Complete KYC steps on behalf of this investor. Every action is audit-logged against your
        staff account; the investor&apos;s own portal path stays available.
      </p>

      <form className="interest-form stack-4" onSubmit={handleUpload}>
        <h3 className="h4">Upload a document</h3>
        <label className="form-field">
          <span>Category</span>
          <select name="category" defaultValue="kyc_id">
            <option value="kyc_id">ID document</option>
            <option value="kyc_address">Address proof</option>
            <option value="kyc_company">Company document</option>
            <option value="kyc_other">Other</option>
          </select>
        </label>
        <label className="form-field">
          <span>Title (optional — defaults to the file name)</span>
          <input name="title" type="text" maxLength={200} />
        </label>
        <label className="form-field">
          <span>File (PDF / JPEG / PNG, max 10 MB)</span>
          <input name="file" type="file" accept=".pdf,image/jpeg,image/png" required />
        </label>
        <button className="btn btn-ghost" type="submit" disabled={isPending}>
          Upload for investor
        </button>
      </form>

      <form className="interest-form stack-4" onSubmit={handleProfile}>
        <h3 className="h4">Onboarding profile</h3>
        <div className="form-grid">
          <label className="form-field">
            <span>Full name</span>
            <input
              name="fullName"
              type="text"
              required
              minLength={2}
              maxLength={120}
              defaultValue={investor.fullName}
            />
          </label>
          <label className="form-field">
            <span>Country of residence</span>
            <input
              name="country"
              type="text"
              required
              minLength={2}
              maxLength={80}
              defaultValue={investor.country}
            />
          </label>
          <label className="form-field">
            <span>Phone (optional — leaving it blank keeps the existing number)</span>
            <input name="phone" type="tel" maxLength={40} defaultValue={investor.phone ?? ""} />
          </label>
          <label className="form-field">
            <span>Date of birth</span>
            <input name="dateOfBirth" type="date" required defaultValue={investor.dateOfBirth ?? ""} />
          </label>
          <label className="form-field">
            <span>Nationality</span>
            <input
              name="nationality"
              type="text"
              required
              minLength={2}
              maxLength={80}
              defaultValue={investor.nationality ?? ""}
            />
          </label>
          <label className="form-field form-field-wide">
            <span>Residential address</span>
            <textarea
              name="address"
              required
              minLength={5}
              maxLength={300}
              rows={2}
              defaultValue={investor.address ?? ""}
            />
          </label>
          <label className="form-field">
            <span>Investment horizon</span>
            <select name="investmentHorizon" required defaultValue={defaultHorizon}>
              <option value="" disabled>
                Select a horizon
              </option>
              {investmentHorizonOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "3-5" ? "3–5 years" : option === "5-10" ? "5–10 years" : "10+ years"}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field form-field-wide">
            <span>Source of funds</span>
            <textarea
              name="sourceOfFunds"
              required
              minLength={2}
              maxLength={200}
              rows={3}
              defaultValue={defaultSourceOfFunds}
            />
          </label>
          <fieldset className="form-field form-field-wide">
            <span>Is the investor a politically exposed person (PEP)?</span>
            <label className="form-checkbox">
              <input
                name="pepDeclaration"
                type="radio"
                value="no"
                required
                defaultChecked={investor.pepDeclaration === false}
              />
              <span>No</span>
            </label>
            <label className="form-checkbox">
              <input
                name="pepDeclaration"
                type="radio"
                value="yes"
                required
                defaultChecked={investor.pepDeclaration === true}
              />
              <span>Yes</span>
            </label>
          </fieldset>
        </div>
        <button className="btn btn-ghost" type="submit" disabled={isPending}>
          Save profile
        </button>
      </form>

      <div className="stack-4">
        <h3 className="h4">Declarations</h3>
        <p className="field-hint">Completing onboarding records that the investor, through you:</p>
        <ul className="field-hint">
          <li>meets the eligibility criteria for this offering;</li>
          <li>understands capital is at risk and target returns are not guaranteed;</li>
          <li>has read and accepts the Terms of use and Privacy policy;</li>
          <li>has read and accepts the Risk disclosure.</li>
        </ul>
        <button
          className="btn btn-primary"
          type="button"
          disabled={isPending || !profileValid || onboardingDone}
          onClick={() =>
            run(() => assistedAcceptDeclarations(investor.id), "Onboarding completed.")
          }
        >
          Complete onboarding on behalf of investor
        </button>
        {!profileValid && !onboardingDone ? (
          <p className="field-hint">Save a valid profile above before completing onboarding.</p>
        ) : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="field-hint">{message}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: render the section in the KYC tab**

In `apps/web/components/admin-investor-detail-tabs.tsx`, add the import at the top with the other component imports:

```tsx
import { AdminSection } from "@/components/admin/admin-section";
import { AdminAssistedKyc } from "@/components/admin-assisted-kyc";
import { AdminInvestorAccessActions } from "@/components/admin-investor-access-actions";
```

Change the KYC tab block from:

```tsx
      {tab === "kyc" ? (
        <AdminSection title="KYC documents">
```

to a fragment containing the existing section plus the new one (the existing `KYC documents` section body is unchanged — only the wrapper changes):

```tsx
      {tab === "kyc" ? (
        <>
          <AdminSection title="KYC documents">
            {/* ...existing KYC documents content unchanged... */}
          </AdminSection>
          <AdminSection title="Assisted KYC">
            <AdminAssistedKyc investor={investor} />
          </AdminSection>
        </>
      ) : null}
```

Apply this by editing exactly the two boundary lines: replace `{tab === "kyc" ? (\n        <AdminSection title="KYC documents">` with `{tab === "kyc" ? (\n        <>\n          <AdminSection title="KYC documents">`, and replace the closing of that section (`        </AdminSection>\n      ) : null}` immediately before the `interests` tab) with `          </AdminSection>\n          <AdminSection title="Assisted KYC">\n            <AdminAssistedKyc investor={investor} />\n          </AdminSection>\n        </>\n      ) : null}`. Indent the existing KYC-documents JSX one level deeper to match.

The existing KYC status actions (`AdminInvestorAccessActions` with the approve / under-review / reject buttons) stay in the Profile tab — unchanged per spec.

- [ ] **Step 4: verify**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: typecheck clean; full suite green (including the two new test files from Tasks 1–3).

- [ ] **Step 5: commit**

```bash
git add apps/web/lib/access/queries.ts apps/web/components/admin-assisted-kyc.tsx apps/web/components/admin-investor-detail-tabs.tsx
git commit -m "Add Assisted KYC section to the admin investor KYC tab"
```

---

# Area 3 — Auth flows (Tasks 5–8)

Plan part for spec `docs/superpowers/specs/2026-07-23-assisted-kyc-and-flow-fixes-design.md`, "Area 3: Auth flows" (all 8 findings).

Finding → task map:

- Finding 1 (password bounds mismatch) → Task 5
- Finding 8 (password guidance hint) → Task 5
- Finding 2 (forgot-password failure handling) → Task 6
- Finding 3 (raw Better Auth errors on sign-in) → Task 6
- Finding 4 (activation double sign-in) → Task 7
- Finding 5 (auth chrome consistency: footer + noindex) → Task 8
- Finding 6 (email verification gap comment) → Task 8
- Finding 7 (bootstrap flag startup warning) → Task 8

Conventions: run all commands from `apps/web` after `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"`. Unit tests are node-env, hermetic and DB-free (mock `@/lib/db` like `tests/kyc-set-status.test.ts`). Server actions return `{ ok: true, ... }` / `{ ok: false, error }`.

Notes on real code vs. assumptions (relevant for assembly):

- `components/site-footer-gate.tsx` **and** `components/site-header-gate.tsx` both duplicate `AUTH_PREFIXES = ["/sign-in", "/set-password", "/sign-up"]` — `/forgot-password` and `/reset-password` currently render the marketing header/footer. Task 8 extracts a shared `isAuthPath`.
- Actual password-bounds mismatch: sign-up form uses `minLength={8}`; `app/set-password/page.tsx` uses `minLength={10}` with **no** `maxLength`; `app/reset-password/page.tsx` already uses literals `10`/`128`; `lib/apply/set-password.ts` hardcodes `< 10` with no max check; `lib/auth/auth.ts` has literals `10`/`128`.
- `setPasswordWithInvite` returns only `{ ok: true }` — it has the investor row in scope, so Task 7 returns the email for the direct sign-in.
- Only `forgot-password` and `reset-password` have a per-page `layout.tsx` with `robots: noindex`; sign-in, sign-up, set-password have none.
- No `instrumentation.ts` exists yet — Task 8 creates it for the startup warning.
- `app/sign-up/page.tsx` uses `auth-page container` chrome, not `sign-in-page`; Task 8 unifies chrome via a route-group layout.

---

### Task 5: Shared password-bounds constant + aligned forms + hint copy

**Files:**
- Create: `apps/web/lib/auth/password-policy.ts`
- Modify: `apps/web/lib/auth/auth.ts`
- Modify: `apps/web/lib/apply/set-password.ts`
- Modify: `apps/web/components/sign-up-form.tsx`
- Modify: `apps/web/app/set-password/page.tsx`
- Modify: `apps/web/app/reset-password/page.tsx`
- Test: `apps/web/tests/password-policy.test.ts`
- Test: `apps/web/tests/set-password.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces (from `@/lib/auth/password-policy`):
  - `PASSWORD_MIN_LENGTH: number` (10)
  - `PASSWORD_MAX_LENGTH: number` (128)
  - `PASSWORD_HINT: string` ("Use at least 10 characters.")
  - Task 7 relies on `setPasswordWithInvite(input: { token: string; password: string })` in `lib/apply/set-password.ts` keeping its current signature; only its result type changes there (Task 7).

- [ ] **Step 1: Write the failing tests**

  Create `apps/web/tests/password-policy.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import {
    PASSWORD_HINT,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH
  } from "@/lib/auth/password-policy";
  import { auth } from "@/lib/auth/auth";

  describe("password policy constants", () => {
    it("are min 10 / max 128", () => {
      expect(PASSWORD_MIN_LENGTH).toBe(10);
      expect(PASSWORD_MAX_LENGTH).toBe(128);
      expect(PASSWORD_HINT).toBe("Use at least 10 characters.");
    });

    it("match the better-auth server policy (single source of truth)", () => {
      expect(auth.options.emailAndPassword?.minPasswordLength).toBe(PASSWORD_MIN_LENGTH);
      expect(auth.options.emailAndPassword?.maxPasswordLength).toBe(PASSWORD_MAX_LENGTH);
    });
  });
  ```

  Create `apps/web/tests/set-password.test.ts` (mock shape mirrors `tests/kyc-set-status.test.ts`; the full db mock is included now because Task 7 extends this file):

  ```ts
  import { beforeEach, describe, expect, it, vi } from "vitest";

  const selectLimit = vi.fn();
  const updateWhere = vi.fn();
  const updateReturning = vi.fn();
  const insertValues = vi.fn();

  vi.mock("@/lib/db", () => ({
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: selectLimit }))
        }))
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: updateWhere }))
      })),
      insert: vi.fn(() => ({ values: insertValues }))
    },
    account: {},
    auditEvents: {},
    inviteTokens: {},
    investors: {}
  }));

  vi.mock("better-auth/crypto", () => ({
    hashPassword: vi.fn(async () => "hashed-password")
  }));

  import { setPasswordWithInvite } from "@/lib/apply/set-password";

  describe("setPasswordWithInvite password policy", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("rejects passwords shorter than the shared minimum", async () => {
      const result = await setPasswordWithInvite({ token: "t", password: "short" });

      expect(result).toEqual({ ok: false, error: "Password must be at least 10 characters." });
      expect(selectLimit).not.toHaveBeenCalled();
    });

    it("rejects passwords longer than the shared maximum", async () => {
      const result = await setPasswordWithInvite({ token: "t", password: "x".repeat(129) });

      expect(result).toEqual({ ok: false, error: "Password must be at most 128 characters." });
      expect(selectLimit).not.toHaveBeenCalled();
    });
  });
  ```

  Run: `npx vitest run tests/password-policy.test.ts tests/set-password.test.ts`
  Expected: FAIL — `@/lib/auth/password-policy` does not resolve; the max-length test fails because `lib/apply/set-password.ts` has no upper bound.

- [ ] **Step 2: Create the shared constant module**

  Create `apps/web/lib/auth/password-policy.ts`:

  ```ts
  /**
   * Single source of truth for the password policy. Better Auth
   * (lib/auth/auth.ts) and every new-password form (sign-up, set-password,
   * reset-password) must use these constants so client and server stay aligned.
   */
  export const PASSWORD_MIN_LENGTH = 10;
  export const PASSWORD_MAX_LENGTH = 128;
  export const PASSWORD_HINT = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  ```

- [ ] **Step 3: Consume the constants in `lib/auth/auth.ts`**

  Add to the import block:

  ```ts
  import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
  ```

  Replace in the `emailAndPassword` block:

  ```ts
  minPasswordLength: 10,
  maxPasswordLength: 128,
  ```

  with:

  ```ts
  minPasswordLength: PASSWORD_MIN_LENGTH,
  maxPasswordLength: PASSWORD_MAX_LENGTH,
  ```

- [ ] **Step 4: Enforce min and max in `lib/apply/set-password.ts`**

  Add import:

  ```ts
  import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
  ```

  Replace:

  ```ts
  const password = input.password;
  if (!password || password.length < 10) {
    return { ok: false, error: "Password must be at least 10 characters." };
  }
  ```

  with:

  ```ts
  const password = input.password;
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.` };
  }
  ```

- [ ] **Step 5: Align the three forms and add the hint copy**

  In `apps/web/components/sign-up-form.tsx`, add import:

  ```ts
  import { PASSWORD_HINT, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
  ```

  Replace the password field (note the current `minLength={8}` — the actual mismatch):

  ```tsx
  <label className="form-field">
    <span>Password</span>
    <input
      name="password"
      type="password"
      autoComplete="new-password"
      required
      minLength={8}
    />
  </label>
  ```

  with:

  ```tsx
  <label className="form-field">
    <span>Password</span>
    <input
      name="password"
      type="password"
      autoComplete="new-password"
      required
      minLength={PASSWORD_MIN_LENGTH}
      maxLength={PASSWORD_MAX_LENGTH}
    />
    <span className="field-hint">{PASSWORD_HINT}</span>
  </label>
  ```

  In `apps/web/app/set-password/page.tsx`, add import:

  ```ts
  import { PASSWORD_HINT, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
  ```

  Replace the "New password" field:

  ```tsx
  <label className="form-field">
    <span>New password</span>
    <input name="password" type="password" minLength={10} required autoComplete="new-password" />
  </label>
  ```

  with:

  ```tsx
  <label className="form-field">
    <span>New password</span>
    <input
      name="password"
      type="password"
      minLength={PASSWORD_MIN_LENGTH}
      maxLength={PASSWORD_MAX_LENGTH}
      required
      autoComplete="new-password"
    />
    <span className="field-hint">{PASSWORD_HINT}</span>
  </label>
  ```

  Replace the "Confirm password" field's input with:

  ```tsx
  <input
    name="confirm"
    type="password"
    minLength={PASSWORD_MIN_LENGTH}
    maxLength={PASSWORD_MAX_LENGTH}
    required
    autoComplete="new-password"
  />
  ```

  In `apps/web/app/reset-password/page.tsx`, add the same import and replace both password fields (literals `10`/`128` become the constants) and add the hint under "New password":

  ```tsx
  <label className="form-field">
    <span>New password</span>
    <input
      name="password"
      type="password"
      minLength={PASSWORD_MIN_LENGTH}
      maxLength={PASSWORD_MAX_LENGTH}
      autoComplete="new-password"
      required
    />
    <span className="field-hint">{PASSWORD_HINT}</span>
  </label>
  <label className="form-field">
    <span>Confirm password</span>
    <input
      name="confirmation"
      type="password"
      minLength={PASSWORD_MIN_LENGTH}
      maxLength={PASSWORD_MAX_LENGTH}
      autoComplete="new-password"
      required
    />
  </label>
  ```

- [ ] **Step 6: Verify**

  Run: `npx vitest run tests/password-policy.test.ts tests/set-password.test.ts tests/auth-password-reset.test.ts` — expect PASS (the existing `auth-password-reset.test.ts` assertions on `minPasswordLength`/`maxPasswordLength` stay green).
  Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/lib/auth/password-policy.ts apps/web/lib/auth/auth.ts apps/web/lib/apply/set-password.ts apps/web/components/sign-up-form.tsx apps/web/app/set-password/page.tsx apps/web/app/reset-password/page.tsx apps/web/tests/password-policy.test.ts apps/web/tests/set-password.test.ts
  git commit -m "Unify password policy bounds across auth forms"
  ```

---

### Task 6: Forgot-password failure handling + friendly sign-in errors

**Files:**
- Create: `apps/web/lib/auth/forgot-password.ts`
- Create: `apps/web/lib/auth/sign-in-errors.ts`
- Modify: `apps/web/app/forgot-password/page.tsx`
- Modify: `apps/web/app/sign-in/page.tsx`
- Test: `apps/web/tests/auth-error-copy.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `FORGOT_PASSWORD_ERROR: string` and `requestPasswordResetSafely(send: () => Promise<unknown>): Promise<{ sent: true } | { sent: false; error: string }>` from `@/lib/auth/forgot-password`
  - `friendlySignInError(error: { code?: string; message?: string } | null): string` from `@/lib/auth/sign-in-errors` (generic fallback: `"Sign in failed. Try again or contact support."`)
  - No later task depends on these, but Task 8 moves both modified pages into `app/(auth)/`.

- [ ] **Step 1: Write the failing test**

  Create `apps/web/tests/auth-error-copy.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import { FORGOT_PASSWORD_ERROR, requestPasswordResetSafely } from "@/lib/auth/forgot-password";
  import { friendlySignInError } from "@/lib/auth/sign-in-errors";

  describe("requestPasswordResetSafely", () => {
    it("resolves sent when delivery succeeds", async () => {
      await expect(requestPasswordResetSafely(async () => undefined)).resolves.toEqual({
        sent: true
      });
    });

    it("maps a thrown transport error to the generic copy", async () => {
      const result = await requestPasswordResetSafely(async () => {
        throw new Error("SMTP connection refused");
      });

      expect(result).toEqual({ sent: false, error: FORGOT_PASSWORD_ERROR });
    });

    it("generic copy points at support", () => {
      expect(FORGOT_PASSWORD_ERROR).toBe(
        "We couldn't send the reset link. Try again or contact contact@parkwise.eu."
      );
    });
  });

  describe("friendlySignInError", () => {
    it("maps known Better Auth codes to friendly copy", () => {
      expect(friendlySignInError({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
        "Incorrect email or password."
      );
      expect(friendlySignInError({ code: "EMAIL_NOT_VERIFIED" })).toBe(
        "Verify your email address before signing in."
      );
      expect(friendlySignInError({ code: "TOO_MANY_REQUESTS" })).toBe(
        "Too many attempts. Wait a minute and try again."
      );
    });

    it("falls back to generic copy for unknown codes, raw messages, and null", () => {
      const fallback = "Sign in failed. Try again or contact support.";
      expect(friendlySignInError({ code: "SOMETHING_ELSE", message: "raw db error" })).toBe(fallback);
      expect(friendlySignInError({ message: "raw only" })).toBe(fallback);
      expect(friendlySignInError(null)).toBe(fallback);
    });
  });
  ```

  Run: `npx vitest run tests/auth-error-copy.test.ts`
  Expected: FAIL — both `@/lib/auth/forgot-password` and `@/lib/auth/sign-in-errors` do not resolve.

- [ ] **Step 2: Create the forgot-password helper**

  Create `apps/web/lib/auth/forgot-password.ts`:

  ```ts
  /**
   * Forgot-password transport wrapper. The success copy stays generic on
   * purpose (no registered-email enumeration); this helper only surfaces
   * genuine transport failures so the caller can always leave pending state.
   */
  export const FORGOT_PASSWORD_ERROR =
    "We couldn't send the reset link. Try again or contact contact@parkwise.eu.";

  export async function requestPasswordResetSafely(
    send: () => Promise<unknown>
  ): Promise<{ sent: true } | { sent: false; error: string }> {
    try {
      await send();
      return { sent: true };
    } catch {
      return { sent: false, error: FORGOT_PASSWORD_ERROR };
    }
  }
  ```

- [ ] **Step 3: Create the sign-in error mapper**

  Create `apps/web/lib/auth/sign-in-errors.ts`:

  ```ts
  /**
   * Better Auth returns raw error codes/messages; map the codes a user can act
   * on to friendly copy and hide everything else behind a generic fallback so
   * internal errors never reach the UI.
   */
  const SIGN_IN_ERROR_FALLBACK = "Sign in failed. Try again or contact support.";

  export function friendlySignInError(
    error: { code?: string; message?: string } | null
  ): string {
    switch (error?.code) {
      case "INVALID_EMAIL_OR_PASSWORD":
        return "Incorrect email or password.";
      case "EMAIL_NOT_VERIFIED":
        return "Verify your email address before signing in.";
      case "TOO_MANY_REQUESTS":
        return "Too many attempts. Wait a minute and try again.";
      default:
        return SIGN_IN_ERROR_FALLBACK;
    }
  }
  ```

- [ ] **Step 4: Wire the forgot-password page**

  In `apps/web/app/forgot-password/page.tsx`, replace the imports and component body. Add `setError` state and use the wrapper so `pending` always resets:

  ```tsx
  "use client";

  import Link from "next/link";
  import { useState } from "react";
  import { authClient } from "@/lib/auth/client";
  import { requestPasswordResetSafely } from "@/lib/auth/forgot-password";

  export default function ForgotPasswordPage() {
    const [pending, setPending] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      setPending(true);
      setError(null);
      const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
      const result = await requestPasswordResetSafely(() =>
        authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`
        })
      );
      setPending(false);
      if (!result.sent) {
        setError(result.error);
        return;
      }
      // Always show the same response to avoid disclosing registered emails or
      // mail-delivery state to an unauthenticated caller.
      setSubmitted(true);
    }
  ```

  Inside the `<form>`, directly above the submit button, add:

  ```tsx
  {error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null}
  ```

  The rest of the JSX (card chrome, submitted state, back link) is unchanged.

- [ ] **Step 5: Wire the sign-in page**

  In `apps/web/app/sign-in/page.tsx`, add import:

  ```ts
  import { friendlySignInError } from "@/lib/auth/sign-in-errors";
  ```

  In `SignInForm.handleSubmit`, replace:

  ```ts
  if (result.error) {
    const hint = await getSignInHint(email);
    setError(hint ?? result.error.message ?? "Sign in failed.");
    return;
  }
  ```

  with:

  ```ts
  if (result.error) {
    const hint = await getSignInHint(email);
    setError(hint ?? friendlySignInError(result.error));
    return;
  }
  ```

  (`getSignInHint` keeps precedence: a pending-application hint is actionable copy, not an error.)

- [ ] **Step 6: Verify**

  Run: `npx vitest run tests/auth-error-copy.test.ts` — expect PASS.
  Run: `npx tsc --noEmit` — expect clean.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/lib/auth/forgot-password.ts apps/web/lib/auth/sign-in-errors.ts apps/web/app/forgot-password/page.tsx apps/web/app/sign-in/page.tsx apps/web/tests/auth-error-copy.test.ts
  git commit -m "Handle reset transport failures and map sign-in errors to friendly copy"
  ```

---

### Task 7: Direct sign-in after invite activation

**Files:**
- Modify: `apps/web/lib/apply/set-password.ts`
- Modify: `apps/web/app/set-password/page.tsx`
- Test: `apps/web/tests/set-password.test.ts`

**Interfaces:**
- Consumes: `PASSWORD_MIN_LENGTH`/`PASSWORD_MAX_LENGTH` validation already in `lib/apply/set-password.ts` (Task 5); the db mock scaffold in `tests/set-password.test.ts` (Task 5).
- Produces: `SetPasswordResult = { ok: true; email: string } | { ok: false; error: string }` from `@/lib/apply/set-password` — the success branch now carries the investor email so the client can call `authClient.signIn.email` without a second login. No later task consumes it.

- [ ] **Step 1: Write the failing test**

  Append to `apps/web/tests/set-password.test.ts` (the mocks from Task 5 are already in scope):

  ```ts
  describe("setPasswordWithInvite success", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns the investor email so the client can sign in directly", async () => {
      selectLimit
        .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }])
        .mockResolvedValueOnce([
          { id: "inv-1", authUserId: "auth-1", email: "investor@example.com" }
        ]);
      // Awaiting a plain object resolves immediately, so one where() result
      // serves both the account update (.returning) and the invite update.
      updateWhere.mockReturnValue({ returning: updateReturning });
      updateReturning.mockResolvedValue([{ id: "acc-1" }]);
      insertValues.mockResolvedValue(undefined);

      const result = await setPasswordWithInvite({
        token: "token-abc",
        password: "valid-password-1"
      });

      expect(result).toEqual({ ok: true, email: "investor@example.com" });
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ action: "investor.password_set", entityId: "inv-1" })
      );
    });

    it("still rejects an expired or invalid invite", async () => {
      selectLimit.mockResolvedValueOnce([]);

      const result = await setPasswordWithInvite({
        token: "token-abc",
        password: "valid-password-1"
      });

      expect(result).toEqual({
        ok: false,
        error: "Invite expired or invalid. Ask your advisor for a new invite."
      });
    });
  });
  ```

  Run: `npx vitest run tests/set-password.test.ts`
  Expected: FAIL — success case returns `{ ok: true }` without `email`.

- [ ] **Step 2: Return the email from the action**

  In `apps/web/lib/apply/set-password.ts`, replace:

  ```ts
  export type SetPasswordResult = { ok: true } | { ok: false; error: string };
  ```

  with:

  ```ts
  export type SetPasswordResult = { ok: true; email: string } | { ok: false; error: string };
  ```

  Replace the final `return { ok: true };` with:

  ```ts
  // The client signs in with these credentials immediately, so the investor
  // lands in the portal without a second login.
  return { ok: true, email: investor.email };
  ```

- [ ] **Step 3: Sign in from the set-password page**

  In `apps/web/app/set-password/page.tsx`, add import:

  ```ts
  import { authClient } from "@/lib/auth/client";
  ```

  Replace the `startTransition` body in `handleSubmit`:

  ```tsx
  startTransition(async () => {
    const result = await setPasswordWithInvite({ token, password });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const signIn = await authClient.signIn.email({ email: result.email, password });
    if (signIn.error) {
      // Password is saved; fall back to the manual sign-in page.
      router.push("/sign-in?set=1");
      return;
    }
    // /portal routes to /onboarding when onboarding is incomplete.
    router.push("/portal");
    router.refresh();
  });
  ```

- [ ] **Step 4: Verify**

  Run: `npx vitest run tests/set-password.test.ts` — expect PASS.
  Run: `npx tsc --noEmit` — expect clean.
  Run: `npx vitest run` — full suite green.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/lib/apply/set-password.ts apps/web/app/set-password/page.tsx apps/web/tests/set-password.test.ts
  git commit -m "Sign in directly after invite password activation"
  ```

---

### Task 8: Shared auth layout, footer gating, noindex, bootstrap warning, verification comment

**Files:**
- Create: `apps/web/lib/auth/auth-paths.ts`
- Create: `apps/web/app/(auth)/layout.tsx`
- Create: `apps/web/instrumentation.ts`
- Modify: `apps/web/components/site-footer-gate.tsx`
- Modify: `apps/web/components/site-header-gate.tsx`
- Modify: `apps/web/lib/auth/signups.ts`
- Modify: `apps/web/lib/auth/auth.ts`
- Move: `apps/web/app/sign-in/page.tsx` → `apps/web/app/(auth)/sign-in/page.tsx`
- Move: `apps/web/app/sign-up/page.tsx` → `apps/web/app/(auth)/sign-up/page.tsx`
- Move: `apps/web/app/set-password/page.tsx` → `apps/web/app/(auth)/set-password/page.tsx`
- Move: `apps/web/app/forgot-password/{page,layout}.tsx` → `apps/web/app/(auth)/forgot-password/`
- Move: `apps/web/app/reset-password/{page,layout}.tsx` → `apps/web/app/(auth)/reset-password/`
- Test: `apps/web/tests/auth-paths.test.ts`
- Test: `apps/web/tests/signups.test.ts` (extend)

**Interfaces:**
- Consumes: nothing from earlier tasks' produced interfaces (the moved pages are the files edited in Tasks 5–7 — move their final versions).
- Produces:
  - `AUTH_PATH_PREFIXES: readonly string[]` and `isAuthPath(pathname: string): boolean` from `@/lib/auth/auth-paths`
  - `warnIfBootstrapSignupOpen(env?: Record<string, string | undefined>, warn?: (message: string) => void): void` from `@/lib/auth/signups`
  - No later task consumes these.

- [ ] **Step 1: Write the failing tests**

  Create `apps/web/tests/auth-paths.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import { isAuthPath } from "@/lib/auth/auth-paths";

  describe("isAuthPath", () => {
    it("matches all five auth pages", () => {
      for (const path of [
        "/sign-in",
        "/sign-up",
        "/set-password",
        "/forgot-password",
        "/reset-password"
      ]) {
        expect(isAuthPath(path)).toBe(true);
      }
    });

    it("matches nested paths under an auth prefix", () => {
      expect(isAuthPath("/sign-in/anything")).toBe(true);
    });

    it("does not match marketing, portal, or apply paths", () => {
      expect(isAuthPath("/")).toBe(false);
      expect(isAuthPath("/apply")).toBe(false);
      expect(isAuthPath("/portal")).toBe(false);
      expect(isAuthPath("/guides")).toBe(false);
    });
  });
  ```

  Append to `apps/web/tests/signups.test.ts` (add `vi` to the vitest import, and import `warnIfBootstrapSignupOpen`):

  ```ts
  import { describe, expect, it, vi } from "vitest";
  import {
    areSignupsDisabled,
    isBootstrapSignupEmailAllowed,
    warnIfBootstrapSignupOpen
  } from "@/lib/auth/signups";

  // ...existing describes unchanged...

  describe("warnIfBootstrapSignupOpen", () => {
    it("warns when bootstrap signup is open", () => {
      const warn = vi.fn();

      warnIfBootstrapSignupOpen({ ALLOW_BOOTSTRAP_SIGNUP: "true" }, warn);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("ALLOW_BOOTSTRAP_SIGNUP");
    });

    it("stays silent when signups are disabled", () => {
      const warn = vi.fn();

      warnIfBootstrapSignupOpen({}, warn);

      expect(warn).not.toHaveBeenCalled();
    });
  });
  ```

  Run: `npx vitest run tests/auth-paths.test.ts tests/signups.test.ts`
  Expected: FAIL — `@/lib/auth/auth-paths` does not resolve; `warnIfBootstrapSignupOpen` is not exported.

- [ ] **Step 2: Create `lib/auth/auth-paths.ts` and rewire both gates**

  Create `apps/web/lib/auth/auth-paths.ts`:

  ```ts
  /**
   * Auth pages render without the marketing header/footer
   * (components/site-header-gate.tsx and site-footer-gate.tsx). Keep this list
   * in sync with the app/(auth) route group.
   */
  export const AUTH_PATH_PREFIXES = [
    "/sign-in",
    "/sign-up",
    "/set-password",
    "/forgot-password",
    "/reset-password"
  ] as const;

  export function isAuthPath(pathname: string): boolean {
    return AUTH_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
  }
  ```

  Replace `apps/web/components/site-footer-gate.tsx` in full (header gate identical except component name):

  ```tsx
  "use client";

  import { usePathname } from "next/navigation";
  import { isAuthPath } from "@/lib/auth/auth-paths";

  /** Hide marketing footer on admin, portal, and focused auth flows. */
  export function SiteFooterGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    if (pathname.startsWith("/admin") || pathname.startsWith("/portal") || isAuthPath(pathname)) {
      return null;
    }
    return <>{children}</>;
  }
  ```

  Apply the same body to `apps/web/components/site-header-gate.tsx` with `SiteHeaderGate` / "Hide marketing header …".

- [ ] **Step 3: Add `warnIfBootstrapSignupOpen` and the startup hook**

  Append to `apps/web/lib/auth/signups.ts`:

  ```ts
  /**
   * Startup guard: the bootstrap escape hatch opens public signup (restricted
   * to SUPER_ADMIN_EMAILS). Warn loudly so a forgotten flag is visible in logs.
   */
  export function warnIfBootstrapSignupOpen(
    env: Record<string, string | undefined> = process.env,
    warn: (message: string) => void = console.warn
  ): void {
    if (areSignupsDisabled(env)) return;
    warn(
      "ALLOW_BOOTSTRAP_SIGNUP=true: public signup is open (restricted to SUPER_ADMIN_EMAILS). Unset it after creating the first ops account."
    );
  }
  ```

  Create `apps/web/instrumentation.ts` (Next.js 15 runs `register()` once at server startup; no config flag needed):

  ```ts
  export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
      const { warnIfBootstrapSignupOpen } = await import("@/lib/auth/signups");
      warnIfBootstrapSignupOpen();
    }
  }
  ```

- [ ] **Step 4: Email-verification comment in `lib/auth/auth.ts`**

  In the `emailAndPassword` block, directly above `disableSignUp: areSignupsDisabled(),` add:

  ```ts
  // Email verification is intentionally off while signup is limited to the
  // SUPER_ADMIN_EMAILS bootstrap. If signup ever opens beyond bootstrap (see
  // areSignupsDisabled in lib/auth/signups.ts), enable requireEmailVerification
  // and sendVerificationEmail first so unverified addresses cannot sign in.
  ```

- [ ] **Step 5: Shared `(auth)` route-group layout with noindex, move the five pages**

  Create `apps/web/app/(auth)/layout.tsx`:

  ```tsx
  import type { Metadata } from "next";

  // Shared chrome for all auth pages. Auth paths are hidden from the marketing
  // header/footer via isAuthPath (components/site-header-gate.tsx and
  // site-footer-gate.tsx); children inherit the noindex robots metadata.
  export const metadata: Metadata = {
    robots: { index: false, follow: false }
  };

  export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return <main className="sign-in-page">{children}</main>;
  }
  ```

  Move the pages (URLs unchanged — route groups do not affect paths):

  ```bash
  mkdir -p "app/(auth)"
  git mv app/sign-in "app/(auth)/sign-in"
  git mv app/sign-up "app/(auth)/sign-up"
  git mv app/set-password "app/(auth)/set-password"
  git mv app/forgot-password "app/(auth)/forgot-password"
  git mv app/reset-password "app/(auth)/reset-password"
  ```

  In each moved page, drop the now-duplicated `<main className="sign-in-page">` wrapper:

  - `app/(auth)/sign-in/page.tsx` — `SignInPage` returns only the card:

    ```tsx
    export default function SignInPage() {
      return (
        <div className="portal-card">
          <div className="portal-head">
            <span className="brand-mark" aria-hidden="true">
              P
            </span>
            <span>Investor account</span>
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to view your investments, documents, and account updates.</p>
          <Suspense fallback={<p>Loading…</p>}>
            <SignInForm />
          </Suspense>
        </div>
      );
    }
    ```

  - `app/(auth)/set-password/page.tsx` and `app/(auth)/forgot-password/page.tsx` and `app/(auth)/reset-password/page.tsx` — same edit: the default export returns the `<div className="portal-card">…</div>` without the surrounding `<main className="sign-in-page">`.
  - `app/(auth)/sign-up/page.tsx` — replace `<main className="auth-page container">` with the group chrome; the component returns:

    ```tsx
    return (
      <section className="section">
        <p className="field-hint">
          Bootstrap mode — create the first ops account listed in{" "}
          <code>SUPER_ADMIN_EMAILS</code>, then unset{" "}
          <code>ALLOW_BOOTSTRAP_SIGNUP</code>.
        </p>
        <SignUpForm />
      </section>
    );
    ```

  In `app/(auth)/forgot-password/layout.tsx` and `app/(auth)/reset-password/layout.tsx`, remove the `robots: { index: false, follow: false }` line (now inherited from the group layout); keep `title`/`description`. E.g. forgot-password layout becomes:

  ```tsx
  import type { Metadata } from "next";

  export const metadata: Metadata = {
    title: "Forgot password",
    description: "Request a Parkwise account password reset."
  };

  export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
    return children;
  }
  ```

- [ ] **Step 6: Verify**

  Run: `npx vitest run tests/auth-paths.test.ts tests/signups.test.ts` — expect PASS.
  Run: `npx tsc --noEmit` — expect clean.
  Run: `npx vitest run` — full suite green.
  Run: `npm run build` — expect success (confirms the route group, instrumentation hook, and metadata compose).

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/lib/auth/auth-paths.ts "apps/web/app/(auth)" apps/web/app/sign-in apps/web/app/sign-up apps/web/app/set-password apps/web/app/forgot-password apps/web/app/reset-password apps/web/components/site-footer-gate.tsx apps/web/components/site-header-gate.tsx apps/web/lib/auth/signups.ts apps/web/lib/auth/auth.ts apps/web/instrumentation.ts apps/web/tests/auth-paths.test.ts apps/web/tests/signups.test.ts
  git commit -m "Unify auth chrome, noindex auth pages, warn on bootstrap signup flag"
  ```

---

# Area 4 — 2FA & account security (Tasks 9–15)

Spec: `docs/superpowers/specs/2026-07-23-assisted-kyc-and-flow-fixes-design.md`, "Area 4: 2FA & account security" (findings 1–10).

All paths relative to repo root; run commands from `apps/web` after
`export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"`.

Key codebase facts these tasks rely on (verified against the source, not assumed):

- `lib/staff/two-factor-actions.ts` is the template for the investor reset action; `StaffActionResult = { ok: true } | { ok: false; error: string }` comes from `lib/staff/shared.ts`.
- `requireSuperAdmin()` / `getStaffContext()` live in `lib/auth/staff.ts`; `isTwoFactorEnabledForUser(userId)` lives in `lib/auth/queries.ts`.
- The challenge page (`app/two-factor/page.tsx` + `components/two-factor-challenge.tsx`) is a **client** component and there is **no full session while the two-factor cookie is pending**, so staff context cannot be read at page-render time. Post-2FA destination must be resolved *after* verification via a small `"use server"` action (precedent: `lib/apply/sign-in-hint.ts`, a server action called from the client sign-in page).
- better-auth client surface (verified in `node_modules/better-auth/dist/plugins/two-factor/index.d.mts` and `api/routes/session.d.mts`): `authClient.twoFactor.disable({ password })`, `authClient.twoFactor.generateBackupCodes({ password })` (returns `{ backupCodes: string[] }`), `authClient.twoFactor.verifyTotp({ code, trustDevice })`, `authClient.twoFactor.verifyBackupCode({ code, trustDevice })`, and core `authClient.revokeOtherSessions()`.
- `auth.options.rateLimit.customRules` is asserted directly in `tests/better-auth-core.test.ts` — extend that style for the new rules.
- `trustDeviceMaxAge: 7 * 24 * 60 * 60` is already configured in `lib/auth/auth.ts`; only the UI checkbox + `trustDevice` flag are missing.
- **The `e2e/` harness exists** (`apps/web/e2e/journey.spec.ts`, `smoke.spec.ts`, run via `npm run test:e2e`), so finding 10 is a Playwright spec, gated on live-stack env vars exactly like `journey.spec.ts`. TOTP codes are generated in-spec with `createOTP` from `@better-auth/utils/otp` (already in the tree as a better-auth dependency — no new package).

Finding → task map: 1→T9, 2→T10, 3→T11, 4→T12, 5→T13, 6→T13, 7→T14, 8→T14, 9→T15, 10→T15.

---

### Task 9: admin-side investor 2FA reset (`resetInvestorTwoFactor`)

**Files:**
- Create: `apps/web/lib/investors/two-factor-actions.ts`
- Create: `apps/web/app/admin/investors/[investorId]/reset-two-factor-button.tsx`
- Modify: `apps/web/app/admin/investors/[investorId]/page.tsx`
- Modify: `apps/web/components/two-factor-enrollment.tsx` (copy line only)
- Test: `apps/web/tests/investor-two-factor-reset.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `resetInvestorTwoFactor(input: { investorId: string }): Promise<StaffActionResult>` — super-admin only; clears the investor's TOTP secret/backup codes, flips `user.twoFactorEnabled` off, revokes all sessions, audits `investor.two_factor_reset`.

Steps:

- [ ] **Step 1: write the failing test**

Create `apps/web/tests/investor-two-factor-reset.test.ts` (mock style mirrors `tests/kyc-set-status.test.ts`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({
  requireSuperAdmin: vi.fn(),
  investorVisibleToStaff: vi.fn()
}));

const selectLimit = vi.fn();
const txDeleteWhere = vi.fn();
const txUpdateWhere = vi.fn();
const txInsertValues = vi.fn();
const tx = {
  delete: vi.fn(() => ({ where: txDeleteWhere })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: txUpdateWhere })) })),
  insert: vi.fn(() => ({ values: txInsertValues }))
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: selectLimit }))
      }))
    })),
    transaction: vi.fn(async (fn: (txArg: unknown) => Promise<void>) => fn(tx))
  },
  auditEvents: {},
  investors: {},
  session: {},
  twoFactor: {},
  user: {}
}));

import { requireSuperAdmin } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { resetInvestorTwoFactor } from "@/lib/investors/two-factor-actions";

function mockSuperAdmin(userId = "auth-s1") {
  vi.mocked(requireSuperAdmin).mockResolvedValue({
    user: { id: userId, email: "ops@parkwise.test" },
    staff: { id: "s1", role: "super_admin", ibId: null },
    role: "super_admin"
  });
}

describe("resetInvestorTwoFactor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects callers who are not super admins", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await resetInvestorTwoFactor({ investorId: "inv1" });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns not found when the investor does not exist", async () => {
    mockSuperAdmin();
    selectLimit.mockResolvedValue([]);

    const result = await resetInvestorTwoFactor({ investorId: "missing" });

    expect(result).toEqual({ ok: false, error: "Investor not found." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuses investors without a sign-in account", async () => {
    mockSuperAdmin();
    selectLimit.mockResolvedValue([{ id: "inv1", authUserId: null, email: "a@b.c" }]);

    const result = await resetInvestorTwoFactor({ investorId: "inv1" });

    expect(result).toEqual({ ok: false, error: "Investor has no sign-in account yet." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("blocks a super admin resetting their own account through the investor path", async () => {
    mockSuperAdmin("auth-self");
    selectLimit.mockResolvedValue([{ id: "inv1", authUserId: "auth-self", email: "a@b.c" }]);

    const result = await resetInvestorTwoFactor({ investorId: "inv1" });

    expect(result).toEqual({
      ok: false,
      error: "Another super-admin must reset your two-factor access."
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("clears two-factor, revokes sessions, and audits the reset", async () => {
    mockSuperAdmin();
    selectLimit.mockResolvedValue([{ id: "inv1", authUserId: "auth-inv1", email: "a@b.c" }]);

    const result = await resetInvestorTwoFactor({ investorId: "inv1" });

    expect(result).toEqual({ ok: true });
    expect(tx.delete).toHaveBeenCalledTimes(2); // twoFactor + session
    expect(tx.update).toHaveBeenCalledTimes(1); // user.twoFactorEnabled = false
    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "investor.two_factor_reset",
        entityType: "investor",
        entityId: "inv1",
        actorUserId: "auth-s1"
      })
    );
  });
});
```

Run: `npx vitest run tests/investor-two-factor-reset.test.ts`
Expected: FAIL — `Cannot find module '@/lib/investors/two-factor-actions'`.

- [ ] **Step 2: implement the server action**

Create `apps/web/lib/investors/two-factor-actions.ts`, mirroring `lib/staff/two-factor-actions.ts`:

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { auditEvents, db, investors, session, twoFactor, user } from "@/lib/db";
import type { StaffActionResult } from "@/lib/staff/shared";

/**
 * Break-glass recovery for investors locked out of two-factor: clears the
 * target's TOTP secret/backup codes, flips the user flag back off, and
 * revokes every live session so a compromised device cannot linger. Super
 * admins only; another super-admin must perform it if the investor row ever
 * points at the actor's own auth user.
 */
export async function resetInvestorTwoFactor(input: {
  investorId: string;
}): Promise<StaffActionResult> {
  let actor: { userId: string; staffId: string };
  try {
    const staff = await requireSuperAdmin();
    actor = { userId: staff.user.id, staffId: staff.staff.id };
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const [target] = await db
    .select({
      id: investors.id,
      authUserId: investors.authUserId,
      email: investors.email
    })
    .from(investors)
    .where(eq(investors.id, input.investorId))
    .limit(1);
  if (!target) return { ok: false, error: "Investor not found." };
  if (!target.authUserId) {
    return { ok: false, error: "Investor has no sign-in account yet." };
  }
  const authUserId = target.authUserId;
  if (authUserId === actor.userId) {
    return { ok: false, error: "Another super-admin must reset your two-factor access." };
  }

  await db.transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, authUserId));
    await tx
      .update(user)
      .set({ twoFactorEnabled: false, updatedAt: new Date() })
      .where(eq(user.id, authUserId));
    await tx.delete(session).where(eq(session.userId, authUserId));
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "investor.two_factor_reset",
      entityType: "investor",
      entityId: target.id,
      payload: { email: target.email }
    });
  });

  revalidatePath(`/admin/investors/${target.id}`);
  revalidatePath("/admin/investors");
  return { ok: true };
}
```

Run: `npx vitest run tests/investor-two-factor-reset.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: add the reset button to the admin investor detail page**

Create `apps/web/app/admin/investors/[investorId]/reset-two-factor-button.tsx`, mirroring `app/admin/staff/[staffId]/reset-two-factor-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { resetInvestorTwoFactor } from "@/lib/investors/two-factor-actions";

export function ResetInvestorTwoFactorButton({ investorId, email }: {
  investorId: string;
  email: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function reset() {
    if (!window.confirm(`Reset two-factor authentication and revoke all sessions for ${email}?`)) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await resetInvestorTwoFactor({ investorId });
      setMessage(result.ok ? "Two-factor access reset. The investor must enroll again." : result.error);
    });
  }

  return (
    <div>
      <button className="btn btn-ghost" type="button" onClick={reset} disabled={pending}>
        {pending ? "Resetting…" : "Reset two-factor access"}
      </button>
      {message ? <p className="field-hint" role="status">{message}</p> : null}
    </div>
  );
}
```

In `apps/web/app/admin/investors/[investorId]/page.tsx`, add the import:

```ts
import { ResetInvestorTwoFactorButton } from "./reset-two-factor-button";
```

and render a super-admin-only section immediately above the existing `{staff.role === "super_admin" ? (<AdminSection title="Erasure (GDPR)">…` block:

```tsx
      {staff.role === "super_admin" ? (
        <AdminSection title="Two-factor authentication">
          <ResetInvestorTwoFactorButton
            investorId={investor.id}
            email={investor.email}
          />
        </AdminSection>
      ) : null}
```

- [ ] **Step 4: replace the "contact a super-admin" copy**

In `apps/web/components/two-factor-enrollment.tsx` (line 62 today), change:

```tsx
        <p>Keep your backup codes offline. Contact a super-admin if account recovery is required.</p>
```

to:

```tsx
        <p>Keep your backup codes offline. For account recovery, contact ops@parkwise.eu.</p>
```

- [ ] **Step 5: verify and commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean, full suite green.

```bash
git add apps/web/lib/investors/two-factor-actions.ts \
  apps/web/app/admin/investors/[investorId]/reset-two-factor-button.tsx \
  apps/web/app/admin/investors/[investorId]/page.tsx \
  apps/web/components/two-factor-enrollment.tsx \
  apps/web/tests/investor-two-factor-reset.test.ts
git commit -m "feat(admin): super-admin investor 2FA reset with session revocation and audit"
```

---

### Task 10: staff 2FA enforcement — redirect unenrolled staff to /account/security

**Files:**
- Create: `apps/web/lib/auth/two-factor-gate.ts`
- Modify: `apps/web/app/admin/layout.tsx`
- Test: `apps/web/tests/staff-two-factor-gate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. Uses existing `getStaffContext(): Promise<StaffContext | null>` (`lib/auth/staff.ts`) and `isTwoFactorEnabledForUser(userId: string): Promise<boolean>` (`lib/auth/queries.ts`).
- Produces: `requireStaffWithTwoFactor(): Promise<StaffContext>` — redirects to `/` when not staff, to `/account/security` when staff but unenrolled. Used by `app/admin/layout.tsx` (and available to any later staff-only page).

Note: enforcement goes in the admin layout, not inside `getStaffContext` — `getStaffContext` is also called by `/account/security` itself and by the site header on public pages, so gating there would loop or leak. `/account/security` lives outside `/admin`, so the layout redirect cannot loop.

Steps:

- [ ] **Step 1: write the failing test**

Create `apps/web/tests/staff-two-factor-gate.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((url: string): never => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/auth/staff", () => ({ getStaffContext: vi.fn() }));
vi.mock("@/lib/auth/queries", () => ({ isTwoFactorEnabledForUser: vi.fn() }));

import { requireStaffWithTwoFactor } from "@/lib/auth/two-factor-gate";
import { getStaffContext } from "@/lib/auth/staff";
import { isTwoFactorEnabledForUser } from "@/lib/auth/queries";

const STAFF = {
  user: { id: "u1", email: "agent@parkwise.test" },
  staff: { id: "s1", role: "agent" as const, ibId: null },
  role: "agent" as const
};

describe("requireStaffWithTwoFactor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects signed-out and non-staff users to /", async () => {
    vi.mocked(getStaffContext).mockResolvedValue(null);

    await expect(requireStaffWithTwoFactor()).rejects.toThrow("REDIRECT:/");
    expect(isTwoFactorEnabledForUser).not.toHaveBeenCalled();
  });

  it("redirects staff without two-factor enrollment to /account/security", async () => {
    vi.mocked(getStaffContext).mockResolvedValue(STAFF);
    vi.mocked(isTwoFactorEnabledForUser).mockResolvedValue(false);

    await expect(requireStaffWithTwoFactor()).rejects.toThrow("REDIRECT:/account/security");
  });

  it("returns the staff context once two-factor is enabled", async () => {
    vi.mocked(getStaffContext).mockResolvedValue(STAFF);
    vi.mocked(isTwoFactorEnabledForUser).mockResolvedValue(true);

    await expect(requireStaffWithTwoFactor()).resolves.toEqual(STAFF);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run tests/staff-two-factor-gate.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/two-factor-gate'`.

- [ ] **Step 2: implement the gate**

Create `apps/web/lib/auth/two-factor-gate.ts`:

```ts
import { redirect } from "next/navigation";
import { getStaffContext, type StaffContext } from "./staff";
import { isTwoFactorEnabledForUser } from "./queries";

/**
 * Staff must enroll two-factor before using the admin console. The flag is
 * read fresh from the user row (not the session payload) so an enrollment
 * or break-glass reset within the same browser session takes effect
 * immediately. /account/security sits outside /admin, so this cannot loop.
 */
export async function requireStaffWithTwoFactor(): Promise<StaffContext> {
  const staff = await getStaffContext();
  if (!staff) redirect("/");
  const enrolled = await isTwoFactorEnabledForUser(staff.user.id);
  if (!enrolled) redirect("/account/security");
  return staff;
}
```

Run: `npx vitest run tests/staff-two-factor-gate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: wire the gate into the admin layout**

In `apps/web/app/admin/layout.tsx`, change:

```tsx
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getStaffContext } from "@/lib/auth/staff";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaffContext();
  if (!staff) redirect("/");
```

to:

```tsx
import { AdminShell } from "@/components/admin/admin-shell";
import { requireStaffWithTwoFactor } from "@/lib/auth/two-factor-gate";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaffWithTwoFactor();
```

(The `redirect` import is dropped; the rest of the file is unchanged.)

- [ ] **Step 4: verify and commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean, suite green.

```bash
git add apps/web/lib/auth/two-factor-gate.ts \
  apps/web/app/admin/layout.tsx \
  apps/web/tests/staff-two-factor-gate.test.ts
git commit -m "feat(admin): require staff two-factor enrollment before the admin console"
```

---

### Task 11: self-serve disable/re-enroll + regenerate backup codes (password-confirmed)

**Files:**
- Modify: `apps/web/components/two-factor-enrollment.tsx`

**Interfaces:**
- Consumes: the copy line updated in Task 9 (Step 4) — this task's rewrite carries `ops@parkwise.eu` forward; do not resurrect the "contact a super-admin" wording.
- Produces: no new exported interface. Uses better-auth client calls `authClient.twoFactor.disable({ password: string })` and `authClient.twoFactor.generateBackupCodes({ password: string })` (both password-confirmed server-side by better-auth).

This is a client-component behavior change with no unit-test harness for components in this repo (no testing-library dependency; `vitest` runs in `environment: "node"`). The interactive paths are covered by the Playwright spec in Task 15; verification here is typecheck + full suite + production build.

Steps:

- [ ] **Step 1: apply the exact edit**

In `apps/web/components/two-factor-enrollment.tsx`, replace the whole enabled-state block:

```tsx
  if (enabled) {
    return (
      <div className="portal-banner" role="status">
        <p><strong>Two-factor authentication is enabled.</strong></p>
        <p>Keep your backup codes offline. For account recovery, contact ops@parkwise.eu.</p>
        <a className="btn btn-primary" href={destination}>Continue</a>
      </div>
    );
  }
```

with:

```tsx
  if (enabled) {
    return <TwoFactorManagement destination={destination} />;
  }
```

and add this component directly above `export function TwoFactorEnrollment(...)`:

```tsx
function TwoFactorManagement({ destination }: { destination: "/admin" | "/portal" }) {
  const [mode, setMode] = useState<"idle" | "disable" | "regenerate">("idle");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);

  async function disableTwoFactor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const result = await authClient.twoFactor.disable({ password });
    if (result.error) {
      setPending(false);
      setError("Two-factor could not be disabled. Check your password and try again.");
      return;
    }
    // Full reload: the server re-reads the (now disabled) flag and the
    // enrollment form returns, so the user can re-set up immediately.
    window.location.reload();
  }

  async function regenerateBackupCodes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFreshCodes(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const result = await authClient.twoFactor.generateBackupCodes({ password });
    setPending(false);
    if (result.error || !result.data) {
      setError("Backup codes could not be regenerated. Check your password and try again.");
      return;
    }
    // Regeneration invalidates the previous codes server-side.
    setFreshCodes(result.data.backupCodes);
    setMode("idle");
  }

  return (
    <div className="portal-banner" role="status">
      <p><strong>Two-factor authentication is enabled.</strong></p>
      <p>
        Keep your backup codes offline. If you lose access to your authenticator,
        contact ops@parkwise.eu.
      </p>

      {freshCodes ? (
        <div className="form-field">
          <span>New backup codes — save them offline now. The old codes no longer work.</span>
          <ul className="security-code-list">
            {freshCodes.map((code) => <li key={code}><code>{code}</code></li>)}
          </ul>
        </div>
      ) : null}

      {mode === "idle" ? (
        <div className="stack-4">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => { setMode("regenerate"); setError(null); }}
          >
            Regenerate backup codes
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => { setMode("disable"); setError(null); }}
          >
            Disable and set up again
          </button>
          <a className="btn btn-primary" href={destination}>Continue</a>
        </div>
      ) : (
        <form
          className="interest-form"
          onSubmit={mode === "disable" ? disableTwoFactor : regenerateBackupCodes}
        >
          <label className="form-field">
            <span>Confirm with your current password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending
              ? "Working…"
              : mode === "disable"
                ? "Disable two-factor authentication"
                : "Regenerate backup codes"}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => { setMode("idle"); setError(null); }}
            disabled={pending}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: verify and commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: typecheck clean, suite green, production build succeeds.

```bash
git add apps/web/components/two-factor-enrollment.tsx
git commit -m "feat(account): self-serve 2FA disable and backup-code regeneration"
```

---

### Task 12: client-side QR at enrollment (`qrcode` package)

**Files:**
- Modify: `apps/web/package.json` (via npm install)
- Modify: `apps/web/components/two-factor-enrollment.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no new exported interface. Renders the existing `enrollment.totpUri` (already produced by `authClient.twoFactor.enable`) as a locally-generated QR image; the secret never leaves the client.

Steps:

- [ ] **Step 1: install the dependency**

From `apps/web`:

```bash
npm install qrcode --legacy-peer-deps
npm install --save-dev @types/qrcode --legacy-peer-deps
```

Expected: `qrcode` under `dependencies`, `@types/qrcode` under `devDependencies` in `package.json`; lockfile updated.

- [ ] **Step 2: render the QR in enrollment step 1**

In `apps/web/components/two-factor-enrollment.tsx`:

Change the imports:

```tsx
import { useState } from "react";
```

to:

```tsx
import { useEffect, useState } from "react";
import QRCode from "qrcode";
```

Inside `TwoFactorEnrollment`, directly under the existing `const [saved, setSaved] = useState(false);` line, add:

```tsx
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enrollment) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    // Rendered locally in the browser: the TOTP secret never leaves this
    // page for a third-party QR service.
    QRCode.toDataURL(enrollment.totpUri, { margin: 1, width: 192 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        // The manual setup key below remains as the fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [enrollment]);
```

Change the step-1 block:

```tsx
      <div className="form-field">
        <span>1. Add Parkwise to your authenticator</span>
        {enrollment.secret ? (
          <p className="field-hint">Manual setup key: <code>{enrollment.secret}</code></p>
        ) : null}
```

to:

```tsx
      <div className="form-field">
        <span>1. Add Parkwise to your authenticator</span>
        {qrDataUrl ? (
          <p>
            <img
              src={qrDataUrl}
              alt="Scan this QR code with your authenticator app"
              width={192}
              height={192}
            />
          </p>
        ) : null}
        {enrollment.secret ? (
          <p className="field-hint">Manual setup key: <code>{enrollment.secret}</code></p>
        ) : null}
```

- [ ] **Step 3: verify and commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: typecheck clean, suite green, build succeeds (client bundle includes `qrcode`).

```bash
git add apps/web/package.json apps/web/package-lock.json \
  apps/web/components/two-factor-enrollment.tsx
git commit -m "feat(account): render authenticator QR locally at 2FA enrollment"
```

---

### Task 13: post-2FA destination by staff context + "Trust this device for 7 days"

**Files:**
- Create: `apps/web/lib/auth/post-sign-in-actions.ts`
- Modify: `apps/web/components/two-factor-challenge.tsx`
- Modify: `apps/web/app/sign-in/page.tsx`
- Test: `apps/web/tests/post-sign-in-destination.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `resolvePostSignInDestination(): Promise<"/admin" | "/portal">` — server action; call it only after a full session cookie exists (password-only sign-in success, or a successful 2FA verification). Staff → `/admin`, everyone else → `/portal`.

Why a server action: `app/two-factor/page.tsx` renders while only the pending two-factor cookie exists, so `getStaffContext()` cannot resolve there at render time. After `verifyTotp`/`verifyBackupCode` succeeds, the session cookie is set and the action resolves correctly. Precedent for a server action called from a client auth page: `lib/apply/sign-in-hint.ts`.

Steps:

- [ ] **Step 1: write the failing test**

Create `apps/web/tests/post-sign-in-destination.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/staff", () => ({ getStaffContext: vi.fn() }));

import { resolvePostSignInDestination } from "@/lib/auth/post-sign-in-actions";
import { getStaffContext } from "@/lib/auth/staff";

describe("resolvePostSignInDestination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends staff to the admin console", async () => {
    vi.mocked(getStaffContext).mockResolvedValue({
      user: { id: "u1", email: "ops@parkwise.test" },
      staff: { id: "s1", role: "super_admin", ibId: null },
      role: "super_admin"
    });

    await expect(resolvePostSignInDestination()).resolves.toBe("/admin");
  });

  it("sends investors to the portal", async () => {
    vi.mocked(getStaffContext).mockResolvedValue(null);

    await expect(resolvePostSignInDestination()).resolves.toBe("/portal");
  });
});
```

Run: `npx vitest run tests/post-sign-in-destination.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/post-sign-in-actions'`.

- [ ] **Step 2: implement the server action**

Create `apps/web/lib/auth/post-sign-in-actions.ts`:

```ts
"use server";

import { getStaffContext } from "@/lib/auth/staff";

export type PostSignInDestination = "/admin" | "/portal";

/**
 * Where a freshly authenticated user belongs: staff on the admin console,
 * investors on the portal. Called from client components only after a full
 * session cookie exists (password-only sign-in, or a completed 2FA
 * challenge) — during the pending two-factor cookie there is no session and
 * staff context cannot resolve.
 */
export async function resolvePostSignInDestination(): Promise<PostSignInDestination> {
  const staff = await getStaffContext();
  return staff ? "/admin" : "/portal";
}
```

Run: `npx vitest run tests/post-sign-in-destination.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: wire destination + trust-device into the challenge component**

Rewrite `apps/web/components/two-factor-challenge.tsx` to:

```tsx
"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { resolvePostSignInDestination } from "@/lib/auth/post-sign-in-actions";

export function TwoFactorChallenge() {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [trustDevice, setTrustDevice] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "")
      .trim()
      .replace(/\s+/g, "");
    const result =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    if (result.error) {
      setPending(false);
      setError("That verification code is invalid or expired.");
      return;
    }
    // The full session cookie exists now, so staff context resolves; a full
    // navigation picks up the freshly upgraded session cookie.
    const destination = await resolvePostSignInDestination();
    window.location.assign(destination);
  }

  return (
    <>
      <form className="interest-form" onSubmit={submit}>
        <label className="form-field">
          <span>{mode === "totp" ? "Authenticator code" : "Backup code"}</span>
          <input
            name="code"
            type="text"
            inputMode={mode === "totp" ? "numeric" : "text"}
            autoComplete="one-time-code"
            minLength={mode === "totp" ? 6 : 8}
            maxLength={64}
            required
            autoFocus
          />
        </label>
        <label className="form-check">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(event) => setTrustDevice(event.target.checked)}
          />
          <span>Trust this device for 7 days</span>
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
          {pending ? "Verifying…" : "Verify and sign in"}
        </button>
      </form>
      <button
        className="btn btn-ghost btn-block"
        type="button"
        onClick={() => {
          setMode(mode === "totp" ? "backup" : "totp");
          setError(null);
        }}
        disabled={pending}
      >
        {mode === "totp" ? "Use a backup code" : "Use an authenticator code"}
      </button>
    </>
  );
}
```

(`trustDeviceMaxAge: 7 * 24 * 60 * 60` is already set on the twoFactor plugin in `lib/auth/auth.ts`, so the checkbox label matches the configured lifetime.)

- [ ] **Step 4: fix the sign-in page destination**

In `apps/web/app/sign-in/page.tsx`, add the import:

```ts
import { resolvePostSignInDestination } from "@/lib/auth/post-sign-in-actions";
```

and change:

```tsx
    router.push("/portal");
```

to:

```tsx
    if (result.data && "twoFactorRedirect" in result.data) {
      // The twoFactorClient plugin is already redirecting to /two-factor.
      return;
    }
    router.push(await resolvePostSignInDestination());
```

- [ ] **Step 5: verify and commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean, suite green.

```bash
git add apps/web/lib/auth/post-sign-in-actions.ts \
  apps/web/components/two-factor-challenge.tsx \
  apps/web/app/sign-in/page.tsx \
  apps/web/tests/post-sign-in-destination.test.ts
git commit -m "feat(auth): route staff to /admin after sign-in and 2FA; trusted-device option"
```

---

### Task 14: 2FA rate limits + recent sign-ins & revoke-other-sessions on settings

**Files:**
- Modify: `apps/web/lib/auth/auth.ts`
- Modify: `apps/web/lib/access/queries.ts`
- Modify: `apps/web/app/portal/settings/page.tsx`
- Create: `apps/web/app/portal/settings/revoke-sessions-button.tsx`
- Test: `apps/web/tests/better-auth-core.test.ts` (extend)
- Test: `apps/web/tests/access-own-events.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `listOwnAccessEvents(limit?: number): Promise<AccessEventRow[]>` in `lib/access/queries.ts` — self-scoped (via `requireSessionUser`), newest-first, default limit 10. Used by `app/portal/settings/page.tsx`.

Steps:

- [ ] **Step 1: write the failing rate-limit test**

In `apps/web/tests/better-auth-core.test.ts`, inside the `describe("auth instance wiring (lib/auth/auth)")` block, directly after the existing "throttles email sign-in with a custom rule tighter than the default" test, add:

```ts
  it("throttles two-factor verification endpoints against code guessing", () => {
    expect(auth.options.rateLimit?.customRules?.["/two-factor/verify-totp"]).toEqual({
      window: 60,
      max: 5
    });
    expect(auth.options.rateLimit?.customRules?.["/two-factor/verify-backup-code"]).toEqual({
      window: 60,
      max: 5
    });
  });
```

Run: `npx vitest run tests/better-auth-core.test.ts`
Expected: FAIL — both assertions receive `undefined`.

- [ ] **Step 2: add the custom rules**

In `apps/web/lib/auth/auth.ts`, inside `rateLimit.customRules`, after the `"/reset-password"` entry, add:

```ts
      "/reset-password": { window: 300, max: 5 },
      // TOTP/backup-code guessing caps: 6-digit codes stay brute-forceable
      // without a tight per-window limit, and these endpoints sit behind only
      // the short-lived two-factor cookie.
      "/two-factor/verify-totp": { window: 60, max: 5 },
      "/two-factor/verify-backup-code": { window: 60, max: 5 }
```

Run: `npx vitest run tests/better-auth-core.test.ts`
Expected: PASS.

- [ ] **Step 3: write the failing `listOwnAccessEvents` test**

Create `apps/web/tests/access-own-events.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
  requireSessionUser: vi.fn()
}));
vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  investorVisibleToStaff: vi.fn()
}));

const limitMock = vi.fn();
const orderByMock = vi.fn(() => ({ limit: limitMock }));
const whereMock = vi.fn(() => ({ orderBy: orderByMock }));
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));

vi.mock("@/lib/db", () => ({
  db: { select: selectMock },
  staffProfiles: {},
  userAccessEvents: {},
  investors: {}
}));

import { listOwnAccessEvents } from "@/lib/access/queries";
import { requireSessionUser } from "@/lib/auth/session";

describe("listOwnAccessEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries access events for the signed-in user, newest first, capped", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue({ id: "u1", email: "a@b.c" });
    limitMock.mockResolvedValue([{ id: "ev1" }]);

    const events = await listOwnAccessEvents();

    expect(events).toEqual([{ id: "ev1" }]);
    expect(requireSessionUser).toHaveBeenCalledTimes(1);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(limitMock).toHaveBeenCalledWith(10);
  });

  it("honours an explicit limit", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue({ id: "u1", email: "a@b.c" });
    limitMock.mockResolvedValue([]);

    await listOwnAccessEvents(3);

    expect(limitMock).toHaveBeenCalledWith(3);
  });

  it("propagates the unauthenticated error", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(listOwnAccessEvents()).rejects.toThrow("UNAUTHENTICATED");
    expect(selectMock).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run tests/access-own-events.test.ts`
Expected: FAIL — `listOwnAccessEvents is not a function` (export missing).

- [ ] **Step 4: implement `listOwnAccessEvents`**

In `apps/web/lib/access/queries.ts`:

Add the import at the top:

```ts
import { requireSessionUser } from "@/lib/auth/session";
```

Append at the end of the file:

```ts
/**
 * Self-scoped sign-in history for the account security surface. No staff
 * gate: the signed-in user may only ever read their own rows.
 */
export async function listOwnAccessEvents(limit = 10): Promise<AccessEventRow[]> {
  const user = await requireSessionUser();

  return db
    .select({
      id: userAccessEvents.id,
      occurredAt: userAccessEvents.occurredAt,
      ipAddress: userAccessEvents.ipAddress,
      userAgent: userAccessEvents.userAgent,
      uaBrowser: userAccessEvents.uaBrowser,
      uaOs: userAccessEvents.uaOs,
      uaDevice: userAccessEvents.uaDevice,
      countryCode: userAccessEvents.countryCode,
      countryName: userAccessEvents.countryName,
      region: userAccessEvents.region,
      city: userAccessEvents.city,
      timezone: userAccessEvents.timezone,
      isp: userAccessEvents.isp,
      org: userAccessEvents.org,
      isProxy: userAccessEvents.isProxy,
      isVpn: userAccessEvents.isVpn,
      isDatacenter: userAccessEvents.isDatacenter,
      enrichmentStatus: userAccessEvents.enrichmentStatus,
      enrichmentSource: userAccessEvents.enrichmentSource
    })
    .from(userAccessEvents)
    .where(eq(userAccessEvents.authUserId, user.id))
    .orderBy(desc(userAccessEvents.occurredAt))
    .limit(limit);
}
```

Run: `npx vitest run tests/access-own-events.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: add the revoke-other-sessions button**

Create `apps/web/app/portal/settings/revoke-sessions-button.tsx` (naming mirrors the sibling `download-my-data.tsx`):

```tsx
"use client";

import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth/client";

export function RevokeOtherSessionsButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function revoke() {
    if (!window.confirm("Sign out every other session on this account?")) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await authClient.revokeOtherSessions();
      setMessage(
        result.error
          ? "Could not sign out other sessions. Try again."
          : "All other sessions have been signed out."
      );
    });
  }

  return (
    <div className="stack-4">
      <button className="btn btn-ghost" type="button" onClick={revoke} disabled={pending}>
        {pending ? "Signing out…" : "Sign out other sessions"}
      </button>
      {message ? <p className="field-hint" role="status">{message}</p> : null}
    </div>
  );
}
```

- [ ] **Step 6: render recent sign-ins + the button on the settings page**

In `apps/web/app/portal/settings/page.tsx`:

Add the imports:

```ts
import { listOwnAccessEvents } from "@/lib/access/queries";
import { RevokeOtherSessionsButton } from "./revoke-sessions-button";
```

After the `const investor = await ensureInvestor();` line, add:

```ts
  const signIns = await listOwnAccessEvents(10);
```

Replace the Security section:

```tsx
      <section className="section-tight">
        <h2 className="h3">Security</h2>
        <p className="field-hint stack-4">
          Add an authenticator code on top of your password.{" "}
          <Link href="/account/security">Manage two-factor authentication</Link>.
        </p>
      </section>
```

with:

```tsx
      <section className="section-tight">
        <h2 className="h3">Security</h2>
        <p className="field-hint stack-4">
          Add an authenticator code on top of your password.{" "}
          <Link href="/account/security">Manage two-factor authentication</Link>.
        </p>
        <RevokeOtherSessionsButton />
      </section>
      <section className="section-tight">
        <h2 className="h3">Recent sign-ins</h2>
        {signIns.length === 0 ? (
          <p className="field-hint">No sign-ins recorded yet.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Device</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {signIns.map((event) => (
                <tr key={event.id}>
                  <td>{event.occurredAt.toISOString().replace("T", " ").slice(0, 19)} UTC</td>
                  <td>{[event.uaBrowser, event.uaOs].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{event.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="field-hint stack-4">
          Don&apos;t recognise a sign-in? Email ops@parkwise.eu straight away.
        </p>
      </section>
```

- [ ] **Step 7: verify and commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean, suite green.

```bash
git add apps/web/lib/auth/auth.ts \
  apps/web/lib/access/queries.ts \
  apps/web/app/portal/settings/page.tsx \
  apps/web/app/portal/settings/revoke-sessions-button.tsx \
  apps/web/tests/better-auth-core.test.ts \
  apps/web/tests/access-own-events.test.ts
git commit -m "feat(security): rate-limit 2FA verification; show sign-ins and session revocation in settings"
```

---

### Task 15: challenge recovery guidance + Playwright 2FA spec

**Files:**
- Modify: `apps/web/components/two-factor-challenge.tsx`
- Test: `apps/web/e2e/two-factor.spec.ts`

**Interfaces:**
- Consumes: Task 13's rewritten `components/two-factor-challenge.tsx` (the guidance line is added under the mode-toggle button it renders). The e2e spec exercises the flows shipped in Tasks 11–13 (enrollment UI, challenge, backup-code path, post-2FA destination).
- Produces: no new interface.

Steps:

- [ ] **Step 1: add the recovery guidance line**

In `apps/web/components/two-factor-challenge.tsx`, directly after the mode-toggle `</button>` (the "Use a backup code" / "Use an authenticator code" button) and before the closing `</>`, add:

```tsx
      <p className="portal-meta">
        Lost access to your authenticator? Contact ops@parkwise.eu.
      </p>
```

- [ ] **Step 2: write the Playwright spec**

The `e2e/` harness exists (`journey.spec.ts`, `smoke.spec.ts`), so per the spec this is a Playwright spec, gated on live-stack env vars exactly like `journey.spec.ts`. Create `apps/web/e2e/two-factor.spec.ts`:

```ts
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
 * (already in the tree via better-auth — no new dependency).
 */
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import postgres from "postgres";

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
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
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
    });

    let secret = "";
    let backupCode = "";

    const first = await browser.newContext().then((ctx) => ctx.newPage());
    try {
      await test.step("password sign-in, then enroll at /account/security", async () => {
        await fillSignIn(first, email, password);
        await first.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
          timeout: ACTION_TIMEOUT
        });

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
        const code = await createOTP(secret).totp();
        await first.locator('input[name="code"]').fill(code);
        await first
          .getByRole("button", { name: /Verify and enable two-factor/ })
          .click();
        await first.waitForURL(/\/portal/, { timeout: ACTION_TIMEOUT });
      });
    } finally {
      await first.context().close();
    }

    const second = await browser.newContext().then((ctx) => ctx.newPage());
    try {
      await test.step("fresh sign-in is challenged and passes with an authenticator code", async () => {
        await fillSignIn(second, email, password);
        await second.waitForURL(/\/two-factor/, { timeout: ACTION_TIMEOUT });
        await expect(
          second.getByText(/ops@parkwise\.eu/)
        ).toBeVisible();

        const code = await createOTP(secret).totp();
        await second.locator('input[name="code"]').fill(code);
        await second.getByRole("button", { name: "Verify and sign in" }).click();
        await second.waitForURL(/\/portal/, { timeout: ACTION_TIMEOUT });
      });
    } finally {
      await second.context().close();
    }

    const third = await browser.newContext().then((ctx) => ctx.newPage());
    try {
      await test.step("backup-code challenge signs in and consumes the code", async () => {
        await fillSignIn(third, email, password);
        await third.waitForURL(/\/two-factor/, { timeout: ACTION_TIMEOUT });
        await third.getByRole("button", { name: "Use a backup code" }).click();
        await third.locator('input[name="code"]').fill(backupCode);
        await third.getByRole("button", { name: "Verify and sign in" }).click();
        await third.waitForURL(/\/portal/, { timeout: ACTION_TIMEOUT });
      });
    } finally {
      await third.context().close();
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
});
```

- [ ] **Step 3: run the spec (gated)**

Without a live stack:

```bash
npm run test:e2e -- two-factor.spec.ts
```

Expected: 1 skipped ("live stack not configured") — proves the spec parses and the gate works.

With a live stack (`E2E_BASE_URL`, `PLAYWRIGHT_BASE_URL`, `E2E_DATABASE_URL`, `E2E_2FA_PASSWORD` set): all three steps pass. Note: the sign-in in step 2/3 asserts the challenge page; with a 2FA-enrolled account the `twoFactorClient` plugin full-reloads to `/two-factor`.

- [ ] **Step 4: verify and commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: typecheck clean, unit suite green, build succeeds.

```bash
git add apps/web/components/two-factor-challenge.tsx apps/web/e2e/two-factor.spec.ts
git commit -m "test(2fa): recovery guidance copy and enroll/challenge/backup-code e2e spec"
```

---

## Final verification (after Task 15)

From `apps/web` (with the nvm PATH export):

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

All must pass. The Playwright spec is live-stack-gated and skips in CI environments without `E2E_BASE_URL`.

---

# Plan part — Area 1: Content & legal (Tasks 16–18)

Spec: `docs/superpowers/specs/2026-07-23-assisted-kyc-and-flow-fixes-design.md`, "Area 1: Content & legal" (findings 1–8).
Scope: `apps/web`. Run all commands from `apps/web` with `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` first.

Covers findings: 1 (legal metadata), 2 (legal versioning) → Task 16; 3 (fee copy alignment), 4 (complaints escalation) → Task 17; 5 (guide cross-linking), 6 (Article JSON-LD), 7 (guides index risk line), 8 (copy defects) → Task 18.

## Notes verified against the real code (read before executing)

- **vitest needs one config line to render server components.** Tests here run in `environment: "node"` and no existing test renders React. `renderToStaticMarkup` on the app's pages fails with `ReferenceError: React is not defined` until `esbuild: { jsx: "automatic" }` is added to `vitest.config.ts` (verified: with the line, legal and guide pages render and assert fine). Task 16 Step 1 makes this change.
- **Async server components cannot be render-tested.** `JsonLd` (`components/json-ld.tsx`) is `async` and calls `headers()`; `renderToStaticMarkup` on a tree containing it throws. So Article JSON-LD is tested through a pure builder function (`lib/guides/article-jsonld.ts`), and guide pages are not render-tested after Task 18 adds `<JsonLd>` to them. Importing such a page module (e.g. to assert its `metadata` export) works fine — verified with `app/page.tsx`.
- **`app/legal/complaints/page.tsx` already has a `metadata` export**; `risk`, `terms`, `privacy`, `cookies` do not. Task 16 also rewires complaints' metadata through the new constants file so all five legal pages share one source (finding 2 says "per legal page").
- **Review-date placement varies across guide pages**: five pages show `N min read · Last reviewed 19 Jul 2026` in the hero (`field-hint stack-3`); `how-hub-income-is-stacked` and `european-parking-and-mobility-2026` show `Last reviewed 2026-07-19.` only in the `guide-footer` paragraph. Task 18 keeps each page's existing placement but renders every date from the single catalog field (ISO format everywhere).
- The qualified Terms wording being aligned to (`app/legal/terms/page.tsx:48-50`): "Unless separately disclosed in writing, Parkwise does not charge a platform fee on the public catalogue surfaces. Any future fees will be stated before they apply."
- **Effective dates in `LEGAL_META` are set to `2026-07-23`** (design-approval date) as placeholders — confirm with the team before merge; they live in exactly one file so this is a one-line-per-page change.
- **Task dependency**: Task 17 edits the body of `app/guides/how-fees-affect-returns/page.tsx`; Task 18's edit of the same page assumes Task 17 has landed.

---

### Task 16: Legal page metadata + single-source effective dates

**Files:**
- Create: `apps/web/lib/copy/legal-meta.ts`
- Create: `apps/web/tests/legal-metadata.test.tsx`
- Modify: `apps/web/vitest.config.ts` (add `esbuild: { jsx: "automatic" }` — enables rendering server components in tests)
- Modify: `apps/web/app/legal/risk/page.tsx`
- Modify: `apps/web/app/legal/terms/page.tsx`
- Modify: `apps/web/app/legal/privacy/page.tsx`
- Modify: `apps/web/app/legal/cookies/page.tsx`
- Modify: `apps/web/app/legal/complaints/page.tsx` (rewire existing metadata through `LEGAL_META`, add date line)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `LEGAL_META: Record<"risk" | "terms" | "privacy" | "cookies" | "complaints", { title: string; description: string; effective: string }>` (as const) — from `lib/copy/legal-meta.ts`
  - `LegalPageId = keyof typeof LEGAL_META`

- [ ] **Step 1: Enable the automatic JSX transform for vitest**

  Rendering server components in tests currently fails with `ReferenceError: React is not defined` (esbuild defaults to the classic JSX runtime). In `apps/web/vitest.config.ts`, change:

  ```ts
  export default defineConfig({
    test: {
  ```

  to:

  ```ts
  export default defineConfig({
    esbuild: { jsx: "automatic" },
    test: {
  ```

  Run: `npx vitest run` — expect the whole existing suite to still pass (the option only changes JSX transform; no existing test uses JSX).

- [ ] **Step 2: Write the failing test**

  Create `apps/web/tests/legal-metadata.test.tsx`:

  ```tsx
  import { describe, expect, it } from "vitest";
  import { createElement } from "react";
  import { renderToStaticMarkup } from "react-dom/server";
  import { LEGAL_META } from "@/lib/copy/legal-meta";
  import RiskPage, { metadata as riskMetadata } from "@/app/legal/risk/page";
  import TermsPage, { metadata as termsMetadata } from "@/app/legal/terms/page";
  import PrivacyPage, { metadata as privacyMetadata } from "@/app/legal/privacy/page";
  import CookiesPage, { metadata as cookiesMetadata } from "@/app/legal/cookies/page";
  import ComplaintsPage, { metadata as complaintsMetadata } from "@/app/legal/complaints/page";

  describe("legal page metadata", () => {
    it("risk page exports neutral metadata sourced from LEGAL_META", () => {
      expect(riskMetadata).toEqual({
        title: LEGAL_META.risk.title,
        description: LEGAL_META.risk.description
      });
    });

    it("terms page exports neutral metadata sourced from LEGAL_META", () => {
      expect(termsMetadata).toEqual({
        title: LEGAL_META.terms.title,
        description: LEGAL_META.terms.description
      });
    });

    it("privacy page exports neutral metadata sourced from LEGAL_META", () => {
      expect(privacyMetadata).toEqual({
        title: LEGAL_META.privacy.title,
        description: LEGAL_META.privacy.description
      });
    });

    it("cookies page exports neutral metadata sourced from LEGAL_META", () => {
      expect(cookiesMetadata).toEqual({
        title: LEGAL_META.cookies.title,
        description: LEGAL_META.cookies.description
      });
    });

    it("complaints page exports metadata sourced from LEGAL_META", () => {
      expect(complaintsMetadata).toEqual({
        title: LEGAL_META.complaints.title,
        description: LEGAL_META.complaints.description
      });
    });

    it("every legal page renders its effective date from LEGAL_META", () => {
      const pages = {
        risk: RiskPage,
        terms: TermsPage,
        privacy: PrivacyPage,
        cookies: CookiesPage,
        complaints: ComplaintsPage
      } as const;
      for (const [id, Page] of Object.entries(pages)) {
        const html = renderToStaticMarkup(createElement(Page));
        expect(html, id).toContain(`Last updated ${LEGAL_META[id as keyof typeof LEGAL_META].effective}`);
      }
    });

    it("effective dates are ISO calendar dates", () => {
      for (const meta of Object.values(LEGAL_META)) {
        expect(meta.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });
  ```

  Run: `npx vitest run tests/legal-metadata.test.tsx` — expect FAIL (module `@/lib/copy/legal-meta` does not exist).

- [ ] **Step 3: Create `lib/copy/legal-meta.ts`**

  ```ts
  /**
   * Single source of truth for legal-page metadata and version stamps.
   * `effective` is the "Last updated" date rendered on each page (ISO format).
   * NOTE: 2026-07-23 dates are placeholders from the design date — confirm
   * the real effective dates before merge.
   */
  export const LEGAL_META = {
    risk: {
      title: "Risk disclosure",
      description:
        "What can go wrong with parking investments on Parkwise, in plain language. Capital at risk.",
      effective: "2026-07-23"
    },
    terms: {
      title: "Platform terms",
      description: "The rules for using Parkwise as an investor.",
      effective: "2026-07-23"
    },
    privacy: {
      title: "Privacy notice",
      description: "How Parkwise processes personal data under GDPR principles.",
      effective: "2026-07-23"
    },
    cookies: {
      title: "Cookie notice",
      description: "Which cookies and storage Parkwise uses, and why.",
      effective: "2026-07-23"
    },
    complaints: {
      title: "Complaints",
      description:
        "How to raise a complaint about the Parkwise investor platform, and how we aim to respond.",
      effective: "2026-07-23"
    }
  } as const;

  export type LegalPageId = keyof typeof LEGAL_META;
  ```

- [ ] **Step 4: Wire the four pages without metadata**

  `app/legal/risk/page.tsx` — add at the top (before the existing imports is fine; keep import style):

  ```ts
  import type { Metadata } from "next";
  import { LEGAL_META } from "@/lib/copy/legal-meta";

  export const metadata: Metadata = {
    title: LEGAL_META.risk.title,
    description: LEGAL_META.risk.description
  };
  ```

  and inside the hero, change:

  ```tsx
          <p className="lead">
            Capital is at risk. Read this before you apply or invest.
          </p>
  ```

  to:

  ```tsx
          <p className="lead">
            Capital is at risk. Read this before you apply or invest.
          </p>
          <p className="field-hint stack-3">Last updated {LEGAL_META.risk.effective}.</p>
  ```

  `app/legal/terms/page.tsx` — same additions with `LEGAL_META.terms`; change:

  ```tsx
          <p className="lead">
            The rules for using Parkwise as an investor.
          </p>
  ```

  to:

  ```tsx
          <p className="lead">
            The rules for using Parkwise as an investor.
          </p>
          <p className="field-hint stack-3">Last updated {LEGAL_META.terms.effective}.</p>
  ```

  `app/legal/privacy/page.tsx` — same additions with `LEGAL_META.privacy`; after the existing `<p className="lead">…</p>` block add:

  ```tsx
          <p className="field-hint stack-3">Last updated {LEGAL_META.privacy.effective}.</p>
  ```

  `app/legal/cookies/page.tsx` — same additions with `LEGAL_META.cookies`; after the existing `<p className="lead">…</p>` block add:

  ```tsx
          <p className="field-hint stack-3">Last updated {LEGAL_META.cookies.effective}.</p>
  ```

- [ ] **Step 5: Rewire complaints metadata and add its date line**

  `app/legal/complaints/page.tsx` — change:

  ```ts
  import type { Metadata } from "next";

  export const metadata: Metadata = {
    title: "Complaints",
    description:
      "How to raise a complaint about the Parkwise investor platform, and how we aim to respond."
  };
  ```

  to:

  ```ts
  import type { Metadata } from "next";
  import { LEGAL_META } from "@/lib/copy/legal-meta";

  export const metadata: Metadata = {
    title: LEGAL_META.complaints.title,
    description: LEGAL_META.complaints.description
  };
  ```

  and after the hero `<p className="lead">…</p>` add:

  ```tsx
          <p className="field-hint stack-3">Last updated {LEGAL_META.complaints.effective}.</p>
  ```

- [ ] **Step 6: Run tests — expect pass**

  Run: `npx vitest run tests/legal-metadata.test.tsx` — all 7 tests pass. Then `npx tsc --noEmit` — clean.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/vitest.config.ts apps/web/lib/copy/legal-meta.ts apps/web/tests/legal-metadata.test.tsx apps/web/app/legal/risk/page.tsx apps/web/app/legal/terms/page.tsx apps/web/app/legal/privacy/page.tsx apps/web/app/legal/cookies/page.tsx apps/web/app/legal/complaints/page.tsx
  git commit -m "Add legal page metadata and single-source effective dates"
  ```

---

### Task 17: Align "no platform fee" copy with Terms + complaints escalation route

**Files:**
- Create: `apps/web/tests/fee-copy.test.tsx`
- Modify: `apps/web/lib/copy/consumer.ts` (add `NO_PLATFORM_FEE_LINE`)
- Modify: `apps/web/app/fees/page.tsx`
- Modify: `apps/web/app/guides/how-fees-affect-returns/page.tsx`
- Modify: `apps/web/app/legal/complaints/page.tsx` (add escalation sentence; assumes Task 16's version as base)

**Interfaces:**
- Consumes: `LEGAL_META` from Task 16 (complaints page already imports it; no interface change)
- Produces: `NO_PLATFORM_FEE_LINE: string` from `lib/copy/consumer.ts` — the single qualified fee line used by both fee surfaces (Task 18 re-renders this page but does not change the constant)

- [ ] **Step 1: Write the failing test**

  Create `apps/web/tests/fee-copy.test.tsx`:

  ```tsx
  import { describe, expect, it } from "vitest";
  import { createElement } from "react";
  import { renderToStaticMarkup } from "react-dom/server";
  import { NO_PLATFORM_FEE_LINE } from "@/lib/copy/consumer";
  import FeesPage from "@/app/fees/page";
  import FeesGuidePage from "@/app/guides/how-fees-affect-returns/page";
  import ComplaintsPage from "@/app/legal/complaints/page";

  describe("no-platform-fee copy", () => {
    it("is qualified (today + opportunity-level costs), matching the Terms wording", () => {
      expect(NO_PLATFORM_FEE_LINE).toContain("does not charge a platform fee today");
      expect(NO_PLATFORM_FEE_LINE).toContain("opportunity documents");
    });

    it("fees page renders the shared qualified line", () => {
      const html = renderToStaticMarkup(createElement(FeesPage));
      expect(html).toContain(NO_PLATFORM_FEE_LINE);
    });

    it("how-fees-affect-returns guide renders the shared qualified line", () => {
      const html = renderToStaticMarkup(createElement(FeesGuidePage));
      expect(html).toContain(NO_PLATFORM_FEE_LINE);
    });

    it("complaints page names why statutory escalation does not apply", () => {
      const html = renderToStaticMarkup(createElement(ComplaintsPage));
      expect(html).toContain("do not cover complaints about this platform");
    });
  });
  ```

  (The constant deliberately avoids apostrophes so `renderToStaticMarkup` HTML-escaping cannot break the assertions.)

  Run: `npx vitest run tests/fee-copy.test.tsx` — expect FAIL (`NO_PLATFORM_FEE_LINE` is not exported).

- [ ] **Step 2: Add the shared line to `lib/copy/consumer.ts`**

  Append after `RISK_LINE_SHORT`:

  ```ts
  /**
   * Qualified "no platform fee" line — mirrors the Terms wording ("Unless
   * separately disclosed in writing, Parkwise does not charge a platform fee…")
   * for marketing surfaces. Keep free of apostrophes (asserted in rendered HTML).
   */
  export const NO_PLATFORM_FEE_LINE =
    "Parkwise does not charge a platform fee today. Any costs specific to an opportunity are set out in the opportunity documents before you invest.";
  ```

- [ ] **Step 3: Apply it in `app/fees/page.tsx`**

  Change the import:

  ```ts
  import { RISK_LINE } from "@/lib/copy/consumer";
  ```

  to:

  ```ts
  import { NO_PLATFORM_FEE_LINE, RISK_LINE } from "@/lib/copy/consumer";
  ```

  Change the hero lead:

  ```tsx
          <p className="lead">
            Parkwise does not charge a platform fee. Where an opportunity carries its own costs,
            they are set out in the opportunity documents before you invest.
          </p>
  ```

  to:

  ```tsx
          <p className="lead">{NO_PLATFORM_FEE_LINE}</p>
  ```

- [ ] **Step 4: Apply it in `app/guides/how-fees-affect-returns/page.tsx`**

  Change the import:

  ```ts
  import { RISK_LINE } from "@/lib/copy/consumer";
  ```

  to:

  ```ts
  import { NO_PLATFORM_FEE_LINE, RISK_LINE } from "@/lib/copy/consumer";
  ```

  Change the "Where fees appear" paragraph:

  ```tsx
          <p>
            Parkwise does not charge a platform fee. Where an opportunity carries structuring or
            administration fees, they are described in the opportunity documents before you confirm
            an investment. Where a figure is presented net of fees, the page says so.
          </p>
  ```

  to:

  ```tsx
          <p>
            {NO_PLATFORM_FEE_LINE} Where an opportunity carries structuring or administration fees,
            they are described in the opportunity documents before you confirm an investment. Where
            a figure is presented net of fees, the page says so.
          </p>
  ```

- [ ] **Step 5: Add the escalation-route sentence to `app/legal/complaints/page.tsx`**

  After the existing final paragraph ("If you remain dissatisfied, you may escalate through any statutory redress route available to you in your jurisdiction. This page does not limit mandatory consumer or investor protections."), add:

  ```tsx
          <p>
            Parkwise is not a regulated investment firm, so statutory financial-services ombudsman
            routes (such as the FSPO in Ireland) do not cover complaints about this platform;
            general consumer-protection and court routes in your jurisdiction remain available.
          </p>
  ```

- [ ] **Step 6: Run tests — expect pass**

  Run: `npx vitest run tests/fee-copy.test.tsx` — all 4 tests pass. Then `npx tsc --noEmit` and `npx vitest run` — clean.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/lib/copy/consumer.ts apps/web/tests/fee-copy.test.tsx apps/web/app/fees/page.tsx apps/web/app/guides/how-fees-affect-returns/page.tsx apps/web/app/legal/complaints/page.tsx
  git commit -m "Align no-platform-fee copy with Terms and add complaints escalation route"
  ```

---

### Task 18: Guides — cross-linking, Article JSON-LD, index risk line, copy defects

**Files:**
- Create: `apps/web/lib/guides/article-jsonld.ts`
- Create: `apps/web/components/guide-chrome.tsx`
- Create: `apps/web/tests/guides-catalog.test.ts`
- Create: `apps/web/tests/guide-article-jsonld.test.ts`
- Create: `apps/web/tests/guide-chrome.test.tsx`
- Modify: `apps/web/lib/guides/catalog.ts` (add `reviewedAt` per guide, `Guide` type, `getGuide`, `relatedGuides`)
- Modify: `apps/web/app/guides/page.tsx` (risk line)
- Modify: `apps/web/app/guides/how-to-read-a-parkwise-opportunity/page.tsx`
- Modify: `apps/web/app/guides/what-monthly-distributions-mean/page.tsx`
- Modify: `apps/web/app/guides/how-hub-income-is-stacked/page.tsx` (also fixes the stray-space metadata typo)
- Modify: `apps/web/app/guides/parking-investment-risks/page.tsx`
- Modify: `apps/web/app/guides/can-you-exit-early/page.tsx`
- Modify: `apps/web/app/guides/how-fees-affect-returns/page.tsx` (assumes Task 17 landed)
- Modify: `apps/web/app/guides/european-parking-and-mobility-2026/page.tsx`

**Interfaces:**
- Consumes: `NO_PLATFORM_FEE_LINE` from Task 17 (already in the fees guide body), `RISK_LINE` from `lib/copy/consumer.ts`, `JsonLd` from `components/json-ld.tsx`
- Produces:
  - `Guide` type and `getGuide(slug: string): Guide | undefined`, `relatedGuides(slug: string, count?: number): Guide[]` from `lib/guides/catalog.ts`; each `Guide` gains `reviewedAt: string` (ISO date)
  - `articleJsonLd(guide: Guide): Record<string, unknown>` from `lib/guides/article-jsonld.ts`
  - `GuideBreadcrumb()` and `RelatedGuides({ slug }: { slug: string })` from `components/guide-chrome.tsx`

- [ ] **Step 1: Write the failing catalog test**

  Create `apps/web/tests/guides-catalog.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import { GUIDES, GUIDE_SLUGS, getGuide, relatedGuides } from "@/lib/guides/catalog";

  describe("guide catalog review dates", () => {
    it("every guide carries an ISO reviewedAt date", () => {
      for (const g of GUIDES) {
        expect(g.reviewedAt, g.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe("getGuide", () => {
    it("finds a guide by slug and returns undefined for unknown slugs", () => {
      expect(getGuide("can-you-exit-early")?.title).toBe("Can you exit early?");
      expect(getGuide("no-such-guide")).toBeUndefined();
    });
  });

  describe("relatedGuides", () => {
    it("excludes the guide itself and returns at most 3 entries", () => {
      const related = relatedGuides("parking-investment-risks");
      expect(related.length).toBeGreaterThanOrEqual(2);
      expect(related.length).toBeLessThanOrEqual(3);
      expect(related.map((g) => g.slug)).not.toContain("parking-investment-risks");
    });

    it("prefers guides from the same category", () => {
      const related = relatedGuides("what-monthly-distributions-mean");
      expect(related[0]?.category).toBe("Understanding returns");
      expect(related[0]?.slug).toBe("how-hub-income-is-stacked");
    });

    it("returns an empty list for an unknown slug", () => {
      expect(relatedGuides("no-such-guide")).toEqual([]);
    });

    it("only returns slugs that exist in the catalog", () => {
      for (const slug of GUIDE_SLUGS) {
        for (const g of relatedGuides(slug)) {
          expect(GUIDE_SLUGS).toContain(g.slug);
        }
      }
    });
  });
  ```

  Run: `npx vitest run tests/guides-catalog.test.ts` — expect FAIL (`getGuide`/`relatedGuides` not exported; `reviewedAt` missing).

- [ ] **Step 2: Extend `lib/guides/catalog.ts`**

  Add `reviewedAt` to the satisfies type — change:

  ```ts
  ] as const satisfies ReadonlyArray<{
    slug: string;
    title: string;
    dek: string;
    category: GuideCategory;
    minutes: number;
  }>;
  ```

  to:

  ```ts
  ] as const satisfies ReadonlyArray<{
    slug: string;
    title: string;
    dek: string;
    category: GuideCategory;
    minutes: number;
    reviewedAt: string;
  }>;
  ```

  Add `reviewedAt: "2026-07-19"` to every one of the seven entries (after the `minutes` line), e.g.:

  ```ts
  {
    slug: "how-to-read-a-parkwise-opportunity",
    title: "How to read a Parkwise opportunity",
    dek: "Labels, options, target returns, and what to check before you invest.",
    category: "Getting started",
    minutes: 4,
    reviewedAt: "2026-07-19"
  },
  ```

  Append at the end of the file:

  ```ts
  export type Guide = (typeof GUIDES)[number];

  export function getGuide(slug: string): Guide | undefined {
    return GUIDES.find((g) => g.slug === slug);
  }

  /** 2–3 related guides for cross-linking, same category first. */
  export function relatedGuides(slug: string, count = 3): Guide[] {
    const self = getGuide(slug);
    if (!self) return [];
    const rest = GUIDES.filter((g) => g.slug !== slug);
    const sameCategory = rest.filter((g) => g.category === self.category);
    const others = rest.filter((g) => g.category !== self.category);
    return [...sameCategory, ...others].slice(0, count);
  }
  ```

  Run: `npx vitest run tests/guides-catalog.test.ts` — expect pass.

- [ ] **Step 3: Write the failing JSON-LD test, then the builder**

  Create `apps/web/tests/guide-article-jsonld.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import { articleJsonLd } from "@/lib/guides/article-jsonld";
  import { getGuide } from "@/lib/guides/catalog";

  describe("articleJsonLd", () => {
    it("builds an Article node with headline, dateModified and Organization author", () => {
      const guide = getGuide("can-you-exit-early");
      if (!guide) throw new Error("guide missing");
      const ld = articleJsonLd(guide);
      expect(ld["@context"]).toBe("https://schema.org");
      expect(ld["@type"]).toBe("Article");
      expect(ld.headline).toBe("Can you exit early?");
      expect(ld.description).toBe(guide.dek);
      expect(ld.dateModified).toBe("2026-07-19");
      expect(ld.author).toEqual({ "@type": "Organization", name: "Parkwise" });
    });
  });
  ```

  Run: `npx vitest run tests/guide-article-jsonld.test.ts` — expect FAIL (module missing).

  Create `apps/web/lib/guides/article-jsonld.ts`:

  ```ts
  import type { Guide } from "./catalog";

  /**
   * Article JSON-LD for guide pages. Pure builder (no next/headers) so it stays
   * unit-testable; pages render it via the async <JsonLd> component.
   */
  export function articleJsonLd(guide: Guide) {
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.title,
      description: guide.dek,
      dateModified: guide.reviewedAt,
      author: { "@type": "Organization", name: "Parkwise" }
    };
  }
  ```

  Run: `npx vitest run tests/guide-article-jsonld.test.ts` — expect pass.

- [ ] **Step 4: Write the failing chrome/metadata/index tests, then implement**

  Create `apps/web/tests/guide-chrome.test.tsx`:

  ```tsx
  import { describe, expect, it } from "vitest";
  import { createElement } from "react";
  import { renderToStaticMarkup } from "react-dom/server";
  import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
  import { RISK_LINE } from "@/lib/copy/consumer";
  import GuidesIndexPage from "@/app/guides/page";
  import { metadata as hubIncomeMetadata } from "@/app/guides/how-hub-income-is-stacked/page";

  describe("GuideBreadcrumb", () => {
    it("links back to all guides", () => {
      const html = renderToStaticMarkup(createElement(GuideBreadcrumb));
      expect(html).toContain('href="/guides"');
      expect(html).toContain("All guides");
    });
  });

  describe("RelatedGuides", () => {
    it("renders 2–3 related guide links and excludes the current guide", () => {
      const html = renderToStaticMarkup(
        createElement(RelatedGuides, { slug: "parking-investment-risks" })
      );
      expect(html).toContain("Related guides");
      expect(html).toContain('href="/guides/');
      expect(html).not.toContain('href="/guides/parking-investment-risks"');
    });
  });

  describe("guides index", () => {
    it("shows the standard risk line with a link to the risk disclosure", () => {
      const html = renderToStaticMarkup(createElement(GuidesIndexPage));
      expect(html).toContain(RISK_LINE);
      expect(html).toContain('href="/legal/risk"');
    });
  });

  describe("how-hub-income-is-stacked metadata", () => {
    it("has no stray space before the full stop", () => {
      expect(hubIncomeMetadata?.description).toBe(
        "Parking, EV charging, and other income streams on Parkwise opportunities. Capital at risk."
      );
    });
  });
  ```

  Run: `npx vitest run tests/guide-chrome.test.tsx` — expect FAIL (`@/components/guide-chrome` missing; index has no risk line; description has `opportunities . Capital`).

  Create `apps/web/components/guide-chrome.tsx`:

  ```tsx
  import Link from "next/link";
  import { relatedGuides } from "@/lib/guides/catalog";

  /** Breadcrumb back to the guides index, rendered at the top of each article hero. */
  export function GuideBreadcrumb() {
    return (
      <p className="field-hint">
        <Link href="/guides">← All guides</Link>
      </p>
    );
  }

  /** "Related guides" cross-link block for the end of each article. */
  export function RelatedGuides({ slug }: { slug: string }) {
    const related = relatedGuides(slug);
    if (related.length === 0) return null;
    return (
      <nav aria-label="Related guides">
        <h2 className="h3">Related guides</h2>
        <ul>
          {related.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`}>{g.title}</Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  ```

  Fix the stray space in `app/guides/how-hub-income-is-stacked/page.tsx` metadata — change:

  ```ts
  export const metadata: Metadata = {
    title: "How parking investments generate income",
    description:
      "Parking, EV charging, and other income streams on Parkwise opportunities . Capital at risk."
  };
  ```

  to:

  ```ts
  export const metadata: Metadata = {
    title: "How parking investments generate income",
    description:
      "Parking, EV charging, and other income streams on Parkwise opportunities. Capital at risk."
  };
  ```

  Add the risk line to `app/guides/page.tsx` — change the import block:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { GUIDE_CATEGORIES, GUIDES } from "@/lib/guides/catalog";
  ```

  to:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { GUIDE_CATEGORIES, GUIDES } from "@/lib/guides/catalog";
  import { RISK_LINE } from "@/lib/copy/consumer";
  ```

  and change the hero:

  ```tsx
          <p className="lead">
            Plain-language guides on returns, risks, fees, and how parking investments work.
          </p>
  ```

  to:

  ```tsx
          <p className="lead">
            Plain-language guides on returns, risks, fees, and how parking investments work.
          </p>
          <p className="field-hint stack-3">
            {RISK_LINE} <Link href="/legal/risk">Read the risk disclosure</Link>.
          </p>
  ```

  Run: `npx vitest run tests/guide-chrome.test.tsx` — expect pass. Then `npx vitest run` — whole suite green.

- [ ] **Step 5: Commit the helpers**

  ```bash
  git add apps/web/lib/guides/catalog.ts apps/web/lib/guides/article-jsonld.ts apps/web/components/guide-chrome.tsx apps/web/tests/guides-catalog.test.ts apps/web/tests/guide-article-jsonld.test.ts apps/web/tests/guide-chrome.test.tsx apps/web/app/guides/page.tsx apps/web/app/guides/how-hub-income-is-stacked/page.tsx
  git commit -m "Add guide catalog review dates, related guides, Article JSON-LD builder, and guides index risk line"
  ```

- [ ] **Step 6: Wire all seven guide pages (exact edits)**

  Every page gets the same four changes: (a) new imports + `GUIDE` constant, (b) `<JsonLd>` as first child of `<main>`, (c) `<GuideBreadcrumb />` above the kicker in the hero, (d) review date rendered from `GUIDE.reviewedAt`, (e) `<RelatedGuides>` after the `guide-footer` paragraph. Per page:

  **`app/guides/how-to-read-a-parkwise-opportunity/page.tsx`** — change imports:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { RISK_LINE } from "@/lib/copy/consumer";
  ```

  to:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { JsonLd } from "@/components/json-ld";
  import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
  import { articleJsonLd } from "@/lib/guides/article-jsonld";
  import { getGuide } from "@/lib/guides/catalog";
  import { RISK_LINE } from "@/lib/copy/consumer";

  const GUIDE = getGuide("how-to-read-a-parkwise-opportunity")!;
  ```

  Change `<main>` and hero top:

  ```tsx
    <main>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Getting started</span>
  ```

  to:

  ```tsx
    <main>
      <JsonLd data={articleJsonLd(GUIDE)} />
      <section className="page-hero">
        <div className="container">
          <GuideBreadcrumb />
          <span className="kicker">Getting started</span>
  ```

  Change the hero hint:

  ```tsx
          <p className="field-hint stack-3">
            4 min read · Last reviewed 19 Jul 2026
          </p>
  ```

  to:

  ```tsx
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {GUIDE.reviewedAt}
          </p>
  ```

  Change the footer:

  ```tsx
          <p className="field-hint guide-footer">{RISK_LINE}</p>
        </div>
      </article>
  ```

  to:

  ```tsx
          <p className="field-hint guide-footer">{RISK_LINE}</p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
  ```

  **`app/guides/what-monthly-distributions-mean/page.tsx`** — identical four edits with `const GUIDE = getGuide("what-monthly-distributions-mean")!;`, hero hint before:

  ```tsx
          <p className="field-hint stack-3">
            5 min read · Last reviewed 19 Jul 2026
          </p>
  ```

  after:

  ```tsx
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {GUIDE.reviewedAt}
          </p>
  ```

  and the same `<JsonLd>`, `<GuideBreadcrumb />` (above `<span className="kicker">Understanding returns</span>`), and `<RelatedGuides slug={GUIDE.slug} />` after the footer paragraph.

  **`app/guides/how-hub-income-is-stacked/page.tsx`** — same imports block with `const GUIDE = getGuide("how-hub-income-is-stacked")!;`. This page has no `RISK_LINE` import and no hero hint; its imports are just `Link` and `Metadata`. Change `<main>`/hero top:

  ```tsx
    <main>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Guides · Understanding returns</span>
  ```

  to:

  ```tsx
    <main>
      <JsonLd data={articleJsonLd(GUIDE)} />
      <section className="page-hero">
        <div className="container">
          <GuideBreadcrumb />
          <span className="kicker">Guides · Understanding returns</span>
  ```

  Change the footer:

  ```tsx
          <p className="field-hint guide-footer">
            Figures on opportunity pages are targets, not guarantees. Capital at risk. Last reviewed
            2026-07-19.
          </p>
        </div>
      </article>
  ```

  to:

  ```tsx
          <p className="field-hint guide-footer">
            Figures on opportunity pages are targets, not guarantees. Capital at risk. Last reviewed{" "}
            {GUIDE.reviewedAt}.
          </p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
  ```

  **`app/guides/parking-investment-risks/page.tsx`** — identical four edits with `const GUIDE = getGuide("parking-investment-risks")!;`, hero hint before:

  ```tsx
          <p className="field-hint stack-3">
            6 min read · Last reviewed 19 Jul 2026
          </p>
  ```

  after:

  ```tsx
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {GUIDE.reviewedAt}
          </p>
  ```

  kicker is `<span className="kicker">Risks</span>`; footer is `<p className="field-hint guide-footer">{RISK_LINE}</p>`.

  **`app/guides/can-you-exit-early/page.tsx`** — identical four edits with `const GUIDE = getGuide("can-you-exit-early")!;`, hero hint before:

  ```tsx
          <p className="field-hint stack-3">
            4 min read · Last reviewed 19 Jul 2026
          </p>
  ```

  after:

  ```tsx
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {GUIDE.reviewedAt}
          </p>
  ```

  kicker is `<span className="kicker">Investment terms</span>`.

  **`app/guides/how-fees-affect-returns/page.tsx`** — imports after Task 17 are `Link`, `Metadata`, `NO_PLATFORM_FEE_LINE, RISK_LINE`. Change to:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { JsonLd } from "@/components/json-ld";
  import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
  import { articleJsonLd } from "@/lib/guides/article-jsonld";
  import { getGuide } from "@/lib/guides/catalog";
  import { NO_PLATFORM_FEE_LINE, RISK_LINE } from "@/lib/copy/consumer";

  const GUIDE = getGuide("how-fees-affect-returns")!;
  ```

  Same `<JsonLd>` + `<GuideBreadcrumb />` (above `<span className="kicker">Fees</span>`), hero hint before:

  ```tsx
          <p className="field-hint stack-3">
            4 min read · Last reviewed 19 Jul 2026
          </p>
  ```

  after:

  ```tsx
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {GUIDE.reviewedAt}
          </p>
  ```

  and `<RelatedGuides slug={GUIDE.slug} />` after `<p className="field-hint guide-footer">{RISK_LINE}</p>`.

  **`app/guides/european-parking-and-mobility-2026/page.tsx`** — imports are `Link`, `Metadata`, `Cite`. Change to:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { Cite } from "@/components/cite";
  import { JsonLd } from "@/components/json-ld";
  import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
  import { articleJsonLd } from "@/lib/guides/article-jsonld";
  import { getGuide } from "@/lib/guides/catalog";

  const GUIDE = getGuide("european-parking-and-mobility-2026")!;
  ```

  Same `<JsonLd>` + `<GuideBreadcrumb />` (above `<span className="kicker">Guides · Parking and mobility</span>`). Change the footer:

  ```tsx
          <p className="field-hint guide-footer">
            Figures are public statistics or cited research, not forecasts of Parkwise returns.
            Capital at risk. See Risk disclosure. Last reviewed 2026-07-19.
          </p>
        </div>
      </article>
  ```

  to:

  ```tsx
          <p className="field-hint guide-footer">
            Figures are public statistics or cited research, not forecasts of Parkwise returns.
            Capital at risk. See Risk disclosure. Last reviewed {GUIDE.reviewedAt}.
          </p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
  ```

- [ ] **Step 7: Verify**

  Run from `apps/web`: `npx tsc --noEmit` — clean; `npx vitest run` — whole suite green; `npm run build` — succeeds (catches any server-component/import mistake in the seven pages, which unit tests cannot render now that they contain the async `<JsonLd>`).

- [ ] **Step 8: Commit**

  ```bash
  git add apps/web/app/guides/
  git commit -m "Wire guide pages: breadcrumb, related guides, Article JSON-LD, catalog-sourced review dates"
  ```

---

# Area 2 — Opportunity catalogue (Tasks 19–24)

Spec: `docs/superpowers/specs/2026-07-23-assisted-kyc-and-flow-fixes-design.md`, "Area 2: Opportunity catalogue" (findings 1–9).

Scope notes discovered while reading the code (relevant for assembly):

- The catalogue component lives at `apps/web/app/opportunities/opportunities-catalogue.tsx` (a client component colocated with the page), **not** `components/opportunities-catalogue.tsx` as the assignment assumed. All task steps below use the real path.
- The default sort is already neutral (`parseSort` in the catalogue falls back to `"name_asc"`). Task 24 locks this with a test instead of changing behavior.
- The `recommended` flag is still consumed by `findOption` (`lib/assets/investment-options.ts:192`), `resolveMinTicket` (`lib/assets/presentation.ts:131`), and the catalogue sort/filter fallbacks — so per the spec's "internal-only (or dropped if nothing consumes it)" it is **kept in validation** and marked internal-only with a doc comment, not dropped.
- There is no component-render test infrastructure (no `@testing-library` in `apps/web/package.json`; all tests are pure-function vitest). Behavior changes are funneled into pure helpers in `lib/` with real vitest coverage; pure markup/copy edits get exact before/after edits plus `tsc`/`vitest`/`build` verification steps.

Common setup for every command (from the repo root unless noted):

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd /Users/mac/Documents/Park/apps/web
```

---

### Task 19: Replace "Recommended" badge with factual derived labels

Finding 1. The badge at `apps/web/components/opportunity-detail-returns.tsx:66-68` currently renders:

```tsx
{opt.recommended ? (
  <span className="badge badge-soft">Recommended</span>
) : null}
```

Replace it with labels derived from the option data ("Lowest minimum" / "Highest target"), computed by a new pure helper in `lib/assets/investment-options.ts`, and mark the `recommended` flag internal-only.

**Files:**
- Modify: `apps/web/lib/assets/investment-options.ts`
- Modify: `apps/web/components/opportunity-detail-returns.tsx`
- Test: `apps/web/lib/assets/investment-options.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task in this section).
- Produces:
  - `optionDerivedLabels(options: InvestmentOption[]): Map<InvestmentOptionId, OptionDerivedLabel[]>` — used by `components/opportunity-detail-returns.tsx` (this task) and available to later tasks.
  - `type OptionDerivedLabel = "Lowest minimum" | "Highest target"`

- [ ] **Step 1: Write the failing test**

  Append to `apps/web/lib/assets/investment-options.test.ts` (extend the existing import from `@/lib/assets/investment-options` with `optionDerivedLabels` and `type InvestmentOption`):

  ```ts
  describe("optionDerivedLabels", () => {
    const standard: InvestmentOption = {
      id: "standard",
      label: "Standard option",
      recommended: true,
      minTicketEur: 10000,
      yieldPct: 8,
      monthlyIncomeEur: 67,
      annualIncomeEur: 800,
      commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
    };
    const premium: InvestmentOption = {
      id: "premium",
      label: "Premium option",
      recommended: false,
      minTicketEur: 25000,
      yieldPct: 9.5,
      monthlyIncomeEur: 198,
      annualIncomeEur: 2375,
      commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
    };

    it("labels the lowest minimum and the highest target", () => {
      const labels = optionDerivedLabels([standard, premium]);
      expect(labels.get("standard")).toEqual(["Lowest minimum"]);
      expect(labels.get("premium")).toEqual(["Highest target"]);
    });

    it("gives a single option both labels", () => {
      const labels = optionDerivedLabels([standard]);
      expect(labels.get("standard")).toEqual(["Lowest minimum", "Highest target"]);
    });

    it("returns an empty map for no options", () => {
      expect(optionDerivedLabels([]).size).toBe(0);
    });
  });
  ```

- [ ] **Step 2: Run to confirm failure**

  ```bash
  npx vitest run lib/assets/investment-options.test.ts
  ```

  Expected: FAIL — `TypeError: optionDerivedLabels is not a function`.

- [ ] **Step 3: Implement `optionDerivedLabels` and mark `recommended` internal-only**

  In `apps/web/lib/assets/investment-options.ts`, change the `recommended` field doc in the `InvestmentOption` type:

  ```ts
  export type InvestmentOption = {
    id: InvestmentOptionId;
    label: string;
    /**
     * Internal-only selection default. Consumed by `findOption`, the
     * presentation min-ticket fallback, and catalogue sort/filter defaults.
     * Never render as a user-facing "Recommended" claim — display the
     * factual labels from `optionDerivedLabels` instead.
     */
    recommended: boolean;
    minTicketEur: number;
    yieldPct: number;
    monthlyIncomeEur: number;
    annualIncomeEur: number;
    commercialTermIds: CommercialTermId[];
  };
  ```

  (Validation of `recommended` stays exactly as-is — `validateInvestmentOption` still requires the boolean and `validateInvestmentOptions` still requires exactly one recommended option, because the consumers above still need it.)

  Add after `formatYieldBand` (before `findOption`):

  ```ts
  export type OptionDerivedLabel = "Lowest minimum" | "Highest target";

  /**
   * Factual per-option labels derived from the option set — replaces the old
   * editorial "Recommended" badge. Ties resolve to the first option in array
   * order; a single-option set gets both labels.
   */
  export function optionDerivedLabels(
    options: InvestmentOption[]
  ): Map<InvestmentOptionId, OptionDerivedLabel[]> {
    const labels = new Map<InvestmentOptionId, OptionDerivedLabel[]>();
    if (options.length === 0) return labels;

    let lowest = options[0]!;
    let highest = options[0]!;
    for (const opt of options) {
      if (opt.minTicketEur < lowest.minTicketEur) lowest = opt;
      if (opt.yieldPct > highest.yieldPct) highest = opt;
    }
    labels.set(lowest.id, [...(labels.get(lowest.id) ?? []), "Lowest minimum"]);
    labels.set(highest.id, [...(labels.get(highest.id) ?? []), "Highest target"]);
    return labels;
  }
  ```

- [ ] **Step 4: Run to confirm pass**

  ```bash
  npx vitest run lib/assets/investment-options.test.ts
  ```

  Expected: PASS (all existing + 3 new tests).

- [ ] **Step 5: Swap the badge in the detail returns component**

  In `apps/web/components/opportunity-detail-returns.tsx`:

  Change the import:

  ```ts
  import {
    optionAnnualIncome,
    optionDerivedLabels,
    optionMonthlyIncome,
    type InvestmentOption
  } from "@/lib/assets/investment-options";
  ```

  Inside the component, before the `return` (after the `illusMonthly` line), add:

  ```ts
  const derivedLabels = optionDerivedLabels(options);
  ```

  Replace the badge block:

  ```tsx
  {opt.recommended ? (
    <span className="badge badge-soft">Recommended</span>
  ) : null}
  ```

  with:

  ```tsx
  {(derivedLabels.get(opt.id) ?? []).map((label) => (
    <span key={label} className="badge badge-soft">
      {label}
    </span>
  ))}
  ```

- [ ] **Step 6: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  grep -rn "Recommended" components/ app/opportunities/ lib/assets/
  ```

  Expected: tsc clean, all tests pass, and the grep shows no remaining user-facing "Recommended" string (the `recommended` field name in `lib/assets/investment-options.ts` is fine; only the display string must be gone).

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/investment-options.ts apps/web/lib/assets/investment-options.test.ts apps/web/components/opportunity-detail-returns.tsx
  git commit -m "catalogue: replace Recommended badge with derived Lowest minimum / Highest target labels"
  ```

---

### Task 20: "Key terms" summary section on the detail page

Finding 2. New section built from `lib/assets/commercial-terms.ts` labels plus the existing presentation values (`termDisplay`, `paymentFrequencyDisplay`, `minTicketDisplay`). No new documents, no new data — the existing `COMMERCIAL_TERM_LABELS` / `COMMERCIAL_TERM_NOT_MEANING` records are the source for the structure row. Rendered in `components/opportunity-detail-client.tsx` between the operator section and the returns section. `DETAIL_NAV` is left unchanged (no new jump-link; keeps the diff minimal).

**Files:**
- Modify: `apps/web/lib/assets/commercial-terms.ts`
- Create: `apps/web/components/opportunity-detail-key-terms.tsx`
- Modify: `apps/web/components/opportunity-detail-client.tsx`
- Test: `apps/web/lib/assets/commercial-terms.test.ts` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `keyTermsStructureSummary(termIds: CommercialTermId[]): string` (in `lib/assets/commercial-terms.ts`)
  - `OpportunityDetailKeyTerms({ termIds, minTicketDisplay, paymentFrequencyDisplay, termDisplay }: { termIds: CommercialTermId[]; minTicketDisplay: string | null; paymentFrequencyDisplay: string; termDisplay: string }): JSX.Element`

- [ ] **Step 1: Write the failing test**

  Create `apps/web/lib/assets/commercial-terms.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import {
    COMMERCIAL_TERM_IDS,
    COMMERCIAL_TERM_LABELS,
    COMMERCIAL_TERM_NOT_MEANING,
    DEFAULT_COMMERCIAL_TERM_IDS,
    keyTermsStructureSummary
  } from "@/lib/assets/commercial-terms";

  describe("commercial terms catalogue", () => {
    it("has a label and not-meaning line for every term id", () => {
      for (const id of COMMERCIAL_TERM_IDS) {
        expect(COMMERCIAL_TERM_LABELS[id].length).toBeGreaterThan(0);
        expect(COMMERCIAL_TERM_NOT_MEANING[id].length).toBeGreaterThan(0);
      }
    });

    it("joins term labels for the Key terms structure row", () => {
      const summary = keyTermsStructureSummary(DEFAULT_COMMERCIAL_TERM_IDS);
      expect(summary).toBe(
        "Operator lease structure · Target income from operator rent · " +
          "Indexation where stated in the lease · Investor protections in the deal terms · " +
          "Flexible terms where offered"
      );
    });

    it("returns an empty string for no terms", () => {
      expect(keyTermsStructureSummary([])).toBe("");
    });
  });
  ```

- [ ] **Step 2: Run to confirm failure**

  ```bash
  npx vitest run lib/assets/commercial-terms.test.ts
  ```

  Expected: FAIL — `keyTermsStructureSummary` is not exported.

- [ ] **Step 3: Implement the helper**

  In `apps/web/lib/assets/commercial-terms.ts`, append:

  ```ts
  /** Joined "A · B · C" structure summary for the detail-page Key terms block. */
  export function keyTermsStructureSummary(termIds: CommercialTermId[]): string {
    return termIds.map((id) => COMMERCIAL_TERM_LABELS[id]).join(" · ");
  }
  ```

- [ ] **Step 4: Run to confirm pass**

  ```bash
  npx vitest run lib/assets/commercial-terms.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Create the component**

  Create `apps/web/components/opportunity-detail-key-terms.tsx` (`.option-card-metrics` is a standalone class in `app/globals.css:2042`, safe to reuse outside option cards):

  ```tsx
  import {
    keyTermsStructureSummary,
    type CommercialTermId
  } from "@/lib/assets/commercial-terms";

  export function OpportunityDetailKeyTerms({
    termIds,
    minTicketDisplay,
    paymentFrequencyDisplay,
    termDisplay
  }: {
    termIds: CommercialTermId[];
    minTicketDisplay: string | null;
    paymentFrequencyDisplay: string;
    termDisplay: string;
  }) {
    return (
      <section id="key-terms" className="detail-block">
        <h2 className="h3">Key terms</h2>
        <dl className="option-card-metrics">
          <div>
            <dt>Structure</dt>
            <dd>{keyTermsStructureSummary(termIds)}</dd>
          </div>
          <div>
            <dt>Minimum investment</dt>
            <dd>{minTicketDisplay ?? "See opportunity details"}</dd>
          </div>
          <div>
            <dt>Target payments</dt>
            <dd>{paymentFrequencyDisplay}</dd>
          </div>
          <div>
            <dt>Target term and exit</dt>
            <dd>{termDisplay}</dd>
          </div>
          <div>
            <dt>Fees</dt>
            <dd>No platform fee; any opportunity costs are in the deal documents</dd>
          </div>
        </dl>
        <p className="field-hint">
          Summary only — the deal documents have the final word on all terms.
        </p>
      </section>
    );
  }
  ```

- [ ] **Step 6: Wire it into the detail client**

  In `apps/web/components/opportunity-detail-client.tsx`:

  Add the import (with the other detail-section imports):

  ```ts
  import { OpportunityDetailKeyTerms } from "@/components/opportunity-detail-key-terms";
  ```

  Render it immediately before `<OpportunityDetailReturns ...>` (the `termIds` const at line 97-99 and `presentation` already hold everything needed):

  ```tsx
  <OpportunityDetailKeyTerms
    termIds={termIds}
    minTicketDisplay={presentation.minTicketDisplay}
    paymentFrequencyDisplay={presentation.paymentFrequencyDisplay}
    termDisplay={presentation.termDisplay}
  />

  <OpportunityDetailReturns
    options={props.options}
    ...
  ```

- [ ] **Step 7: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  ```

  Expected: clean tsc, all tests pass.

- [ ] **Step 8: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/commercial-terms.ts apps/web/lib/assets/commercial-terms.test.ts apps/web/components/opportunity-detail-key-terms.tsx apps/web/components/opportunity-detail-client.tsx
  git commit -m "catalogue: add Key terms summary section to opportunity detail page"
  ```

---

### Task 21: Illustrator downside rows + assumptions note

Finding 3. The income illustrator in `components/opportunity-detail-returns.tsx` currently shows only the at-target monthly/annual figures. Add two adverse-scenario rows (income at 50% of target, and at zero) derived by a pure helper, and extend the assumptions note with a new copy constant covering gross-of-tax / before-costs / target basis.

**Files:**
- Modify: `apps/web/lib/assets/investment-options.ts`
- Modify: `apps/web/lib/copy/consumer.ts`
- Modify: `apps/web/components/opportunity-detail-returns.tsx`
- Test: `apps/web/lib/assets/investment-options.test.ts`
- Test: `apps/web/lib/copy/consumer.test.ts` (new)

**Interfaces:**
- Consumes: `optionAnnualIncome` / `optionMonthlyIncome` (existing), file already touched by Task 19 (apply after it).
- Produces:
  - `illustratorDownsideRows(annualIncomeEur: number): IllustratorDownsideRow[]`
  - `type IllustratorDownsideRow = { id: "half_of_target" | "no_income"; label: string; monthlyEur: number }`
  - `ILLUSTRATION_ASSUMPTIONS: string` (in `lib/copy/consumer.ts`)

- [ ] **Step 1: Write the failing tests**

  Append to `apps/web/lib/assets/investment-options.test.ts` (add `illustratorDownsideRows` to the import from `@/lib/assets/investment-options`):

  ```ts
  describe("illustratorDownsideRows", () => {
    it("halves the target income and floors at zero", () => {
      const rows = illustratorDownsideRows(optionAnnualIncome(10000, 8)); // 800
      expect(rows).toEqual([
        { id: "half_of_target", label: "If income is half of target", monthlyEur: 33 },
        { id: "no_income", label: "If no income is paid", monthlyEur: 0 }
      ]);
    });

    it("rounds via the same monthly helper as the headline figure", () => {
      const rows = illustratorDownsideRows(optionAnnualIncome(11400, 7.8)); // 889
      expect(rows[0]).toEqual({
        id: "half_of_target",
        label: "If income is half of target",
        monthlyEur: 37
      });
    });
  });
  ```

  Create `apps/web/lib/copy/consumer.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import { ILLUSTRATION_ASSUMPTIONS } from "@/lib/copy/consumer";

  describe("ILLUSTRATION_ASSUMPTIONS", () => {
    it("states the gross-of-tax, before-costs, target basis", () => {
      expect(ILLUSTRATION_ASSUMPTIONS).toContain("gross of tax");
      expect(ILLUSTRATION_ASSUMPTIONS).toContain("before any costs");
      expect(ILLUSTRATION_ASSUMPTIONS.toLowerCase()).toContain("target");
    });
  });
  ```

- [ ] **Step 2: Run to confirm failure**

  ```bash
  npx vitest run lib/assets/investment-options.test.ts lib/copy/consumer.test.ts
  ```

  Expected: FAIL — `illustratorDownsideRows is not a function` and `ILLUSTRATION_ASSUMPTIONS` is `undefined`.

- [ ] **Step 3: Implement the helper and the copy constant**

  In `apps/web/lib/assets/investment-options.ts`, after `optionMonthlyIncome`:

  ```ts
  export type IllustratorDownsideRow = {
    id: "half_of_target" | "no_income";
    label: string;
    monthlyEur: number;
  };

  /**
   * Adverse-scenario rows for the income illustrator: income at 50% of
   * target, and at zero. Derived from the same annual figure as the
   * headline row so the scenarios stay consistent with it.
   */
  export function illustratorDownsideRows(annualIncomeEur: number): IllustratorDownsideRow[] {
    return [
      {
        id: "half_of_target",
        label: "If income is half of target",
        monthlyEur: optionMonthlyIncome(Math.round(annualIncomeEur / 2))
      },
      { id: "no_income", label: "If no income is paid", monthlyEur: 0 }
    ];
  }
  ```

  In `apps/web/lib/copy/consumer.ts`, after `ILLUSTRATION_DISCLAIMER`:

  ```ts
  export const ILLUSTRATION_ASSUMPTIONS =
    "Assumes target income is achieved. Figures are gross of tax and before any costs; the target basis is described in the deal documents.";
  ```

- [ ] **Step 4: Run to confirm pass**

  ```bash
  npx vitest run lib/assets/investment-options.test.ts lib/copy/consumer.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Render the rows and the note in the illustrator**

  In `apps/web/components/opportunity-detail-returns.tsx`:

  Extend the imports:

  ```ts
  import {
    illustratorDownsideRows,
    optionAnnualIncome,
    optionDerivedLabels,
    optionMonthlyIncome,
    type InvestmentOption
  } from "@/lib/assets/investment-options";
  import { ILLUSTRATION_ASSUMPTIONS, ILLUSTRATION_DISCLAIMER } from "@/lib/copy/consumer";
  ```

  Inside `.income-illustrator-results`, after the "Illustrative annual amount" `<div>`, add:

  ```tsx
  {illustratorDownsideRows(illusAnnual).map((row) => (
    <div key={row.id}>
      <label>{row.label}</label>
      <b>{formatEur(row.monthlyEur)} / month</b>
    </div>
  ))}
  ```

  Replace the assumptions paragraph:

  ```tsx
  <p id="illus-assumptions" className="field-hint">
    {ILLUSTRATION_DISCLAIMER}
  </p>
  ```

  with:

  ```tsx
  <p id="illus-assumptions" className="field-hint">
    {ILLUSTRATION_DISCLAIMER} {ILLUSTRATION_ASSUMPTIONS}
  </p>
  ```

- [ ] **Step 6: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  ```

  Expected: clean tsc, all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/investment-options.ts apps/web/lib/assets/investment-options.test.ts apps/web/lib/copy/consumer.ts apps/web/lib/copy/consumer.test.ts apps/web/components/opportunity-detail-returns.tsx
  git commit -m "catalogue: add downside scenarios and assumptions note to income illustrator"
  ```

---

### Task 22: Mobile sticky CTA risk line; drop hidden-amount compact submit

Finding 4. Two markup changes:

1. The mobile sticky bar in `components/opportunity-detail-client.tsx:237-247` shows option + yield + minimum but no risk line. Add `RISK_LINE` (already used in `components/opportunity-detail-summary.tsx:80` with the `.risk-line` class, defined in `app/globals.css:451`).
2. `components/opportunity-detail-cta.tsx` has a `compact` mode that submits with a hidden `amountEur` input (line 142) so the investor never sees or confirms the amount. Remove `compact` entirely: the mobile bar renders the same full form (amount field + note + risk-acknowledgement checkbox) as the sidebar.

These are markup/routing changes with no new logic; the underlying `createInterest` submission path is already covered by `tests/integration/interests.integration.test.ts`. Exact edits + full verification below.

**Files:**
- Modify: `apps/web/components/opportunity-detail-client.tsx`
- Modify: `apps/web/components/opportunity-detail-cta.tsx`

**Interfaces:**
- Consumes: `RISK_LINE` from `lib/copy/consumer.ts` (existing export).
- Produces: `AllocationCta({ cta, assetSlug, selected }: { cta: DetailCtaDecision; assetSlug: string; selected: InvestmentOption | undefined })` — the `compact` prop is removed; both call sites are in this repo and updated here.

- [ ] **Step 1: Add RISK_LINE to the mobile sticky bar**

  In `apps/web/components/opportunity-detail-client.tsx`, add the import:

  ```ts
  import { RISK_LINE } from "@/lib/copy/consumer";
  ```

  Replace the mobile bar block:

  ```tsx
  {selected && presentation.allowsInvestmentCta ? (
    <div className="mobile-allocation-bar">
      <div>
        <strong>{selected.id === "green" ? "EV option" : selected.label}</strong>
        <span className="field-hint">
          {formatYieldPct(selected.yieldPct)} target · From {formatEur(selected.minTicketEur)}
        </span>
      </div>
      <AllocationCta cta={cta} assetSlug={props.assetSlug} selected={selected} compact />
    </div>
  ) : null}
  ```

  with:

  ```tsx
  {selected && presentation.allowsInvestmentCta ? (
    <div className="mobile-allocation-bar">
      <div>
        <strong>{selected.id === "green" ? "EV option" : selected.label}</strong>
        <span className="field-hint">
          {formatYieldPct(selected.yieldPct)} target · From {formatEur(selected.minTicketEur)}
        </span>
        <span className="field-hint risk-line">{RISK_LINE}</span>
      </div>
      <AllocationCta cta={cta} assetSlug={props.assetSlug} selected={selected} />
    </div>
  ) : null}
  ```

- [ ] **Step 2: Remove the compact/hidden-amount path from the CTA**

  In `apps/web/components/opportunity-detail-cta.tsx`:

  Change `AllocationCta`'s signature — remove `compact`:

  ```tsx
  export function AllocationCta({
    cta,
    assetSlug,
    selected
  }: {
    cta: DetailCtaDecision;
    assetSlug: string;
    selected: InvestmentOption | undefined;
  }) {
  ```

  Change the `allowsInterestForm` branch:

  ```tsx
  if (cta.allowsInterestForm) {
    return <InterestFormWithOption assetSlug={assetSlug} option={selected} />;
  }
  ```

  Change `InterestFormWithOption` — drop the `compact` prop:

  ```tsx
  function InterestFormWithOption({
    assetSlug,
    option
  }: {
    assetSlug: string;
    option: InvestmentOption;
  }) {
  ```

  Replace the conditional amount/note block:

  ```tsx
  {!compact ? (
    <>
      <label className="form-field" htmlFor={amountId}>
        ...
      </label>
      <label className="form-field" htmlFor={noteId}>
        ...
      </label>
    </>
  ) : (
    <input type="hidden" name="amountEur" value={option.minTicketEur} />
  )}
  ```

  with the unconditional full form (identical fields to the old non-compact branch):

  ```tsx
  <label className="form-field" htmlFor={amountId}>
    <span>Investment amount (EUR)</span>
    <input
      key={option.id}
      id={amountId}
      name="amountEur"
      type="number"
      min={option.minTicketEur}
      step={1}
      required
      defaultValue={option.minTicketEur}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    />
  </label>
  <label className="form-field" htmlFor={noteId}>
    <span>Note (optional)</span>
    <textarea id={noteId} name="note" maxLength={500} rows={2} />
  </label>
  ```

- [ ] **Step 3: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  grep -rn "compact" components/opportunity-detail-cta.tsx components/opportunity-detail-client.tsx
  ```

  Expected: tsc clean (no other `compact` callers exist — tsc proves it), all tests pass, grep finds no `compact` in either file.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/components/opportunity-detail-client.tsx apps/web/components/opportunity-detail-cta.tsx
  git commit -m "catalogue: risk line on mobile sticky CTA, remove hidden-amount compact submit"
  ```

---

### Task 23: One yield basis for card display, sort, and filter

Finding 5 (basis alignment) + finding 6 (soften lead, `RISK_LINE_SHORT` on cards).

Current mismatch: cards/hero display the full band via `formatYieldBand` ("8.2% → 9.5%", `lib/assets/presentation.ts:118`) while sort and the yield filter use the *recommended* option's yield (`primaryYield` in `app/opportunities/opportunities-catalogue.tsx:19-24`).

Decision (one semantics, applied consistently): **the basis is the band max** — the highest option target yield.

- Display: `formatYieldCeiling(options)` → `Up to 9.5%` when options span a band, plain `8.2%` when they (nearly) coincide. This flows through `buildOpportunityPresentation`, so cards and the detail hero stay in parity automatically (`parityKey.yieldDisplay` unchanged in shape).
- Sort `yield_desc` and the yield-band filter use `yieldBand(options).max`.
- `formatYieldBand` stays exported — `app/opportunities/[slug]/opengraph-image.tsx:21` still uses it; the OG image is out of scope.

The sort/filter helpers move from the client component into a new pure module so they are testable (there is no component test harness).

**Files:**
- Modify: `apps/web/lib/assets/investment-options.ts`
- Create: `apps/web/lib/assets/catalogue-view.ts`
- Modify: `apps/web/lib/assets/presentation.ts`
- Modify: `apps/web/app/opportunities/opportunities-catalogue.tsx`
- Modify: `apps/web/components/asset-card.tsx`
- Modify: `apps/web/app/opportunities/page.tsx`
- Test: `apps/web/lib/assets/catalogue-view.test.ts` (new)
- Test: `apps/web/lib/assets/investment-options.test.ts`
- Test: `apps/web/lib/assets/presentation.test.ts`

**Interfaces:**
- Consumes: `yieldBand` (existing, `lib/assets/investment-options.ts:175`).
- Produces:
  - `formatYieldCeiling(options: InvestmentOption[]): string` (in `lib/assets/investment-options.ts`)
  - `lib/assets/catalogue-view.ts`:
    - `type CatalogueSortKey = "name_asc" | "min_asc" | "yield_desc"`
    - `catalogueYieldBasis(asset: CatalogueOptionSource): number`
    - `catalogueMinBasis(asset: CatalogueOptionSource): number`
    - `parseCatalogueSort(v: string | null): CatalogueSortKey`
    - `sortCatalogueAssets<T extends CatalogueOptionSource>(assets: T[], sort: CatalogueSortKey): T[]`
    - `matchesYieldBand(yieldBasis: number, band: string): boolean`
    - `matchesMinBand(minBasis: number, band: string): boolean`
  - Task 24 extends this module with `countFullyFunded`.

- [ ] **Step 1: Write the failing tests**

  Create `apps/web/lib/assets/catalogue-view.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import {
    catalogueMinBasis,
    catalogueYieldBasis,
    matchesMinBand,
    matchesYieldBand,
    parseCatalogueSort,
    sortCatalogueAssets
  } from "@/lib/assets/catalogue-view";
  import { DEFAULT_COMMERCIAL_TERM_IDS } from "@/lib/assets/commercial-terms";
  import type { InvestmentOption } from "@/lib/assets/investment-options";

  const standard: InvestmentOption = {
    id: "standard",
    label: "Standard option",
    recommended: true,
    minTicketEur: 10000,
    yieldPct: 8,
    monthlyIncomeEur: 67,
    annualIncomeEur: 800,
    commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
  };
  const premium: InvestmentOption = {
    id: "premium",
    label: "Premium option",
    recommended: false,
    minTicketEur: 25000,
    yieldPct: 9.5,
    monthlyIncomeEur: 198,
    annualIncomeEur: 2375,
    commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
  };

  function asset(
    name: string,
    investmentOptions: InvestmentOption[],
    targetYieldPct: string | number,
    minTicketEur: string | number
  ) {
    return { name, investmentOptions, targetYieldPct, minTicketEur };
  }

  describe("catalogueYieldBasis", () => {
    it("uses the band max so display, sort, and filter share one basis", () => {
      expect(catalogueYieldBasis(asset("A", [standard, premium], 8, 10000))).toBe(9.5);
    });

    it("falls back to the asset-level target when there are no options", () => {
      expect(catalogueYieldBasis(asset("A", [], "7.4", 10000))).toBe(7.4);
    });
  });

  describe("catalogueMinBasis", () => {
    it("uses the recommended option minimum, matching the card display", () => {
      expect(catalogueMinBasis(asset("A", [standard, premium], 8, 10000))).toBe(10000);
    });

    it("falls back to the asset-level minimum when there are no options", () => {
      expect(catalogueMinBasis(asset("A", [], 8, "15000"))).toBe(15000);
    });
  });

  describe("parseCatalogueSort", () => {
    it("defaults to the neutral name A–Z sort", () => {
      expect(parseCatalogueSort(null)).toBe("name_asc");
      expect(parseCatalogueSort("bogus")).toBe("name_asc");
    });

    it("accepts the known sort keys", () => {
      expect(parseCatalogueSort("min_asc")).toBe("min_asc");
      expect(parseCatalogueSort("yield_desc")).toBe("yield_desc");
    });
  });

  describe("sortCatalogueAssets", () => {
    const low = asset("Beta", [standard], 8, 10000);
    const high = asset("Alpha", [standard, premium], 8, 10000);

    it("sorts yield_desc on the band max", () => {
      expect(sortCatalogueAssets([low, high], "yield_desc").map((a) => a.name)).toEqual([
        "Alpha",
        "Beta"
      ]);
    });

    it("does not mutate the input array", () => {
      const input = [low, high];
      sortCatalogueAssets(input, "yield_desc");
      expect(input.map((a) => a.name)).toEqual(["Beta", "Alpha"]);
    });
  });

  describe("matchesYieldBand", () => {
    it("matches the same basis the card displays", () => {
      expect(matchesYieldBand(9.5, "over9")).toBe(true);
      expect(matchesYieldBand(9.5, "8to9")).toBe(false);
      expect(matchesYieldBand(8.5, "8to9")).toBe(true);
      expect(matchesYieldBand(7.9, "under8")).toBe(true);
      expect(matchesYieldBand(9.5, "all")).toBe(true);
    });
  });

  describe("matchesMinBand", () => {
    it("keeps the existing band boundaries", () => {
      expect(matchesMinBand(9999, "under10")).toBe(true);
      expect(matchesMinBand(10000, "10to25")).toBe(true);
      expect(matchesMinBand(25000, "10to25")).toBe(true);
      expect(matchesMinBand(25001, "over25")).toBe(true);
      expect(matchesMinBand(10000, "all")).toBe(true);
    });
  });
  ```

  Append to `apps/web/lib/assets/investment-options.test.ts` (add `formatYieldCeiling` to the import):

  ```ts
  describe("formatYieldCeiling", () => {
    it("shows up-to band max when options span a band", () => {
      const low = {
        id: "standard" as const,
        label: "Standard",
        recommended: true,
        minTicketEur: 10000,
        yieldPct: 8.2,
        monthlyIncomeEur: 68,
        annualIncomeEur: 820,
        commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
      };
      const high = { ...low, id: "premium" as const, recommended: false, yieldPct: 9.5 };
      expect(formatYieldCeiling([low, high])).toBe("Up to 9.5%");
    });

    it("shows a plain figure when options coincide", () => {
      const only = {
        id: "standard" as const,
        label: "Standard",
        recommended: true,
        minTicketEur: 10000,
        yieldPct: 8.2,
        monthlyIncomeEur: 68,
        annualIncomeEur: 820,
        commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
      };
      expect(formatYieldCeiling([only])).toBe("8.2%");
    });
  });
  ```

  Append to `apps/web/lib/assets/presentation.test.ts` inside `describe("buildOpportunityPresentation", ...)`:

  ```ts
  it("displays the yield on the band-max basis with an up-to qualifier", () => {
    const premiumOption: InvestmentOption = {
      ...standardOption,
      id: "premium",
      label: "Premium",
      recommended: false,
      minTicketEur: 25000,
      yieldPct: 9.5,
      monthlyIncomeEur: 198,
      annualIncomeEur: 2375
    };
    const p = buildOpportunityPresentation(
      baseInput({ investmentOptions: [standardOption, premiumOption] })
    );
    expect(p.yieldDisplay).toBe("Up to 9.5%");
  });
  ```

  (The existing test expecting `"8.2%"` for the single-option input keeps passing — a single option is not a band.)

- [ ] **Step 2: Run to confirm failure**

  ```bash
  npx vitest run lib/assets/catalogue-view.test.ts lib/assets/investment-options.test.ts lib/assets/presentation.test.ts
  ```

  Expected: FAIL — `catalogue-view` module not found, `formatYieldCeiling is not a function`, and the new presentation test gets `"8.2% → 9.5%"` instead of `"Up to 9.5%"`.

- [ ] **Step 3: Implement `formatYieldCeiling`**

  In `apps/web/lib/assets/investment-options.ts`, after `formatYieldBand`:

  ```ts
  /**
   * Card/hero yield display on the band-max basis: "Up to 9.5%" when options
   * span a band, plain "8.2%" when they (nearly) coincide. Matches the
   * catalogue sort/filter basis in `lib/assets/catalogue-view.ts`.
   */
  export function formatYieldCeiling(options: InvestmentOption[]): string {
    const { min, max } = yieldBand(options);
    if (max - min < 0.5) {
      return `${max.toFixed(1)}%`;
    }
    return `Up to ${max.toFixed(1)}%`;
  }
  ```

- [ ] **Step 4: Create `lib/assets/catalogue-view.ts`**

  ```ts
  /**
   * Pure catalogue view logic. Card display, sort, and filter all share one
   * basis so the figure on the card is the figure sort/filter use:
   * yield = band max ("Up to X%"), minimum = recommended option's minimum.
   */

  import { yieldBand, type InvestmentOption } from "@/lib/assets/investment-options";

  export type CatalogueSortKey = "name_asc" | "min_asc" | "yield_desc";

  /** Narrow structural type so tests don't need full list-field fixtures. */
  export type CatalogueOptionSource = {
    name: string;
    investmentOptions?: InvestmentOption[];
    targetYieldPct: string | number;
    minTicketEur: string | number;
  };

  /** Highest option target yield; falls back to the asset-level target. */
  export function catalogueYieldBasis(asset: CatalogueOptionSource): number {
    const opts = asset.investmentOptions ?? [];
    if (opts.length > 0) return yieldBand(opts).max;
    return Number(asset.targetYieldPct);
  }

  /** Recommended option's minimum (same fallback chain as the card display). */
  export function catalogueMinBasis(asset: CatalogueOptionSource): number {
    const opts = asset.investmentOptions ?? [];
    const rec = opts.find((o) => o.recommended) ?? opts.find((o) => o.id === "standard") ?? opts[0];
    if (rec) return rec.minTicketEur;
    return Number(asset.minTicketEur);
  }

  /** Neutral default is name A–Z; unknown or missing values fall back to it. */
  export function parseCatalogueSort(v: string | null): CatalogueSortKey {
    if (v === "min_asc" || v === "yield_desc" || v === "name_asc") return v;
    return "name_asc";
  }

  export function sortCatalogueAssets<T extends CatalogueOptionSource>(
    assets: T[],
    sort: CatalogueSortKey
  ): T[] {
    const list = [...assets];
    list.sort((a, b) => {
      if (sort === "min_asc") return catalogueMinBasis(a) - catalogueMinBasis(b);
      if (sort === "yield_desc") return catalogueYieldBasis(b) - catalogueYieldBasis(a);
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  export function matchesYieldBand(yieldBasis: number, band: string): boolean {
    if (band === "under8") return yieldBasis < 8;
    if (band === "8to9") return yieldBasis >= 8 && yieldBasis <= 9;
    if (band === "over9") return yieldBasis > 9;
    return true;
  }

  export function matchesMinBand(minBasis: number, band: string): boolean {
    if (band === "under10") return minBasis < 10000;
    if (band === "10to25") return minBasis >= 10000 && minBasis <= 25000;
    if (band === "over25") return minBasis > 25000;
    return true;
  }
  ```

- [ ] **Step 5: Switch the presentation to the ceiling display**

  In `apps/web/lib/assets/presentation.ts`, change the import:

  ```ts
  import {
    formatYieldCeiling,
    type InvestmentOption
  } from "@/lib/assets/investment-options";
  ```

  and in `resolveYieldDisplay` replace `return formatYieldBand(options);` with `return formatYieldCeiling(options);`.

- [ ] **Step 6: Run to confirm pass**

  ```bash
  npx vitest run lib/assets/catalogue-view.test.ts lib/assets/investment-options.test.ts lib/assets/presentation.test.ts
  ```

  Expected: PASS.

- [ ] **Step 7: Rewire the catalogue component to the shared helpers**

  In `apps/web/app/opportunities/opportunities-catalogue.tsx`:

  Delete the local `type SortKey`, `primaryYield`, `primaryMin`, and `parseSort` declarations (lines 17-36). Change the imports:

  ```ts
  import {
    catalogueMinBasis,
    catalogueYieldBasis,
    matchesMinBand,
    matchesYieldBand,
    parseCatalogueSort,
    sortCatalogueAssets
  } from "@/lib/assets/catalogue-view";
  ```

  Change the sort derivation:

  ```ts
  const sort = parseCatalogueSort(searchParams.get("sort"));
  ```

  Replace the min/yield filter and sort logic inside the `filtered` memo:

  ```ts
  const min = primaryMin(a);
  if (minBand === "under10" && min >= 10000) return false;
  if (minBand === "10to25" && (min < 10000 || min > 25000)) return false;
  if (minBand === "over25" && min <= 25000) return false;

  const y = primaryYield(a);
  if (yieldBand === "under8" && y >= 8) return false;
  if (yieldBand === "8to9" && (y < 8 || y > 9)) return false;
  if (yieldBand === "over9" && y <= 9) return false;

  return true;
  });

  list.sort((a, b) => {
    if (sort === "min_asc") return primaryMin(a) - primaryMin(b);
    if (sort === "yield_desc") return primaryYield(b) - primaryYield(a);
    return a.name.localeCompare(b.name);
  });
  return list;
  ```

  with:

  ```ts
  if (!matchesMinBand(catalogueMinBasis(a), minBand)) return false;
  if (!matchesYieldBand(catalogueYieldBasis(a), yieldBand)) return false;

  return true;
  });

  return sortCatalogueAssets(list, sort);
  ```

  (The `<select>` options and `SortKey` usages in the JSX are unchanged — `sort` is still one of the three string keys.)

- [ ] **Step 8: Add RISK_LINE_SHORT to cards and soften the catalogue lead**

  In `apps/web/components/asset-card.tsx`, change the copy import:

  ```ts
  import { RISK_LINE_SHORT, TARGET_RETURN_EXPLAINER } from "@/lib/copy/consumer";
  ```

  Replace the disclaimer block:

  ```tsx
  {!homepage ? (
    <p className="field-hint asset-card-disclaimer">{TARGET_RETURN_EXPLAINER}</p>
  ) : null}
  ```

  with:

  ```tsx
  {!homepage ? (
    <>
      <p className="field-hint asset-card-disclaimer">{TARGET_RETURN_EXPLAINER}</p>
      <p className="field-hint asset-card-disclaimer risk-line">{RISK_LINE_SHORT}</p>
    </>
  ) : null}
  ```

  In `apps/web/app/opportunities/page.tsx`, replace the `PageIntro` lead:

  ```tsx
  lead="Every listing shows its target return, minimum ticket, term, and risks up front. Figures are targets or illustrations — never guarantees."
  ```

  with:

  ```tsx
  lead="Compare target returns, minimums, and terms side by side — each listing also sets out its key risks. Figures are targets or illustrations, never guarantees."
  ```

- [ ] **Step 9: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```

  Expected: all clean. (The build catches the server/client boundary — `catalogue-view.ts` is imported only from the client catalogue component and pure lib tests, so it needs no `"use client"`.)

- [ ] **Step 10: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/investment-options.ts apps/web/lib/assets/investment-options.test.ts apps/web/lib/assets/catalogue-view.ts apps/web/lib/assets/catalogue-view.test.ts apps/web/lib/assets/presentation.ts apps/web/lib/assets/presentation.test.ts apps/web/app/opportunities/opportunities-catalogue.tsx apps/web/components/asset-card.tsx apps/web/app/opportunities/page.tsx
  git commit -m "catalogue: one yield basis (band max, up-to display) for cards, sort, and filter; risk line on cards; softer lead"
  ```

---

### Task 24: Neutral default sort lock, yield-filter qualifier, boilerplate cut, fully-funded social proof

Findings 7, 8, 9.

- Finding 7: the default sort is already neutral — `parseCatalogueSort` (Task 23) falls back to `"name_asc"` and the test from Task 23 locks it. This task adds the remaining affordance: a brief qualifier next to the yield filter.
- Finding 8: cut the generic demand paragraph in `components/opportunity-detail-location.tsx:57-62` — the provenance-labelled stats carry the section.
- Finding 9: "N opportunities fully funded" line next to the catalogue result count. Funded assets remain filterable — the existing funding filter (`open` / `full` / `all`) is untouched.

**Files:**
- Modify: `apps/web/lib/assets/catalogue-view.ts`
- Modify: `apps/web/app/opportunities/opportunities-catalogue.tsx`
- Modify: `apps/web/components/opportunity-detail-location.tsx`
- Test: `apps/web/lib/assets/catalogue-view.test.ts`

**Interfaces:**
- Consumes: `lib/assets/catalogue-view.ts` from Task 23 (extends it); `parseCatalogueSort` neutral default already tested there.
- Produces: `countFullyFunded(assets: OpportunityListFields[]): number` in `lib/assets/catalogue-view.ts`.

- [ ] **Step 1: Write the failing test**

  Append to `apps/web/lib/assets/catalogue-view.test.ts` — first extend the import block at the top of the file to:

  ```ts
  import {
    catalogueMinBasis,
    catalogueYieldBasis,
    countFullyFunded,
    matchesMinBand,
    matchesYieldBand,
    parseCatalogueSort,
    sortCatalogueAssets
  } from "@/lib/assets/catalogue-view";
  import { DEFAULT_COMMERCIAL_TERM_IDS } from "@/lib/assets/commercial-terms";
  import { fundingFromAmounts } from "@/lib/assets/funding";
  import type { InvestmentOption } from "@/lib/assets/investment-options";
  import type { OpportunityListFields } from "@/lib/assets/list-fields";
  ```

  then append at the end of the file:

  ```ts
  function listAsset(overrides: Partial<OpportunityListFields>): OpportunityListFields {
    return {
      id: "00000000-0000-0000-0000-000000000001",
      slug: "hub-a",
      name: "Hub A",
      tier: "standard",
      city: "Dublin",
      country: "Ireland",
      operator: "Ops Co",
      spaces: 100,
      targetYieldPct: 8,
      minTicketEur: 10000,
      incomeMix: [{ id: "vehicle_parking", pct: 100 }],
      investmentOptions: [standard],
      assetStatus: "published",
      ...overrides
    };
  }

  describe("countFullyFunded", () => {
    it("counts only fully funded published assets", () => {
      const assets = [
        listAsset({ id: "00000000-0000-0000-0000-000000000001", funding: fundingFromAmounts(500000, 1000000) }),
        listAsset({ id: "00000000-0000-0000-0000-000000000002", slug: "hub-b", funding: fundingFromAmounts(1000000, 1000000) }),
        listAsset({ id: "00000000-0000-0000-0000-000000000003", slug: "hub-c", funding: fundingFromAmounts(1000000, 1000000) })
      ];
      expect(countFullyFunded(assets)).toBe(2);
    });

    it("returns zero when nothing is fully funded", () => {
      expect(
        countFullyFunded([
          listAsset({ funding: fundingFromAmounts(0, 1000000) })
        ])
      ).toBe(0);
    });
  });
  ```

  (`fundingFromAmounts(1000000, 1000000)` yields `open: false` → status `fully_funded`; `fundingFromAmounts(500000, 1000000)` is open.)

- [ ] **Step 2: Run to confirm failure**

  ```bash
  npx vitest run lib/assets/catalogue-view.test.ts
  ```

  Expected: FAIL — `countFullyFunded is not a function`.

- [ ] **Step 3: Implement `countFullyFunded`**

  In `apps/web/lib/assets/catalogue-view.ts`, add imports:

  ```ts
  import { listFieldsToPresentationInput, type OpportunityListFields } from "@/lib/assets/list-fields";
  import { buildOpportunityPresentation } from "@/lib/assets/presentation";
  ```

  and append:

  ```ts
  /** Published assets whose resolved status is fully funded (social-proof line). */
  export function countFullyFunded(assets: OpportunityListFields[]): number {
    return assets.filter(
      (a) =>
        buildOpportunityPresentation(listFieldsToPresentationInput(a)).status.id ===
        "fully_funded"
    ).length;
  }
  ```

- [ ] **Step 4: Run to confirm pass**

  ```bash
  npx vitest run lib/assets/catalogue-view.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Social-proof line + yield-filter qualifier in the catalogue component**

  In `apps/web/app/opportunities/opportunities-catalogue.tsx`, add `countFullyFunded` to the `@/lib/assets/catalogue-view` import, and inside the component (near the other memos):

  ```ts
  const fullyFundedCount = useMemo(() => countFullyFunded(assets), [assets]);
  ```

  Replace the result-count span:

  ```tsx
  <span className="filter-count" aria-live="polite">
    {filtered.length} {filtered.length === 1 ? "opportunity" : "opportunities"}
    {totalPages > 1 ? ` · Page ${safePage} of ${totalPages}` : ""}
  </span>
  ```

  with:

  ```tsx
  <span className="filter-count" aria-live="polite">
    {filtered.length} {filtered.length === 1 ? "opportunity" : "opportunities"}
    {totalPages > 1 ? ` · Page ${safePage} of ${totalPages}` : ""}
  </span>
  {fullyFundedCount > 0 ? (
    <span className="field-hint filter-funded-note">
      {fullyFundedCount === 1
        ? "1 opportunity fully funded"
        : `${fullyFundedCount} opportunities fully funded`}
    </span>
  ) : null}
  ```

  Inside the "Target return" `.filter-field`, after the `</select>`, add the qualifier:

  ```tsx
  <p className="field-hint">
    Bands match each listing&apos;s highest option target. Targets are not guaranteed.
  </p>
  ```

- [ ] **Step 6: Cut the demand boilerplate in the location section**

  In `apps/web/components/opportunity-detail-location.tsx`, replace:

  ```tsx
  <p>
    Located in {city}, {country}
    {siteType ? ` (${siteType})` : ""}. Demand here comes from commuters,
    residents, visitors, and nearby venues. Results still depend on
    local competition, pricing, and occupancy.
  </p>
  ```

  with:

  ```tsx
  <p>
    Located in {city}, {country}
    {siteType ? ` (${siteType})` : ""}.
  </p>
  ```

  (Keep the provenance stats block and the trailing "Local demand indicators do not guarantee investment performance." hint — they carry the section now.)

- [ ] **Step 7: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```

  Expected: all clean.

- [ ] **Step 8: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/catalogue-view.ts apps/web/lib/assets/catalogue-view.test.ts apps/web/app/opportunities/opportunities-catalogue.tsx apps/web/components/opportunity-detail-location.tsx
  git commit -m "catalogue: yield-filter qualifier, fully-funded count line, cut location demand boilerplate"
  ```

---

## Finding coverage map

| Spec finding (Area 2) | Task |
| --- | --- |
| 1. "Recommended" badge → derived labels; flag internal-only | 19 |
| 2. Term-sheet "Key terms" summary | 20 |
| 3. Illustrator downside rows + assumptions note | 21 |
| 4. Mobile sticky CTA risk line; remove hidden-amount compact submit | 22 |
| 5. Yield band vs sort/filter — one basis | 23 |
| 6. Soften "risks up front" lead; `RISK_LINE_SHORT` on cards | 23 |
| 7. Neutral default sort; yield-filter qualifier | 24 |
| 8. Cut demand boilerplate | 24 |
| 9. "N fully funded" social proof near count | 24 |

---

