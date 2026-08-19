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
