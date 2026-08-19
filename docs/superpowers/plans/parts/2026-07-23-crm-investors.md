# Investors area — `/admin/investors` (Tasks 4–6)

Plan part for spec `docs/superpowers/specs/2026-07-23-crm-redesign-design.md`, section **B. Investors**. Cross-cutting section E applies to every task here.

Scope: `apps/web`. All commands run from `/Users/mac/Documents/Park/apps/web`, after:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
```

## Conventions used throughout (verified against real code)

- Server actions return `{ ok: true, ... }` / `{ ok: false, error }`; authz inside the action. `assignInvestor` (`lib/investors/admin-actions.ts`) is the local reference pattern.
- Staff auth in queries/actions: `requireStaff()` from `@/lib/auth/staff` (throws `Error("FORBIDDEN")`); scoping via `investorVisibleToStaff({ role, staffId, investor: { assignedAgentId, ibId } })` from the **same module** (`lib/auth/staff.ts`). Out-of-scope single-record reads throw `Error("NOT_FOUND")` — the exact pattern in `getInvestorApplicationBundle` (`lib/investors/queries.ts:173`).
- Audit pattern (copied exactly from `lib/investors/admin-actions.ts:79`):
  ```ts
  await db.insert(auditEvents).values({
    actorUserId,
    action: "<event>",
    entityType: "investor",
    entityId: investorId,
    payload: { ... }
  });
  ```
- `audit_events` rows with `entityType: "investor"` already exist for these actions (verified by grep): `investor.created`, `investor.assigned`, `investor.invited`, `investor.password_set`, `investor.two_factor_reset`, `investor.erased`, `application.submitted`, `application.contacted`, `application.rejected`, `kyc.document_uploaded`, `kyc.submitted`, `kyc.approved`/`kyc.rejected` (template `` `kyc.${status}` ``), `kyc.assisted_upload`, `onboarding.completed`, `onboarding.assisted_profile_saved`, `onboarding.assisted_completed`, `aml.screening_recorded`. The Activity tab's friendly-line map must cover all of these.
- Unit tests are node-env, hermetic, DB-free: mock `next/cache`, `@/lib/auth/staff`, `@/lib/db` (style of `tests/leads-admin-actions.test.ts`); chain-mock style for queries follows `tests/access-own-events.test.ts`. Pure helpers get plain tests with no mocks (style of `tests/investor-scope.test.ts`).
- UX: `.table-wrap` (globals.css:1451) on every new table; `btn-sm` is 42px min-height (globals.css:273) so it satisfies the ≥40px tap-target rule; no raw enum strings — label maps in `lib/portal/labels.ts` plus `formatDistributionType`/`formatDistributionStatus` (`lib/portfolio/distributions.ts:63-75`); no inline styles — `stack-*` utilities exist (`stack-6`, `stack-b-4`).

## Divergences from the assignment's assumptions (verified in code)

1. **Migration head is 0020, not 0017.** `apps/web/drizzle/` already contains `0018_perpetual_lady_bullseye.sql`, `0019_flawless_epoch.sql`, `0020_giant_amazoness.sql` (AGENTS.md is stale). The `investor_notes` migration generated in Task 6 will be **0021**.
2. `listInvestorsForStaff()` is also consumed by `app/admin/page.tsx:41` (dashboard). Task 4 therefore does **not** change its signature; search + pagination is a pure, fully-tested layer over its result in a new dependency-free module.
3. The existing investor-list filters (account/application/kyc selects, pending + unassigned queues) are applied **in JS in the page** over the scoped rows, and the pending queue depends on the latest-application merge that `listInvestorsForStaff` already does in JS. Moving that to SQL would require a latest-application lateral subquery for no behavioural gain at back-office scale; search + offset pagination is implemented in the same server-side, per-request style (nothing ships to the client). Total/page counts come from the filtered set, so pagination is real offset pagination from the user's perspective.
4. `DistributionRow` (`lib/portfolio/distributions.ts:5`) has no `createdAt`, but scheduled distributions have `paidAt: null` — the payments table needs a date fallback, so Task 5 uses a local `InvestorDistributionRow = DistributionRow & { createdAt: Date }`.
5. `getInvestorApplicationBundle` is extended with `holdings`/`distributions` rather than adding a second scoped query — it already performs the scoped investor lookup (`lib/investors/queries.ts:180-198`) and is the bundle the detail page already fetches.
6. Existing detail-tab tables (Profile/Application/KYC/Interests) are **not** wrapped in `.table-wrap` and render some raw enum strings; that predates this round and is intentionally left alone (scoped diff). Only the two new tabs are held to the section-E standard.
7. The audit `actorUserId` is an auth-user id (or sentinel strings like `"system:apply"`, `"unknown"`), not a staff id — the Activity timeline does not attempt to resolve actor names; friendly lines say what happened, notes show the author email (from the `staff_profiles` join).

---

### Task 4: Server-side search + offset pagination (25/page) on `/admin/investors`

**Files:**
- Create: `apps/web/lib/investors/list-search.ts`
- Modify: `apps/web/app/admin/investors/page.tsx`
- Test: `apps/web/tests/investors-list-search.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `INVESTORS_PAGE_SIZE: 25` (const, from `@/lib/investors/list-search`)
  - `searchInvestorRows(rows: InvestorRow[], search: string): InvestorRow[]` — case-insensitive substring match on `email` and `fullName`; empty/blank search returns `rows` unchanged.
  - `paginateRows<T>(rows: T[], page: number, pageSize: number): { rows: T[]; total: number; page: number; pageCount: number }` — 1-based `page`, clamped into `[1, pageCount]`; `pageCount` is at least 1.
  - Used by `app/admin/investors/page.tsx`; no later task in this part consumes them (the leads area has its own list code).

- [ ] **Step 1: write the failing test**

Create `apps/web/tests/investors-list-search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  INVESTORS_PAGE_SIZE,
  paginateRows,
  searchInvestorRows
} from "@/lib/investors/list-search";
import type { InvestorRow } from "@/lib/investors/queries";

function row(partial: Partial<InvestorRow> & { id: string }): InvestorRow {
  return {
    email: `${partial.id}@example.com`,
    fullName: "",
    accountStatus: "active",
    kycStatus: "not_started",
    applicationStatus: null,
    applicationCreatedAt: null,
    assignedAgentId: null,
    assignedAgentEmail: null,
    ibId: null,
    ibEmail: null,
    ...partial
  };
}

describe("searchInvestorRows", () => {
  const rows = [
    row({ id: "1", email: "ada@example.com", fullName: "Ada Lovelace" }),
    row({ id: "2", email: "grace@example.com", fullName: "Grace Hopper" }),
    row({ id: "3", email: "alan@example.com", fullName: "Alan Turing" })
  ];

  it("matches case-insensitive substrings of email and full name", () => {
    expect(searchInvestorRows(rows, "ADA").map((r) => r.id)).toEqual(["1"]);
    expect(searchInvestorRows(rows, "hopper").map((r) => r.id)).toEqual(["2"]);
    expect(searchInvestorRows(rows, "example.com").map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("returns the input unchanged for a blank search", () => {
    expect(searchInvestorRows(rows, "")).toBe(rows);
    expect(searchInvestorRows(rows, "   ")).toBe(rows);
  });

  it("matches nothing gracefully", () => {
    expect(searchInvestorRows(rows, "zzz")).toEqual([]);
  });
});

describe("paginateRows", () => {
  const rows = Array.from({ length: 60 }, (_, i) => i + 1);

  it("slices 25 per page by default page size", () => {
    const page1 = paginateRows(rows, 1, INVESTORS_PAGE_SIZE);
    expect(page1.rows).toHaveLength(25);
    expect(page1.rows[0]).toBe(1);
    expect(page1.total).toBe(60);
    expect(page1.pageCount).toBe(3);

    const page3 = paginateRows(rows, 3, INVESTORS_PAGE_SIZE);
    expect(page3.rows).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
  });

  it("clamps out-of-range pages", () => {
    expect(paginateRows(rows, 99, INVESTORS_PAGE_SIZE).page).toBe(3);
    expect(paginateRows(rows, 99, INVESTORS_PAGE_SIZE).rows).toHaveLength(10);
    expect(paginateRows(rows, 0, INVESTORS_PAGE_SIZE).page).toBe(1);
  });

  it("reports one empty page for an empty list", () => {
    const result = paginateRows([] as number[], 1, INVESTORS_PAGE_SIZE);
    expect(result).toEqual({ rows: [], total: 0, page: 1, pageCount: 1 });
  });
});
```

Run it — expected failure (`Cannot find module '@/lib/investors/list-search'`):

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
npx vitest run tests/investors-list-search.test.ts
```

- [ ] **Step 2: implement the pure helpers**

Create `apps/web/lib/investors/list-search.ts` (no runtime imports — type-only import is erased at compile time, so the test stays hermetic):

```ts
import type { InvestorRow } from "./queries";

/**
 * Search + offset pagination for the staff investors list. Dependency-free on
 * purpose: the scoped rows come from listInvestorsForStaff (role scoping stays
 * in SQL there) and filtering/slicing happens server-side per request.
 */

export const INVESTORS_PAGE_SIZE = 25;

export function searchInvestorRows(rows: InvestorRow[], search: string): InvestorRow[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (row) =>
      row.email.toLowerCase().includes(needle) ||
      row.fullName.toLowerCase().includes(needle)
  );
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number
): { rows: T[]; total: number; page: number; pageCount: number } {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (clamped - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total, page: clamped, pageCount };
}
```

Run — expected pass:

```bash
npx vitest run tests/investors-list-search.test.ts
```

- [ ] **Step 3: commit the helpers**

```bash
git add apps/web/lib/investors/list-search.ts apps/web/tests/investors-list-search.test.ts
git commit -m "Add search + pagination helpers for the staff investors list"
```

- [ ] **Step 4: wire search + pagination into the investors page**

In `apps/web/app/admin/investors/page.tsx`, make these exact edits.

(a) Add the import (after the existing `@/lib/investors/queries` import, line 13):

```ts
import {
  INVESTORS_PAGE_SIZE,
  paginateRows,
  searchInvestorRows
} from "@/lib/investors/list-search";
```

(b) Extend `SearchParams` (currently lines 28-33):

```ts
type SearchParams = Promise<{
  filter?: string | string[];
  account?: string | string[];
  application?: string | string[];
  kyc?: string | string[];
  q?: string | string[];
  page?: string | string[];
}>;
```

(c) Parse the new params. After the existing lines `const kyc = one(params.kyc);` (line 61), add:

```ts
  const q = (one(params.q) ?? "").trim();
  const requestedPage = Number.parseInt(one(params.page) ?? "1", 10) || 1;
```

(d) Apply search + pagination after the existing filters. The existing block ends with (lines 100-102):

```ts
  if (kyc) {
    rows = rows.filter((row) => row.kycStatus === kyc);
  }
```

Insert immediately after it:

```ts
  const searched = searchInvestorRows(rows, q);
  const paged = paginateRows(searched, requestedPage, INVESTORS_PAGE_SIZE);
  const pageRows = paged.rows;
```

(e) Keep header counts and queue links search-aware. In the `AdminPageHeader` `actions` block, change both `buildHref({...})` calls (lines 130-136 and the unassigned toggle at lines 139-149) to carry the search term — add `q: q || undefined` to the params object of the pending-toggle link:

```ts
              href={buildHref({
                filter: pendingQueue ? undefined : "pending",
                account,
                application,
                kyc,
                q: q || undefined
              })}
```

and change the unassigned toggle links to:

```tsx
              unassignedOnly ? (
                <Link className="link-arrow" href={buildHref({ q: q || undefined })}>
                  Show all
                </Link>
              ) : (
                <Link
                  className="link-arrow"
                  href={buildHref({ filter: "unassigned", q: q || undefined })}
                >
                  Unassigned ({unassignedCount})
                </Link>
              )
```

(f) Add the search field to the filter form. Inside `<form className="admin-filter-form" method="get">` (line 162), as the first `<label>` before the Account label:

```tsx
          <label>
            Search
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Name or email"
            />
          </label>
```

(The form is `method="get"` and has no `page` input, so applying filters or searching naturally resets to page 1.)

(g) Render `pageRows` instead of `rows` in the table: change `{rows.map((investor) => {` (line 225) to `{pageRows.map((investor) => {`. Leave the empty-state check (`rows.length === 0`, line 201) as-is for the "nothing scoped" case, and change its condition to `pageRows.length === 0` so an empty search result also shows the empty state; update the copy to:

```tsx
      {pageRows.length === 0 ? (
        <p className="lead">
          {q
            ? `No investors match "${q}".`
            : pendingQueue
              ? "No pending applications."
              : unassignedOnly
                ? "No unassigned investors in the pool."
                : "No investors to show."}
        </p>
      ) : (
```

(h) Render the pager under the table. Immediately after the closing `</div>` of `.table-wrap` (line 276), inside the same `)` branch, add:

```tsx
        {paged.pageCount > 1 ? (
          <nav className="apply-actions stack-6" aria-label="Investor pages">
            {paged.page > 1 ? (
              <Link
                className="btn btn-ghost btn-sm"
                href={buildHref({
                  filter: pendingQueue ? "pending" : unassignedOnly ? "unassigned" : undefined,
                  account,
                  application,
                  kyc,
                  q: q || undefined,
                  page: String(paged.page - 1)
                })}
              >
                Previous
              </Link>
            ) : null}
            <span className="field-hint">
              Page {paged.page} of {paged.pageCount} · {paged.total} investors
            </span>
            {paged.page < paged.pageCount ? (
              <Link
                className="btn btn-ghost btn-sm"
                href={buildHref({
                  filter: pendingQueue ? "pending" : unassignedOnly ? "unassigned" : undefined,
                  account,
                  application,
                  kyc,
                  q: q || undefined,
                  page: String(paged.page + 1)
                })}
              >
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
```

No new CSS and no inline styles: `apply-actions` (globals.css:2351) + `stack-6` (globals.css:151) are existing utilities; `btn-sm` is 42px tall, satisfying the ≥40px tap-target rule.

Inline agent assignment keeps working untouched: `AssignInvestorForm` calls `router.refresh()` on success (`components/assign-investor-form.tsx:32`), which re-renders the server page with the same `searchParams` (filters, `q`, `page` all preserved). `assignInvestor` already revalidates `/admin/investors` (`lib/investors/admin-actions.ts:91`). The `key={`${investor.id}:${investor.assignedAgentId ?? "pool"}`}` remount keeps the select in sync after a refresh.

- [ ] **Step 5: verify**

```bash
npx tsc --noEmit
npx vitest run
```

Both green (no page-level unit test exists for this route; behaviour is covered by the helper tests plus typecheck — the page change is markup/wiring only).

- [ ] **Step 6: commit**

```bash
git add apps/web/app/admin/investors/page.tsx
git commit -m "Add search + 25/page pagination to /admin/investors, preserving filters and inline assignment"
```

---

### Task 5: "Holdings & Payments" tab on the investor record

**Files:**
- Modify: `apps/web/lib/investors/queries.ts` (extend `getInvestorApplicationBundle`)
- Modify: `apps/web/lib/portal/labels.ts` (add `HOLDING_STATUS_LABEL`)
- Modify: `apps/web/app/admin/investors/[investorId]/page.tsx`
- Modify: `apps/web/components/admin-investor-detail-tabs.tsx`
- Test: `apps/web/tests/investor-portfolio-bundle.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `InvestorHoldingRow` (exported type from `@/lib/investors/queries`):
    `{ id: string; amountEur: number; targetYieldPct: string; status: "active" | "closed"; confirmedAt: Date; assetName: string; assetSlug: string }`
  - `InvestorDistributionRow` (exported type from `@/lib/investors/queries`):
    `DistributionRow & { createdAt: Date }` where `DistributionRow` is imported from `@/lib/portfolio/distributions`
  - `getInvestorApplicationBundle(investorId)` now returns `{ application, kycDocs, interests, holdings, distributions }` (same scoped signature; consumed by the detail page and by Task 6's page wiring, which adds an `activity` field alongside — Task 6 uses its own query, not this bundle).
  - `HOLDING_STATUS_LABEL: Record<string, string>` from `@/lib/portal/labels`

- [ ] **Step 1: write the failing test**

Create `apps/web/tests/investor-portfolio-bundle.test.ts` (chain-mock style of `tests/access-own-events.test.ts`; generic queued chains because the bundle runs six selects in order):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  investorVisibleToStaff: vi.fn()
}));
vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
  assets: {},
  distributions: {},
  documents: {},
  holdings: {},
  interests: {},
  investorApplications: {},
  investors: {},
  staffProfiles: {}
}));

import { investorVisibleToStaff, requireStaff } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { getInvestorApplicationBundle } from "@/lib/investors/queries";

const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

/**
 * Queue one select chain resolving to `rows`. Every builder method returns the
 * same thenable chain, so it tolerates from → [innerJoin] → where → [orderBy]
 * → [limit] in any combination the bundle uses.
 */
function queueSelect(rows: unknown) {
  const chain: Record<string, unknown> = {};
  const thenable = Object.assign(Promise.resolve(rows), chain);
  chain.where = () => thenable;
  chain.innerJoin = () => thenable;
  chain.leftJoin = () => thenable;
  chain.orderBy = () => thenable;
  chain.limit = () => Promise.resolve(rows);
  selectMock.mockImplementationOnce(() => ({ from: () => thenable }));
}

const SUPER_ADMIN = {
  user: { id: "user-1", email: "admin@example.com" },
  staff: { id: "staff-1", role: "super_admin", ibId: null },
  role: "super_admin"
} as const;

describe("getInvestorApplicationBundle portfolio fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireStaff).mockResolvedValue(SUPER_ADMIN as never);
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
  });

  it("returns holdings with asset names and distributions with numeric amounts", async () => {
    queueSelect([{ assignedAgentId: null, ibId: null }]); // scoped investor lookup
    queueSelect([]); // application
    queueSelect([]); // kyc docs
    queueSelect([]); // interests
    queueSelect([
      {
        id: "h1",
        amountEur: 25000,
        targetYieldPct: "8.50",
        status: "active",
        confirmedAt: new Date("2026-01-10T00:00:00Z"),
        assetName: "M12 Services",
        assetSlug: "m12-services"
      }
    ]); // holdings
    queueSelect([
      {
        id: "d1",
        amountEur: 425,
        type: "income",
        status: "paid",
        periodLabel: "2026-Q1",
        paidAt: new Date("2026-04-05T00:00:00Z"),
        createdAt: new Date("2026-04-05T00:00:00Z")
      }
    ]); // distributions

    const bundle = await getInvestorApplicationBundle("inv-1");

    expect(bundle.holdings).toEqual([
      {
        id: "h1",
        amountEur: 25000,
        targetYieldPct: "8.50",
        status: "active",
        confirmedAt: new Date("2026-01-10T00:00:00Z"),
        assetName: "M12 Services",
        assetSlug: "m12-services"
      }
    ]);
    expect(bundle.distributions).toHaveLength(1);
    expect(bundle.distributions[0]).toMatchObject({
      id: "d1",
      amountEur: 425,
      type: "income",
      status: "paid"
    });
    expect(typeof bundle.distributions[0].amountEur).toBe("number");
  });

  it("throws NOT_FOUND when the investor is out of the staff member's scope", async () => {
    vi.mocked(investorVisibleToStaff).mockReturnValue(false);
    queueSelect([{ assignedAgentId: "agent-9", ibId: "ib-9" }]);

    await expect(getInvestorApplicationBundle("inv-1")).rejects.toThrow("NOT_FOUND");
  });
});
```

Run — expected failure (`bundle.holdings` is `undefined`, type errors on the new fields):

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
npx vitest run tests/investor-portfolio-bundle.test.ts
```

- [ ] **Step 2: extend the bundle query**

In `apps/web/lib/investors/queries.ts`:

(a) Update the drizzle import line (currently `import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";` — unchanged) and the `@/lib/db` import (lines 4-12) to add `distributions` and `holdings`:

```ts
import {
  assets,
  db,
  distributions,
  documents,
  holdings,
  interests,
  investorApplications,
  investors,
  staffProfiles
} from "@/lib/db";
```

Add a type import after it:

```ts
import type { DistributionRow } from "@/lib/portfolio/distributions";
```

(b) Add the row types after `InvestorInterestRow` (line 171):

```ts
export type InvestorHoldingRow = {
  id: string;
  amountEur: number;
  targetYieldPct: string;
  status: "active" | "closed";
  confirmedAt: Date;
  assetName: string;
  assetSlug: string;
};

/** DistributionRow plus createdAt so scheduled rows (paidAt null) still show a date. */
export type InvestorDistributionRow = DistributionRow & { createdAt: Date };
```

(c) Change the bundle signature (lines 173-177) to:

```ts
export async function getInvestorApplicationBundle(investorId: string): Promise<{
  application: InvestorApplicationRow | null;
  kycDocs: InvestorKycDocRow[];
  interests: InvestorInterestRow[];
  holdings: InvestorHoldingRow[];
  distributions: InvestorDistributionRow[];
}> {
```

(d) Add the two selects after the `interestRows` query (ends line 244), mirroring `listHoldingsWithAssets` (`lib/portfolio/queries.ts:82`) and `listDistributionsForInvestor` (`lib/portfolio/distributions.ts:14`):

```ts
  const holdingRows = await db
    .select({
      id: holdings.id,
      amountEur: holdings.amountEur,
      targetYieldPct: holdings.targetYieldPct,
      status: holdings.status,
      confirmedAt: holdings.confirmedAt,
      assetName: assets.name,
      assetSlug: assets.slug
    })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(eq(holdings.investorId, investorId))
    .orderBy(desc(holdings.confirmedAt));

  const distributionRows = await db
    .select({
      id: distributions.id,
      amountEur: distributions.amountEur,
      type: distributions.type,
      status: distributions.status,
      periodLabel: distributions.periodLabel,
      paidAt: distributions.paidAt,
      createdAt: distributions.createdAt
    })
    .from(distributions)
    .where(eq(distributions.investorId, investorId))
    .orderBy(desc(distributions.paidAt), desc(distributions.createdAt));
```

(e) Extend the return (lines 246-250):

```ts
  return {
    application: application ?? null,
    kycDocs: docs,
    interests: interestRows,
    holdings: holdingRows,
    distributions: distributionRows.map((r) => ({ ...r, amountEur: Number(r.amountEur) }))
  };
```

Run — expected pass:

```bash
npx vitest run tests/investor-portfolio-bundle.test.ts
```

- [ ] **Step 3: add the holding-status label map**

In `apps/web/lib/portal/labels.ts`, append:

```ts
export const HOLDING_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  closed: "Closed"
};
```

- [ ] **Step 4: pass the new data through the detail page**

In `apps/web/app/admin/investors/[investorId]/page.tsx`:

(a) Extend the imports from `@/lib/investors/queries` (lines 15-20) with the new types, and declare two locals next to the existing ones (lines 36-40):

```ts
import {
  getInvestorApplicationBundle,
  type InvestorApplicationRow,
  type InvestorDistributionRow,
  type InvestorHoldingRow,
  type InvestorInterestRow,
  type InvestorKycDocRow
} from "@/lib/investors/queries";
```

```ts
  let interests: InvestorInterestRow[] = [];
  let holdings: InvestorHoldingRow[] = [];
  let distributions: InvestorDistributionRow[] = [];
```

(b) Destructure them from the bundle (after line 49 `interests = bundle.interests;`):

```ts
    holdings = bundle.holdings;
    distributions = bundle.distributions;
```

(c) Pass them to the tabs component (lines 69-75):

```tsx
        <AdminInvestorDetailTabs
          investor={investor}
          application={application}
          kycDocs={kycDocs}
          interests={interests}
          holdings={holdings}
          distributions={distributions}
          events={events}
        />
```

- [ ] **Step 5: add the tab to `AdminInvestorDetailTabs`**

In `apps/web/components/admin-investor-detail-tabs.tsx`:

(a) Extend imports — the type import block (lines 11-15) becomes:

```ts
import type {
  InvestorApplicationRow,
  InvestorDistributionRow,
  InvestorHoldingRow,
  InvestorInterestRow,
  InvestorKycDocRow
} from "@/lib/investors/queries";
import { formatEur, formatYieldPct } from "@/lib/format";
import { HOLDING_STATUS_LABEL } from "@/lib/portal/labels";
import {
  formatDistributionStatus,
  formatDistributionType
} from "@/lib/portfolio/distributions";
```

(Replace the existing `import { formatEur } from "@/lib/format";` at line 16.)

(b) Insert the new tab between KYC and Interests — the `TABS` array (lines 18-24) becomes:

```ts
const TABS = [
  { id: "profile", label: "Profile" },
  { id: "application", label: "Application" },
  { id: "kyc", label: "KYC" },
  { id: "holdings", label: "Holdings & Payments" },
  { id: "interests", label: "Interests" },
  { id: "access", label: "Access" }
] as const;
```

(c) Add the new props (lines 33-45):

```tsx
export function AdminInvestorDetailTabs({
  investor,
  application,
  kycDocs,
  interests,
  holdings,
  distributions,
  events
}: {
  investor: InvestorDetail;
  application: InvestorApplicationRow | null;
  kycDocs: InvestorKycDocRow[];
  interests: InvestorInterestRow[];
  holdings: InvestorHoldingRow[];
  distributions: InvestorDistributionRow[];
  events: AccessEventRow[];
}) {
```

(d) Add the tab panel between the `kyc` and `interests` blocks (insert before `{tab === "interests" ? (` at line 240). Both tables get `.table-wrap`; statuses go through label/format helpers, never raw enums:

```tsx
      {tab === "holdings" ? (
        <>
          <AdminSection title="Holdings">
            {holdings.length === 0 ? (
              <p className="lead">No holdings yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Amount</th>
                      <th>Target yield</th>
                      <th>Status</th>
                      <th>Confirmed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/opportunities/${row.assetSlug}`}>{row.assetName}</Link>
                        </td>
                        <td>{formatEur(row.amountEur)}</td>
                        <td>{formatYieldPct(row.targetYieldPct)}</td>
                        <td>{HOLDING_STATUS_LABEL[row.status] ?? row.status}</td>
                        <td>{row.confirmedAt.toLocaleDateString("en-IE")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminSection>
          <AdminSection title="Payments">
            {distributions.length === 0 ? (
              <p className="lead">No payments recorded yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributions.map((row) => (
                      <tr key={row.id}>
                        <td>{row.periodLabel ?? "—"}</td>
                        <td>{formatDistributionType(row.type)}</td>
                        <td>{formatEur(row.amountEur)}</td>
                        <td>{formatDistributionStatus(row.status)}</td>
                        <td>
                          {(row.paidAt ?? row.createdAt).toLocaleDateString("en-IE")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminSection>
        </>
      ) : null}
```

(`formatYieldPct` exists at `lib/format.ts:9` and accepts `string | number`; the `?? row.status` fallback matches the existing `label()` helper style on the list page.)

- [ ] **Step 6: verify**

```bash
npx tsc --noEmit
npx vitest run
```

Both green.

- [ ] **Step 7: commit**

```bash
git add apps/web/lib/investors/queries.ts apps/web/lib/portal/labels.ts \
  "apps/web/app/admin/investors/[investorId]/page.tsx" \
  apps/web/components/admin-investor-detail-tabs.tsx \
  apps/web/tests/investor-portfolio-bundle.test.ts
git commit -m "Add Holdings & Payments tab to the staff investor record"
```

---

### Task 6: "Activity" tab — merged audit/notes timeline + `investor_notes` + `addInvestorNote`

**Files:**
- Modify: `apps/web/lib/db/schema.ts` (add `investorNotes` table)
- Create: `apps/web/drizzle/0021_<generated>.sql` via `npm run db:generate` (+ `drizzle/meta` snapshot — generated, never hand-edited)
- Create: `apps/web/lib/investors/activity.ts` (timeline query + friendly-line + merge helpers)
- Create: `apps/web/lib/investors/note-actions.ts` (`addInvestorNote` server action)
- Create: `apps/web/components/admin-investor-note-form.tsx` (composer)
- Modify: `apps/web/app/admin/investors/[investorId]/page.tsx`
- Modify: `apps/web/components/admin-investor-detail-tabs.tsx`
- Test: `apps/web/tests/investor-activity.test.ts`, `apps/web/tests/investor-notes.test.ts`

**Interfaces:**
- Consumes: `HOLDING_STATUS_LABEL` is unaffected; the tabs component modified here is the one Task 5 produced (tab list + props). Runs after Task 5.
- Produces:
  - `investorNotes` table export from `@/lib/db` (schema re-export)
  - `InvestorActivityItem` (from `@/lib/investors/activity`):
    `{ id: string; kind: "event" | "note"; createdAt: Date; line: string; body: string | null; authorEmail: string | null }`
  - `listInvestorActivityForStaff(investorId: string): Promise<InvestorActivityItem[]>` — scoped (`investorVisibleToStaff`, throws `Error("NOT_FOUND")` when missing/out of scope), merged newest-first.
  - `formatInvestorActivityLine(action: string, payload: Record<string, unknown>): string` — pure friendly-line mapper.
  - `mergeActivityItems(events, notes): InvestorActivityItem[]` — pure merge/sort helper.
  - `addInvestorNote(input: { investorId: string; body: string }): Promise<{ ok: true; noteId: string } | { ok: false; error: string }>` — server action.

- [ ] **Step 1: add the schema table and generate the migration**

In `apps/web/lib/db/schema.ts`, add after the `auditEvents` table (ends line 499):

```ts
/** Staff-authored notes on an investor record; surfaced in the Activity tab timeline. */
export const investorNotes = pgTable(
  "investor_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id),
    authorStaffId: uuid("author_staff_id")
      .notNull()
      .references(() => staffProfiles.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("investor_notes_investor_id_idx").on(t.investorId)]
);
```

(`uuid`, `text`, `timestamp`, `pgTable`, `index` are all already imported in this file.)

Generate the migration (head is 0020, so this produces `0021_*.sql`; never edit applied migrations):

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
npm run db:generate
```

Inspect the generated file: it must contain exactly one `CREATE TABLE "investor_notes"` with the two FK constraints and the `investor_notes_investor_id_idx` index — same style as `0020_giant_amazoness.sql`.

- [ ] **Step 2: commit schema + migration**

```bash
git add apps/web/lib/db/schema.ts apps/web/drizzle
git commit -m "Add investor_notes table for staff activity notes"
```

- [ ] **Step 3: write the failing activity-helper tests**

Create `apps/web/tests/investor-activity.test.ts` (pure, no mocks — style of `tests/investor-scope.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import {
  formatInvestorActivityLine,
  mergeActivityItems,
  type InvestorActivityEventRow,
  type InvestorActivityNoteRow
} from "@/lib/investors/activity";

describe("formatInvestorActivityLine", () => {
  it("maps known actions to friendly lines", () => {
    expect(formatInvestorActivityLine("investor.created", {})).toBe("Investor record created");
    expect(formatInvestorActivityLine("investor.assigned", {})).toBe("Assigned to an agent");
    expect(formatInvestorActivityLine("investor.invited", {})).toBe("Portal invite sent");
    expect(formatInvestorActivityLine("investor.note_added", {})).toBe("Note added");
    expect(formatInvestorActivityLine("investor.two_factor_reset", {})).toBe("Two-factor authentication reset");
    expect(formatInvestorActivityLine("investor.password_set", {})).toBe("Password set");
    expect(formatInvestorActivityLine("investor.erased", {})).toBe("Investor data erased (GDPR)");
    expect(formatInvestorActivityLine("application.submitted", {})).toBe("Application submitted");
    expect(formatInvestorActivityLine("application.contacted", {})).toBe("Applicant contacted");
    expect(formatInvestorActivityLine("application.rejected", {})).toBe("Application rejected");
    expect(formatInvestorActivityLine("kyc.document_uploaded", {})).toBe("KYC document uploaded");
    expect(formatInvestorActivityLine("kyc.submitted", {})).toBe("KYC submitted for review");
    expect(formatInvestorActivityLine("kyc.approved", {})).toBe("KYC approved");
    expect(formatInvestorActivityLine("kyc.rejected", {})).toBe("KYC rejected");
    expect(formatInvestorActivityLine("kyc.assisted_upload", {})).toBe("KYC document uploaded by staff");
    expect(formatInvestorActivityLine("onboarding.completed", {})).toBe("Onboarding completed");
    expect(formatInvestorActivityLine("onboarding.assisted_profile_saved", {})).toBe("Profile saved by staff");
    expect(formatInvestorActivityLine("onboarding.assisted_completed", {})).toBe("Onboarding completed by staff");
    expect(formatInvestorActivityLine("aml.screening_recorded", {})).toBe("AML screening recorded");
  });

  it("humanizes unknown actions instead of showing a raw enum string", () => {
    expect(formatInvestorActivityLine("investor.future_thing", {})).toBe("Investor future thing");
  });
});

describe("mergeActivityItems", () => {
  const events: InvestorActivityEventRow[] = [
    { id: "e1", action: "investor.created", createdAt: new Date("2026-01-01T10:00:00Z"), payload: {} },
    { id: "e2", action: "kyc.approved", createdAt: new Date("2026-01-03T10:00:00Z"), payload: {} }
  ];
  const notes: InvestorActivityNoteRow[] = [
    { id: "n1", body: "Called about ticket size", authorEmail: "agent@example.com", createdAt: new Date("2026-01-02T10:00:00Z") }
  ];

  it("merges events and notes newest-first", () => {
    const items = mergeActivityItems(events, notes);
    expect(items.map((i) => i.id)).toEqual(["e2", "n1", "e1"]);
    expect(items[1]).toMatchObject({
      kind: "note",
      body: "Called about ticket size",
      authorEmail: "agent@example.com",
      line: "Note added"
    });
    expect(items[0]).toMatchObject({ kind: "event", line: "KYC approved", body: null });
  });

  it("handles empty inputs", () => {
    expect(mergeActivityItems([], [])).toEqual([]);
  });
});
```

Run — expected failure (module does not exist):

```bash
npx vitest run tests/investor-activity.test.ts
```

- [ ] **Step 4: implement `lib/investors/activity.ts`**

Create `apps/web/lib/investors/activity.ts`. The scoped query mirrors `getInvestorApplicationBundle`'s lookup exactly; the friendly-line map covers every `entityType: "investor"` action currently written (see Conventions above):

```ts
import { and, desc, eq } from "drizzle-orm";
import { investorVisibleToStaff, requireStaff } from "@/lib/auth/staff";
import { auditEvents, db, investorNotes, investors, staffProfiles } from "@/lib/db";

/**
 * Activity timeline for the staff investor record: audit events
 * (entityType "investor") merged with manual staff notes, newest first.
 * Plain module (no "use server"): read-side only, mutations live in
 * lib/investors/note-actions.ts.
 */

export type InvestorActivityEventRow = {
  id: string;
  action: string;
  createdAt: Date;
  payload: Record<string, unknown>;
};

export type InvestorActivityNoteRow = {
  id: string;
  body: string;
  authorEmail: string;
  createdAt: Date;
};

export type InvestorActivityItem = {
  id: string;
  kind: "event" | "note";
  createdAt: Date;
  /** Friendly one-liner shown in the timeline. */
  line: string;
  /** Note body (notes only; null for system events). */
  body: string | null;
  /** Note author email (notes only; null for system events). */
  authorEmail: string | null;
};

const ACTIVITY_LINE: Record<string, string> = {
  "investor.created": "Investor record created",
  "investor.assigned": "Assigned to an agent",
  "investor.invited": "Portal invite sent",
  "investor.note_added": "Note added",
  "investor.two_factor_reset": "Two-factor authentication reset",
  "investor.password_set": "Password set",
  "investor.erased": "Investor data erased (GDPR)",
  "application.submitted": "Application submitted",
  "application.contacted": "Applicant contacted",
  "application.rejected": "Application rejected",
  "kyc.document_uploaded": "KYC document uploaded",
  "kyc.submitted": "KYC submitted for review",
  "kyc.approved": "KYC approved",
  "kyc.rejected": "KYC rejected",
  "kyc.assisted_upload": "KYC document uploaded by staff",
  "onboarding.completed": "Onboarding completed",
  "onboarding.assisted_profile_saved": "Profile saved by staff",
  "onboarding.assisted_completed": "Onboarding completed by staff",
  "aml.screening_recorded": "AML screening recorded"
};

export function formatInvestorActivityLine(
  action: string,
  _payload: Record<string, unknown>
): string {
  const known = ACTIVITY_LINE[action];
  if (known) return known;
  // Unknown future actions: humanize ("investor.future_thing" → "Investor future thing")
  return action
    .replace(/[._]+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export function mergeActivityItems(
  events: InvestorActivityEventRow[],
  notes: InvestorActivityNoteRow[]
): InvestorActivityItem[] {
  const items: InvestorActivityItem[] = [
    ...events.map((e) => ({
      id: e.id,
      kind: "event" as const,
      createdAt: e.createdAt,
      line: formatInvestorActivityLine(e.action, e.payload),
      body: null,
      authorEmail: null
    })),
    ...notes.map((n) => ({
      id: n.id,
      kind: "note" as const,
      createdAt: n.createdAt,
      line: formatInvestorActivityLine("investor.note_added", {}),
      body: n.body,
      authorEmail: n.authorEmail
    }))
  ];
  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

const ACTIVITY_LIMIT = 50;

export async function listInvestorActivityForStaff(
  investorId: string
): Promise<InvestorActivityItem[]> {
  const staff = await requireStaff();

  const [investor] = await db
    .select({ assignedAgentId: investors.assignedAgentId, ibId: investors.ibId })
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);

  if (!investor) {
    throw new Error("NOT_FOUND");
  }

  if (
    !investorVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      investor: { assignedAgentId: investor.assignedAgentId, ibId: investor.ibId }
    })
  ) {
    throw new Error("NOT_FOUND");
  }

  const eventRows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      createdAt: auditEvents.createdAt,
      payload: auditEvents.payload
    })
    .from(auditEvents)
    .where(and(eq(auditEvents.entityType, "investor"), eq(auditEvents.entityId, investorId)))
    .orderBy(desc(auditEvents.createdAt))
    .limit(ACTIVITY_LIMIT);

  const noteRows = await db
    .select({
      id: investorNotes.id,
      body: investorNotes.body,
      createdAt: investorNotes.createdAt,
      authorEmail: staffProfiles.email
    })
    .from(investorNotes)
    .innerJoin(staffProfiles, eq(investorNotes.authorStaffId, staffProfiles.id))
    .where(eq(investorNotes.investorId, investorId))
    .orderBy(desc(investorNotes.createdAt))
    .limit(ACTIVITY_LIMIT);

  return mergeActivityItems(eventRows, noteRows).slice(0, ACTIVITY_LIMIT);
}
```

Run — expected pass:

```bash
npx vitest run tests/investor-activity.test.ts
```

- [ ] **Step 5: write the failing `addInvestorNote` tests**

Create `apps/web/tests/investor-notes.test.ts` (style of `tests/leads-admin-actions.test.ts`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  investorVisibleToStaff: vi.fn()
}));
vi.mock("@/lib/db", () => ({
  db: { insert: vi.fn(), select: vi.fn() },
  auditEvents: {},
  investorNotes: {},
  investors: {}
}));

import { revalidatePath } from "next/cache";
import { investorVisibleToStaff, requireStaff } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { addInvestorNote } from "@/lib/investors/note-actions";

const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>;
const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

const AGENT = {
  user: { id: "user-1", email: "agent@example.com" },
  staff: { id: "staff-1", role: "agent", ibId: "ib-1" },
  role: "agent"
} as const;

/** Queue the scoped investor lookup (select → from → where → limit). */
function mockInvestorLookup(row: unknown) {
  selectMock.mockImplementationOnce(() => ({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(row ? [row] : []) }) })
  }));
}

/** Queue the note insert returning `rows`; returns a spy on values(). */
function mockNoteInsert(rows: unknown[]) {
  const values = vi.fn(() => ({ returning: () => Promise.resolve(rows) }));
  insertMock.mockImplementationOnce(() => ({ values }));
  return values;
}

describe("addInvestorNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireStaff).mockResolvedValue(AGENT as never);
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
  });

  it("rejects unauthenticated callers with a friendly error", async () => {
    vi.mocked(requireStaff).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await addInvestorNote({ investorId: "inv-1", body: "hello" });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns not-found when the investor is out of scope", async () => {
    vi.mocked(investorVisibleToStaff).mockReturnValue(false);
    mockInvestorLookup({ assignedAgentId: "agent-9", ibId: "ib-9" });

    const result = await addInvestorNote({ investorId: "inv-1", body: "hello" });

    expect(result).toEqual({ ok: false, error: "Investor not found." });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("validates the body", async () => {
    mockInvestorLookup({ assignedAgentId: "staff-1", ibId: "ib-1" });

    expect(await addInvestorNote({ investorId: "inv-1", body: "   " })).toEqual({
      ok: false,
      error: "Note cannot be empty."
    });
    expect(await addInvestorNote({ investorId: "inv-1", body: "x".repeat(2001) })).toEqual({
      ok: false,
      error: "Note is too long (2000 characters max)."
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts the note, writes the audit event, and revalidates the record", async () => {
    mockInvestorLookup({ assignedAgentId: "staff-1", ibId: "ib-1" });
    const noteValues = mockNoteInsert([{ id: "note-1" }]);
    const auditValues = vi.fn();
    insertMock.mockImplementationOnce(() => ({ values: auditValues }));

    const result = await addInvestorNote({ investorId: "inv-1", body: "  Called about ticket size  " });

    expect(result).toEqual({ ok: true, noteId: "note-1" });
    expect(noteValues).toHaveBeenCalledWith({
      investorId: "inv-1",
      authorStaffId: "staff-1",
      body: "Called about ticket size"
    });
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "investor.note_added",
        entityType: "investor",
        entityId: "inv-1",
        payload: { noteId: "note-1" }
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/investors/inv-1");
  });
});
```

Run — expected failure (module does not exist):

```bash
npx vitest run tests/investor-notes.test.ts
```

- [ ] **Step 6: implement `addInvestorNote`**

Create `apps/web/lib/investors/note-actions.ts` (action shape copied from `assignInvestor`, scope check copied from `getInvestorApplicationBundle`):

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { investorVisibleToStaff, requireStaff } from "@/lib/auth/staff";
import { auditEvents, db, investorNotes, investors } from "@/lib/db";

export type AddInvestorNoteResult = { ok: true; noteId: string } | { ok: false; error: string };

const MAX_NOTE_LENGTH = 2000;

export async function addInvestorNote(input: {
  investorId: string;
  body: string;
}): Promise<AddInvestorNoteResult> {
  let staff;
  try {
    staff = await requireStaff();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { ok: false, error: "Forbidden." };
    throw error;
  }

  const [investor] = await db
    .select({ assignedAgentId: investors.assignedAgentId, ibId: investors.ibId })
    .from(investors)
    .where(eq(investors.id, input.investorId))
    .limit(1);

  if (
    !investor ||
    !investorVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      investor: { assignedAgentId: investor.assignedAgentId, ibId: investor.ibId }
    })
  ) {
    return { ok: false, error: "Investor not found." };
  }

  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: "Note cannot be empty." };
  }
  if (body.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Note is too long (${MAX_NOTE_LENGTH} characters max).` };
  }

  const [note] = await db
    .insert(investorNotes)
    .values({
      investorId: input.investorId,
      authorStaffId: staff.staff.id,
      body
    })
    .returning({ id: investorNotes.id });

  await db.insert(auditEvents).values({
    actorUserId: staff.user.id,
    action: "investor.note_added",
    entityType: "investor",
    entityId: input.investorId,
    payload: { noteId: note.id }
  });

  revalidatePath(`/admin/investors/${input.investorId}`);
  return { ok: true, noteId: note.id };
}
```

Run — expected pass:

```bash
npx vitest run tests/investor-notes.test.ts
```

- [ ] **Step 7: commit the activity lib + action**

```bash
git add apps/web/lib/investors/activity.ts apps/web/lib/investors/note-actions.ts \
  apps/web/tests/investor-activity.test.ts apps/web/tests/investor-notes.test.ts
git commit -m "Add investor activity timeline query and addInvestorNote action"
```

- [ ] **Step 8: the note composer component**

Create `apps/web/components/admin-investor-note-form.tsx` (client-component shape copied from `components/assign-investor-form.tsx`; submit button uses `btn btn-primary btn-sm` = 42px tap target):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addInvestorNote } from "@/lib/investors/note-actions";

export function AdminInvestorNoteForm({ investorId }: { investorId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addInvestorNote({ investorId, body });
      if (result.ok) {
        setBody("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form className="admin-investor-note-form" onSubmit={handleSubmit}>
      <label>
        Add a note
        <textarea
          name="body"
          rows={3}
          value={body}
          maxLength={2000}
          disabled={isPending}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What happened? Calls, promises, context…"
        />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-sm" disabled={isPending}>
        {isPending ? "Saving…" : "Save note"}
      </button>
    </form>
  );
}
```

- [ ] **Step 9: wire the Activity tab through the page and tabs component**

(a) In `apps/web/app/admin/investors/[investorId]/page.tsx`, add the import and fetch. Import (with the other lib imports):

```ts
import { listInvestorActivityForStaff, type InvestorActivityItem } from "@/lib/investors/activity";
```

Declare and fetch inside the existing `try` block (after `interests = bundle.interests;` and the Task 5 additions):

```ts
  let activity: InvestorActivityItem[] = [];
```

```ts
    activity = await listInvestorActivityForStaff(investorId);
```

Update the header subtitle (line 60) to match the new tab set:

```tsx
        subtitle="Profile, application, KYC, holdings, interests, activity, and access history."
```

Pass the prop:

```tsx
        <AdminInvestorDetailTabs
          investor={investor}
          application={application}
          kycDocs={kycDocs}
          interests={interests}
          holdings={holdings}
          distributions={distributions}
          activity={activity}
          events={events}
        />
```

Note: `listInvestorActivityForStaff` throws `NOT_FOUND` for out-of-scope investors, which the existing `catch` already routes to `notFound()` — but `getInvestorDetailForStaff` runs first and already guards, so this is defense in depth.

(b) In `apps/web/components/admin-investor-detail-tabs.tsx`:

Add imports:

```ts
import type { InvestorActivityItem } from "@/lib/investors/activity";
import { AdminInvestorNoteForm } from "@/components/admin-investor-note-form";
```

Insert the Activity tab between Interests and Access — the `TABS` array becomes the final spec order (Profile · Application · KYC · Holdings & Payments · Interests · Activity · Access):

```ts
const TABS = [
  { id: "profile", label: "Profile" },
  { id: "application", label: "Application" },
  { id: "kyc", label: "KYC" },
  { id: "holdings", label: "Holdings & Payments" },
  { id: "interests", label: "Interests" },
  { id: "activity", label: "Activity" },
  { id: "access", label: "Access" }
] as const;
```

Add the prop (both destructure and type):

```tsx
  activity,
```

```tsx
  activity: InvestorActivityItem[];
```

Add the panel between the `interests` and `access` blocks (before `{tab === "access" ? ...}`):

```tsx
      {tab === "activity" ? (
        <AdminSection title="Activity">
          <AdminInvestorNoteForm investorId={investor.id} />
          {activity.length === 0 ? (
            <p className="lead stack-6">No activity yet.</p>
          ) : (
            <ul className="admin-activity-list stack-6">
              {activity.map((item) => (
                <li key={`${item.kind}:${item.id}`} className="admin-activity-item">
                  <p>
                    <strong>{item.line}</strong>
                    {item.authorEmail ? ` — ${item.authorEmail}` : ""}
                  </p>
                  {item.body ? <p>{item.body}</p> : null}
                  <p className="field-hint">
                    {item.createdAt.toLocaleString("en-IE")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      ) : null}
```

- [ ] **Step 10: verify (full gate)**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

All three green (build additionally exercises the new server action + client component wiring and the migration is exercised by CI's `drizzle-kit migrate`).

- [ ] **Step 11: commit**

```bash
git add apps/web/components/admin-investor-note-form.tsx \
  "apps/web/app/admin/investors/[investorId]/page.tsx" \
  apps/web/components/admin-investor-detail-tabs.tsx
git commit -m "Add Activity tab with merged timeline and note composer to the investor record"
```

---

## Spec-B coverage check

- B.1 (list parity: search + 25/page pagination, status filters + inline assignment keep working) → Task 4.
- B.2 (Holdings & Payments tab: asset name, amount, target yield, status, confirmed date + distribution history) → Task 5.
- B.3 (Activity tab: merged `audit_events` friendly lines + `investor_notes` + composer + scoped `addInvestorNote` with `investor.note_added` audit) → Task 6.
- B.4 (tab order Profile · Application · KYC · Holdings & Payments · Interests · Activity · Access) → reached at Task 6 Step 9; intermediate order after Task 5 already places Holdings & Payments fourth.

Nothing in spec section B is left unmapped.
