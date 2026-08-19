# Parkwise CRM Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the admin back office into a simple, clean, familiar CRM: upgraded leads pipeline (search, pagination, stale flags, bulk actions), investor 360 (holdings & payments, activity timeline with notes), super-admin-only opportunity creation, and a CRM-style dashboard.

**Architecture:** Behavior changes funnel into pure `lib/` modules with vitest coverage (repo has no component-test harness); server actions stay scoped (`leadVisibleToStaff` / `investorVisibleToStaff` / `requireSuperAdmin`) with `{ ok, error }` returns and audit events. One new table (`investor_notes`) via a generated migration. UI follows the existing design system and the responsive standards from the previous UX round.

**Tech Stack:** Next.js 15 App Router, Better Auth, Postgres + Drizzle, vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-crm-redesign-design.md`

## Global Constraints

- Run all JS commands from `apps/web`; node/npm need `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` first.
- Server actions return `{ ok: true, ... }` / `{ ok: false, error }`; authorization inside the action.
- Scoping: `leadVisibleToStaff` (`lib/leads/scope.ts`) for leads, `investorVisibleToStaff` (`lib/auth/staff.ts`) for investors, `requireSuperAdmin` for asset creation; super admins unrestricted; out-of-scope targets get not-found-style errors.
- **Migration head is 0020** (AGENTS.md's "0017" is stale — update AGENTS.md after Task 6's migration lands as 0021). Never edit applied migrations; new ones via `npm run db:generate`.
- Every mutation writes an audit event; every table gets `.table-wrap`; tap targets ≥ 40px; no raw enum strings in UI (label maps); no inline styles where `stack-*` utilities exist.
- Verify before done: `npx tsc --noEmit`, `npx vitest run` (and `npm run build` where a task says so).

## Execution Order & Cross-Task Notes

- **Tasks run in numeric order.** Task 6 produces the migration (0021). Task 9 consumes patterns from earlier tasks.
- Task 2 produces `countStaleLeadsForStaff` in `lib/leads/queries.ts` and `lib/leads/labels.ts` (`LEAD_STATUS_LABEL`, `TERMINAL_LEAD_STATUSES`) — Task 9's stale-leads widget should **reuse `countStaleLeadsForStaff`** rather than its own duplicate helper if signatures align; otherwise keep its module-local one and note the duplication in the report.
- Task 6 produces `formatInvestorActivityLine`/`mergeActivityItems` (investor timeline); Task 9 produces `describeAuditEvent`/`formatRelativeTime` in `lib/admin/dashboard.ts` (dashboard feed). They serve different surfaces — both may exist; do not force unification.
- Task 1 adds an "All leads" section for super admins (they currently only see lead *lists*); the IB queue split moves into the query.
- Asset "payment frequency/term" map to the `contractual_monthly_rent` term + `leaseLabel` column — no schema change for Tasks 7-8.
- `listInvestorsForStaff()` signature must not change (dashboard uses it) — Task 4 layers search/pagination over its result.
- Divergences discovered during planning (already reflected in tasks): no existing audit_events read query; `actorUserId` is an auth-user id (join `user` for email); `distributions` has no due-date column ("due this month" = scheduled status count); lead scoping lives in `lib/leads/scope.ts`.

---
# Leads area — `/admin/leads` (Tasks 1–3)

Spec: `docs/superpowers/specs/2026-07-23-crm-redesign-design.md`, section A (bound by section E, cross-cutting standards).

Scope: `apps/web`. All commands run from `/Users/mac/Documents/Park/apps/web`, after:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
```

## Conventions used throughout (verified against real code)

- Server actions return `{ ok: true, ... }` / `{ ok: false, error }`; authz inside the action (house rule). Lead actions use `requireActor()` from `lib/leads/assign/shared.ts` and the `LeadActionResult` type.
- Lead scoping uses `leadVisibleToStaff({ role, staffId, lead: { assignedAgentId, ibId } })` from `@/lib/leads/scope` — **not** `investorVisibleToStaff` (that one is for investors and lives in `@/lib/auth/staff`).
- Audit pattern (copied exactly from `lib/leads/assign/status.ts`):
  ```ts
  await db.insert(auditEvents).values({
    actorUserId: staff.user.id,
    action: "lead.status_changed",
    entityType: "lead",
    entityId: lead.id,
    payload: { status: input.status, listId: lead.listId }
  });
  ```
- Revalidation after lead mutations: `revalidateLead(listId?, leadId?)` from `lib/leads/assign/shared.ts` (revalidates `/admin/leads`, `/admin`, and the two detail paths when ids are given).
- Label maps follow `lib/portal/labels.ts` / `lib/leads/outcomes.ts` (`leadCallOutcomeLabel`).
- Unit-test style follows `tests/leads-admin-actions.test.ts`; behavior against real SQL follows the integration harness `tests/integration/leads-assign-actions.integration.test.ts` (scratch Postgres via `tests/integration/helpers/db.ts`, fixtures via `tests/integration/helpers/fixtures.ts`, only the session mocked). Integration tests need `PARKWISE_TEST_DATABASE_URL` (or `DATABASE_URL`); without it they **skip cleanly (exit 0)** — check the output says "passed", not "skipped", when verifying.

## Divergences from the assignment's assumptions (verified in code)

1. **No existing "chip/select pattern" for stage filtering exists on any list page.** The only stage UI is the `<select>` inside `components/lead-followup-form.tsx` (`STATUS_OPTIONS`, lead detail page only). Task 1 introduces a shared `lib/leads/labels.ts` and a plain GET form with a `<select>` — the closest existing idiom.
2. **Super-admin `/admin/leads` has no leads table today** — it only shows lead *lists* (`listLeadListsForStaff`). "super_admin sees all" requires adding a new "All leads" section; Task 1 adds it.
3. **No admin page reads `searchParams` yet.** Task 1 introduces the Next 15 async-`searchParams` pattern (`searchParams: Promise<...>`).
4. **No amber badge class exists** in `app/globals.css`; the nearest is `.badge-status-declined` (orange tokens, line 1083). Task 2 adds a `.badge-stale` class next to it — no inline styles.
5. **The IB queue is currently filtered in-memory in the page** (`queueLeads = all.filter((lead) => lead.assignedAgentId === null)` in `app/admin/leads/page.tsx:32`). Task 1 moves the split into the query (`assignment: "unassigned" | "assigned"`); Task 3 then adds the terminal-status exclusion in that query branch, not in the page.
6. **`loadLead` in `lib/leads/assign/shared.ts` does not select `status`** (only `id, listId, ibId, assignedAgentId, investorId`). Task 3 adds it — needed for the converted-guard.
7. `setLeadStatus`'s `SETTABLE_STATUSES` (`new/contacted/qualified/unqualified/duplicate`) never includes `converted`, so the Task 3 guard only ever fires on leads already converted by the investor-linking flow — the guard is about *leaving* `converted`, which today is possible via any settable status.
8. Spec A.5 ("lead detail page stays as-is") maps to **no task** — verified: `app/admin/leads/lead/[leadId]/page.tsx` already matches the record pattern.

---

### Task 1: Server-side search + offset pagination on `/admin/leads`

**Files:**
- Create: `apps/web/lib/leads/labels.ts`
- Create: `apps/web/components/admin/leads-search-form.tsx`
- Create: `apps/web/components/admin/leads-pagination.tsx`
- Modify: `apps/web/lib/leads/queries.ts` (add `searchLeadsForStaff`, `LEADS_PAGE_SIZE`)
- Modify: `apps/web/app/admin/leads/page.tsx` (searchParams, search form, paginated tables, super-admin "All leads" section, stage labels)
- Modify: `apps/web/tests/integration/helpers/fixtures.ts` (`createLead` gains `fullName` / `lastActivityAt`)
- Test: `apps/web/tests/leads-labels.test.ts`
- Test: `apps/web/tests/integration/leads-search.integration.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces (later tasks rely on these exact names):
  - `lib/leads/labels.ts`: `LEAD_STATUS_VALUES`, `type LeadStatus`, `LEAD_STATUS_LABEL: Record<LeadStatus, string>`, `LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[]`, `TERMINAL_LEAD_STATUSES: readonly LeadStatus[]`
  - `lib/leads/queries.ts`: `LEADS_PAGE_SIZE` (= 25), `searchLeadsForStaff(input?: LeadSearchInput): Promise<LeadSearchResult>` where `LeadSearchInput = { q?: string; status?: string; page?: number; assignment?: "any" | "unassigned" | "assigned" }` and `LeadSearchResult = { rows: LeadRow[]; total: number; page: number; pageSize: number }`
  - `tests/integration/helpers/fixtures.ts`: `createLead(input: { ..., fullName?: string; lastActivityAt?: Date | null })`

- [ ] **Step 1: write the failing label-map test**

Create `apps/web/tests/leads-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_OPTIONS,
  LEAD_STATUS_VALUES,
  TERMINAL_LEAD_STATUSES
} from "@/lib/leads/labels";

describe("lead status labels", () => {
  it("labels every schema status (no raw enum strings in UI)", () => {
    for (const value of LEAD_STATUS_VALUES) {
      expect(LEAD_STATUS_LABEL[value]).toBeTruthy();
      expect(LEAD_STATUS_LABEL[value]).not.toBe(value);
    }
    expect(LEAD_STATUS_OPTIONS).toHaveLength(LEAD_STATUS_VALUES.length);
  });

  it("marks exactly unqualified/duplicate/converted as terminal", () => {
    expect([...TERMINAL_LEAD_STATUSES].sort()).toEqual([
      "converted",
      "duplicate",
      "unqualified"
    ]);
  });
});
```

Run — expect failure (module does not exist):

```bash
npx vitest run tests/leads-labels.test.ts
# FAIL — Cannot find module '@/lib/leads/labels'
```

- [ ] **Step 2: create `lib/leads/labels.ts`**

Create `apps/web/lib/leads/labels.ts`:

```ts
export const LEAD_STATUS_VALUES = [
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "duplicate",
  "converted"
] as const;

export type LeadStatus = (typeof LEAD_STATUS_VALUES)[number];

/** Friendly labels for raw enum values shown to staff (lib/portal/labels.ts pattern). */
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  unqualified: "Unqualified",
  duplicate: "Duplicate",
  converted: "Converted"
};

export const LEAD_STATUS_OPTIONS = LEAD_STATUS_VALUES.map((value) => ({
  value,
  label: LEAD_STATUS_LABEL[value]
}));

/**
 * Terminal stages — excluded from every workload/queue count, matching the
 * `not in ('unqualified','duplicate','converted')` filters already used in
 * listIbsWithWorkload / listAgentsWithWorkload / getLeadDashboardCounts.
 */
export const TERMINAL_LEAD_STATUSES: readonly LeadStatus[] = [
  "unqualified",
  "duplicate",
  "converted"
];
```

Run — expect pass:

```bash
npx vitest run tests/leads-labels.test.ts
# ✓ 2 passed
```

- [ ] **Step 3: extend `createLead` fixture and write the failing integration test**

In `apps/web/tests/integration/helpers/fixtures.ts`, change `createLead` (lines 142–164) from:

```ts
export async function createLead(input: {
  listId: string;
  email?: string;
  ibId?: string | null;
  assignedAgentId?: string | null;
  investorId?: string | null;
  status?: "new" | "contacted" | "qualified" | "unqualified" | "duplicate" | "converted";
}) {
  const [lead] = await db
    .insert(leads)
    .values({
      listId: input.listId,
      fullName: "Test Lead",
      email: input.email ?? uniqEmail("lead"),
      source: "csv",
      status: input.status ?? "new",
      ibId: input.ibId ?? null,
      assignedAgentId: input.assignedAgentId ?? null,
      investorId: input.investorId ?? null
    })
    .returning();
  return lead;
}
```

to:

```ts
export async function createLead(input: {
  listId: string;
  fullName?: string;
  email?: string;
  ibId?: string | null;
  assignedAgentId?: string | null;
  investorId?: string | null;
  status?: "new" | "contacted" | "qualified" | "unqualified" | "duplicate" | "converted";
  lastActivityAt?: Date | null;
}) {
  const [lead] = await db
    .insert(leads)
    .values({
      listId: input.listId,
      fullName: input.fullName ?? "Test Lead",
      email: input.email ?? uniqEmail("lead"),
      source: "csv",
      status: input.status ?? "new",
      ibId: input.ibId ?? null,
      assignedAgentId: input.assignedAgentId ?? null,
      investorId: input.investorId ?? null,
      ...(input.lastActivityAt !== undefined ? { lastActivityAt: input.lastActivityAt } : {})
    })
    .returning();
  return lead;
}
```

Create `apps/web/tests/integration/leads-search.integration.test.ts`:

```ts
/**
 * Integration tests for searchLeadsForStaff (lib/leads/queries.ts) — server-side
 * search, stage filter, and 25/page offset pagination with role scoping intact.
 * Real Postgres scratch database; only the session is mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sessionState = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(async () => sessionState.user),
  requireSessionUser: vi.fn(async () => {
    if (!sessionState.user) throw new Error("UNAUTHENTICATED");
    return sessionState.user;
  })
}));

import { LEADS_PAGE_SIZE, searchLeadsForStaff } from "@/lib/leads/queries";
import {
  describeIntegration,
  setupIntegrationDatabase,
  type IntegrationDbHandle
} from "./helpers/db";
import {
  createLead,
  createLeadList,
  createStaff,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(user: { id: string; email: string } | null) {
  sessionState.user = user;
}

type Staff = Awaited<ReturnType<typeof createStaff>>;

describeIntegration("searchLeadsForStaff (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Staff;
  let list: Awaited<ReturnType<typeof createLeadList>>;

  beforeAll(async () => {
    handle = await setupIntegrationDatabase();
    const adminEmail = uniqEmail("sa");
    process.env.SUPER_ADMIN_EMAILS = adminEmail;
    admin = await createStaff({ email: adminEmail, role: "super_admin" });
    list = await createLeadList(admin.profile.id);
  }, 120_000);

  afterAll(async () => {
    await handle?.teardown();
  });

  beforeEach(() => {
    signInAs(admin.authUser);
  });

  it("finds leads by case-insensitive name or email substring, scoped to the agent's book", async () => {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    const agent = await createStaff({
      email: uniqEmail("agent"),
      role: "agent",
      ibId: ib.profile.id
    });
    const own = await createLead({
      listId: list.id,
      fullName: "Ada SEARCHME Lovelace",
      email: uniqEmail("ada"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id
    });
    // Same substring, but unassigned in the IB queue — invisible to the agent.
    await createLead({
      listId: list.id,
      fullName: "Ada SEARCHME Clone",
      email: uniqEmail("clone"),
      ibId: ib.profile.id
    });

    signInAs(agent.authUser);
    const byName = await searchLeadsForStaff({ q: "searchme" });
    expect(byName.rows.map((row) => row.id)).toEqual([own.id]);

    const byEmail = await searchLeadsForStaff({ q: own.email.toUpperCase() });
    expect(byEmail.rows.map((row) => row.id)).toEqual([own.id]);
  });

  it("paginates 25 per page with a stable order and reports the total", async () => {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    for (let i = 0; i < 30; i += 1) {
      await createLead({
        listId: list.id,
        fullName: `Page ${String(i).padStart(2, "0")}`,
        email: uniqEmail("page"),
        ibId: ib.profile.id
      });
    }

    signInAs(ib.authUser);
    const page1 = await searchLeadsForStaff({ page: 1 });
    const page2 = await searchLeadsForStaff({ page: 2 });
    expect(LEADS_PAGE_SIZE).toBe(25);
    expect(page1.rows).toHaveLength(25);
    expect(page1.total).toBe(30);
    expect(page2.rows).toHaveLength(5);
    expect(page2.total).toBe(30);
    const ids = new Set([...page1.rows, ...page2.rows].map((row) => row.id));
    expect(ids.size).toBe(30);
  });

  it("filters by stage, ignores unknown stages, and splits an IB's queue from its team", async () => {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    const agent = await createStaff({
      email: uniqEmail("agent"),
      role: "agent",
      ibId: ib.profile.id
    });
    const queued = await createLead({
      listId: list.id,
      email: uniqEmail("q"),
      ibId: ib.profile.id,
      status: "contacted"
    });
    const teamed = await createLead({
      listId: list.id,
      email: uniqEmail("t"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id,
      status: "qualified"
    });

    signInAs(ib.authUser);
    const queue = await searchLeadsForStaff({ assignment: "unassigned" });
    expect(queue.rows.map((row) => row.id)).toEqual([queued.id]);
    const team = await searchLeadsForStaff({ assignment: "assigned" });
    expect(team.rows.map((row) => row.id)).toEqual([teamed.id]);

    const qualified = await searchLeadsForStaff({ status: "qualified" });
    expect(qualified.rows.map((row) => row.id)).toEqual([teamed.id]);

    const bogus = await searchLeadsForStaff({ status: "bogus" });
    expect(bogus.total).toBe(2);
  });

  it("lets a super_admin search across every book", async () => {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    const lead = await createLead({
      listId: list.id,
      fullName: "GLOBALSEARCH Unique",
      email: uniqEmail("g"),
      ibId: ib.profile.id
    });

    const result = await searchLeadsForStaff({ q: "globalsearch" });
    expect(result.rows.some((row) => row.id === lead.id)).toBe(true);
  });
});
```

Run — expect failure (`searchLeadsForStaff` is not a function / not exported):

```bash
npx vitest run tests/integration/leads-search.integration.test.ts
# FAIL — No "searchLeadsForStaff" export is defined on the "@/lib/leads/queries" mock
# (or: suite skips if PARKWISE_TEST_DATABASE_URL is unset — set it to see the real failure)
```

- [ ] **Step 4: add `searchLeadsForStaff` to `lib/leads/queries.ts`**

Change the drizzle import on line 1 from:

```ts
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
```

to:

```ts
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
```

Add the labels import after the `leadVisibleToStaff` import (line 13):

```ts
import { LEAD_STATUS_VALUES, type LeadStatus } from "./labels";
```

Append after `listLeadsForStaff` (i.e. directly before `export type IbWorkloadRow`, line 161):

```ts
export const LEADS_PAGE_SIZE = 25;

export type LeadSearchInput = {
  /** Case-insensitive substring matched against full name or email. */
  q?: string;
  /** Stage filter; unknown values are ignored. */
  status?: string;
  /** 1-based page; values < 1 clamp to 1. */
  page?: number;
  /**
   * "unassigned" = the IB queue (no agent yet); "assigned" = has an agent.
   * Defaults to both.
   */
  assignment?: "any" | "unassigned" | "assigned";
};

export type LeadSearchResult = {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Paginated, searchable lead list. Same role scoping as listLeadsForStaff:
 * super_admin sees all, an IB sees its queue + team, an agent sees its book.
 */
export async function searchLeadsForStaff(
  input?: LeadSearchInput
): Promise<LeadSearchResult> {
  const staff = await requireStaff();
  const assignedAgent = alias(staffProfiles, "assigned_agent");
  const ib = alias(staffProfiles, "ib");
  const assignedBy = alias(staffProfiles, "assigned_by");

  const conditions = [];
  if (staff.role === "ib") {
    // An IB sees its unassigned queue plus every lead owned by its team.
    conditions.push(eq(leads.ibId, staff.staff.id));
  } else if (staff.role !== "super_admin") {
    conditions.push(eq(leads.assignedAgentId, staff.staff.id));
  }

  const q = input?.q?.trim();
  if (q) {
    // Escape LIKE metacharacters so user input is matched literally.
    const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    conditions.push(or(ilike(leads.fullName, pattern), ilike(leads.email, pattern)));
  }

  if (input?.status && (LEAD_STATUS_VALUES as readonly string[]).includes(input.status)) {
    conditions.push(eq(leads.status, input.status as LeadStatus));
  }

  if (input?.assignment === "unassigned") {
    conditions.push(isNull(leads.assignedAgentId));
  } else if (input?.assignment === "assigned") {
    conditions.push(isNotNull(leads.assignedAgentId));
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const pageSize = LEADS_PAGE_SIZE;
  const page = Math.max(1, Math.floor(input?.page ?? 1));

  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(leads)
    .where(where);
  const total = Number(countRow?.total ?? 0);

  const rows = await db
    .select({
      id: leads.id,
      listId: leads.listId,
      fullName: leads.fullName,
      email: leads.email,
      phone: leads.phone,
      source: leads.source,
      sourceDetail: leads.sourceDetail,
      notes: leads.notes,
      status: leads.status,
      ibId: leads.ibId,
      ibEmail: ib.email,
      assignedAgentId: leads.assignedAgentId,
      assignedAgentEmail: assignedAgent.email,
      assignedByStaffId: leads.assignedByStaffId,
      assignedByEmail: assignedBy.email,
      assignedAt: leads.assignedAt,
      nextFollowUpAt: leads.nextFollowUpAt,
      lastActivityAt: leads.lastActivityAt,
      investorId: leads.investorId,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt
    })
    .from(leads)
    .leftJoin(assignedAgent, eq(leads.assignedAgentId, assignedAgent.id))
    .leftJoin(ib, eq(leads.ibId, ib.id))
    .leftJoin(assignedBy, eq(leads.assignedByStaffId, assignedBy.id))
    .where(where)
    // Secondary key keeps page boundaries stable when names collide.
    .orderBy(asc(leads.fullName), asc(leads.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total, page, pageSize };
}
```

Run — expect pass:

```bash
npx vitest run tests/integration/leads-search.integration.test.ts
# ✓ 4 passed (skips cleanly without PARKWISE_TEST_DATABASE_URL — set it to truly verify)
```

- [ ] **Step 5: create the search-form and pagination components**

Create `apps/web/components/admin/leads-search-form.tsx` (server component — a plain GET form, no client JS; a fresh search deliberately drops page params, resetting to page 1):

```tsx
import { LEAD_STATUS_OPTIONS } from "@/lib/leads/labels";

export function LeadsSearchForm({ q, status }: { q: string; status: string }) {
  return (
    <form method="get" action="/admin/leads" className="staff-action-row">
      <label className="form-field grow">
        <span>Search leads</span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Name or email"
        />
      </label>
      <label className="form-field">
        <span>Stage</span>
        <select name="status" defaultValue={status}>
          <option value="">All stages</option>
          {LEAD_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-ghost btn-sm">
        Search
      </button>
    </form>
  );
}
```

Create `apps/web/components/admin/leads-pagination.tsx` (server component; `pageParam` lets two paginated sections coexist on the IB view; buttons stay ≥40px via `btn btn-ghost btn-sm`):

```tsx
import Link from "next/link";

export function LeadsPagination({
  basePath,
  params,
  pageParam,
  page,
  total,
  pageSize
}: {
  basePath: string;
  /** Current search params to preserve (q/status/other section's page). */
  params: Record<string, string>;
  pageParam: string;
  page: number;
  total: number;
  pageSize: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  function href(target: number): string {
    const search = new URLSearchParams(params);
    if (target <= 1) {
      search.delete(pageParam);
    } else {
      search.set(pageParam, String(target));
    }
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="staff-action-row stack-3">
      {page > 1 ? (
        <Link className="btn btn-ghost btn-sm" href={href(page - 1)}>
          Previous
        </Link>
      ) : null}
      <span>
        Page {page} of {pages} · {total} leads
      </span>
      {page < pages ? (
        <Link className="btn btn-ghost btn-sm" href={href(page + 1)}>
          Next
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: rewrite `app/admin/leads/page.tsx` to use search + pagination**

Replace the whole file `apps/web/app/admin/leads/page.tsx` with (changes vs current: async `searchParams`; `searchLeadsForStaff` for IB/agent data; new super-admin "All leads" section; search form above each leads table; stage cells render `stageLabel(...)` instead of the raw enum; header counts use `total`; pagination under each table):

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { LeadsPagination } from "@/components/admin/leads-pagination";
import { LeadsSearchForm } from "@/components/admin/leads-search-form";
import { CreateLeadListForm } from "@/components/create-lead-list-form";
import { getStaffContext } from "@/lib/auth/staff";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads/labels";
import {
  LEADS_PAGE_SIZE,
  listLeadListsForStaff,
  searchLeadsForStaff,
  type LeadListRow,
  type LeadSearchResult
} from "@/lib/leads/queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const EMPTY_RESULT: LeadSearchResult = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: LEADS_PAGE_SIZE
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parsePage(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function stageLabel(status: string): string {
  return LEAD_STATUS_LABEL[status as LeadStatus] ?? status;
}

export default async function AdminLeadsPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const staff = await getStaffContext();
  if (!staff) redirect("/");

  const raw = await searchParams;
  const q = first(raw.q).trim();
  const status = first(raw.status).trim();
  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (status) baseParams.status = status;

  const isSuper = staff.role === "super_admin";
  const isIb = staff.role === "ib";

  let lists: LeadListRow[] = [];
  let allLeads = EMPTY_RESULT;
  let queueLeads = EMPTY_RESULT;
  let teamLeads = EMPTY_RESULT;
  try {
    if (isSuper) {
      [lists, allLeads] = await Promise.all([
        listLeadListsForStaff(),
        searchLeadsForStaff({ q, status, page: parsePage(first(raw.page)) })
      ]);
    } else if (isIb) {
      [queueLeads, teamLeads] = await Promise.all([
        searchLeadsForStaff({
          q,
          status,
          page: parsePage(first(raw.qp)),
          assignment: "unassigned"
        }),
        searchLeadsForStaff({
          q,
          status,
          page: parsePage(first(raw.tp)),
          assignment: "assigned"
        })
      ]);
    } else {
      allLeads = await searchLeadsForStaff({
        q,
        status,
        page: parsePage(first(raw.page))
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }

  // Each section's pagination links preserve the other section's page.
  const queueParams = { ...baseParams };
  if (teamLeads.page > 1) queueParams.tp = String(teamLeads.page);
  const teamParams = { ...baseParams };
  if (queueLeads.page > 1) teamParams.qp = String(queueLeads.page);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Leads"
        subtitle={
          isSuper
            ? "Create lead lists, download the CSV template, upload leads, and assign them to IBs or agents."
            : isIb
              ? "Your unassigned queue and your team's leads."
              : "Leads assigned to your book (read-only)."
        }
      />

      {isSuper ? (
        <>
          <AdminSection title="Create list">
            <p>
              <a className="link-arrow" href="/admin/leads/template">
                Download CSV template
              </a>
            </p>
            <CreateLeadListForm />
          </AdminSection>

          <AdminSection title="Lead lists">
            {lists.length === 0 ? (
              <p className="lead">No lead lists yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Default source</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lists.map((list) => (
                    <tr key={list.id}>
                      <td>{list.name}</td>
                      <td>{list.defaultSource || "—"}</td>
                      <td>{list.createdAt.toISOString().slice(0, 10)}</td>
                      <td>
                        <Link className="link-arrow" href={`/admin/leads/${list.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </AdminSection>

          <AdminSection title={`All leads (${allLeads.total})`}>
            <LeadsSearchForm q={q} status={status} />
            {allLeads.rows.length === 0 ? (
              <p className="lead stack-3">No leads match your search.</p>
            ) : (
              <>
                <div className="table-wrap stack-3">
                  <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Source</th>
                      <th>Stage</th>
                      <th>Parent IB</th>
                      <th>Agent</th>
                      <th>Linked</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allLeads.rows.map((lead) => (
                      <tr key={lead.id}>
                        <td>{lead.fullName}</td>
                        <td>{lead.email}</td>
                        <td>{lead.phone || "—"}</td>
                        <td>
                          {lead.source}
                          {lead.sourceDetail ? ` · ${lead.sourceDetail}` : ""}
                        </td>
                        <td>{stageLabel(lead.status)}</td>
                        <td>{lead.ibEmail ?? "—"}</td>
                        <td>{lead.assignedAgentEmail ?? "Unassigned"}</td>
                        <td>{lead.investorId ? "Yes" : "No"}</td>
                        <td>
                          <Link className="link-arrow" href={`/admin/leads/lead/${lead.id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <LeadsPagination
                  basePath="/admin/leads"
                  params={baseParams}
                  pageParam="page"
                  page={allLeads.page}
                  total={allLeads.total}
                  pageSize={allLeads.pageSize}
                />
              </>
            )}
          </AdminSection>
        </>
      ) : isIb ? (
        <>
          <AdminSection title={`Unassigned leads (${queueLeads.total})`}>
            <LeadsSearchForm q={q} status={status} />
            {queueLeads.rows.length === 0 ? (
              <p className="lead stack-3">Your queue is empty.</p>
            ) : (
              <>
                <div className="table-wrap stack-3">
                  <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Source</th>
                      <th>Stage</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueLeads.rows.map((lead) => (
                      <tr key={lead.id}>
                        <td>{lead.fullName}</td>
                        <td>{lead.email}</td>
                        <td>{lead.phone || "—"}</td>
                        <td>
                          {lead.source}
                          {lead.sourceDetail ? ` · ${lead.sourceDetail}` : ""}
                        </td>
                        <td>{stageLabel(lead.status)}</td>
                        <td>
                          <Link className="link-arrow" href={`/admin/leads/lead/${lead.id}`}>
                            Assign
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <LeadsPagination
                  basePath="/admin/leads"
                  params={queueParams}
                  pageParam="qp"
                  page={queueLeads.page}
                  total={queueLeads.total}
                  pageSize={queueLeads.pageSize}
                />
              </>
            )}
          </AdminSection>

          <AdminSection title={`Team leads (${teamLeads.total})`}>
            {teamLeads.rows.length === 0 ? (
              <p className="lead">No leads assigned to your agents yet.</p>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Agent</th>
                      <th>Stage</th>
                      <th>Next follow-up</th>
                      <th>Last activity</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamLeads.rows.map((lead) => (
                      <tr key={lead.id}>
                        <td>{lead.fullName}</td>
                        <td>{lead.email}</td>
                        <td>{lead.assignedAgentEmail}</td>
                        <td>{stageLabel(lead.status)}</td>
                        <td>
                          {lead.nextFollowUpAt
                            ? lead.nextFollowUpAt.toISOString().slice(0, 10)
                            : "—"}
                        </td>
                        <td>
                          {lead.lastActivityAt
                            ? lead.lastActivityAt.toISOString().slice(0, 10)
                            : "—"}
                        </td>
                        <td>
                          <Link className="link-arrow" href={`/admin/leads/lead/${lead.id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <LeadsPagination
                  basePath="/admin/leads"
                  params={teamParams}
                  pageParam="tp"
                  page={teamLeads.page}
                  total={teamLeads.total}
                  pageSize={teamLeads.pageSize}
                />
              </>
            )}
          </AdminSection>
        </>
      ) : (
        <AdminSection title={`Assigned leads (${allLeads.total})`}>
          <LeadsSearchForm q={q} status={status} />
          {allLeads.rows.length === 0 ? (
            <p className="lead stack-3">No leads assigned to you.</p>
          ) : (
            <>
              <div className="table-wrap stack-3">
                <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Source</th>
                    <th>Stage</th>
                    <th>Linked investor</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {allLeads.rows.map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.fullName}</td>
                      <td>{lead.email}</td>
                      <td>{lead.phone || "—"}</td>
                      <td>
                        {lead.source}
                        {lead.sourceDetail ? ` · ${lead.sourceDetail}` : ""}
                      </td>
                      <td>{stageLabel(lead.status)}</td>
                      <td>{lead.investorId ? "Yes" : "No"}</td>
                      <td>
                        <Link className="link-arrow" href={`/admin/leads/lead/${lead.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <LeadsPagination
                basePath="/admin/leads"
                params={baseParams}
                pageParam="page"
                page={allLeads.page}
                total={allLeads.total}
                pageSize={allLeads.pageSize}
              />
            </>
          )}
        </AdminSection>
      )}
    </div>
  );
}
```

- [ ] **Step 7: typecheck and run the leads tests**

```bash
npx tsc --noEmit
npx vitest run tests/leads-labels.test.ts tests/integration/leads-search.integration.test.ts tests/integration/leads-assign-actions.integration.test.ts
# tsc: no errors; vitest: all pass (integration files skip without a DB URL)
```

- [ ] **Step 8: commit**

```bash
git add apps/web/lib/leads/labels.ts \
  apps/web/components/admin/leads-search-form.tsx \
  apps/web/components/admin/leads-pagination.tsx \
  apps/web/lib/leads/queries.ts \
  apps/web/app/admin/leads/page.tsx \
  apps/web/tests/integration/helpers/fixtures.ts \
  apps/web/tests/leads-labels.test.ts \
  apps/web/tests/integration/leads-search.integration.test.ts
git commit -m "feat(leads): server-side search and pagination on /admin/leads"
```

---

### Task 2: Stale flags + bulk stage update

**Files:**
- Create: `apps/web/lib/leads/stale.ts`
- Create: `apps/web/lib/leads/assign/bulk-status.ts`
- Create: `apps/web/components/leads-bulk-table.tsx`
- Modify: `apps/web/lib/leads/queries.ts` (add `countStaleLeadsForStaff`)
- Modify: `apps/web/app/globals.css` (add `.badge-stale`, `.bulk-bar`, checkbox sizing)
- Modify: `apps/web/app/admin/leads/page.tsx` (tables → `LeadsBulkTable`, stale counts in section headers)
- Test: `apps/web/tests/leads-stale.test.ts`
- Test: `apps/web/tests/integration/leads-bulk-status.integration.test.ts`

**Interfaces:**
- Consumes: `TERMINAL_LEAD_STATUSES`, `LEAD_STATUS_LABEL`, `LEADS_PAGE_SIZE`, `LeadSearchResult` (Task 1); `leadVisibleToStaff` (`@/lib/leads/scope`); `requireActor`, `revalidateLead` (`lib/leads/assign/shared.ts`)
- Produces:
  - `lib/leads/stale.ts`: `STALE_AFTER_DAYS` (= 7), `isStaleLead(lead: { status: string; lastActivityAt: Date | null }, now?: Date): boolean`
  - `lib/leads/queries.ts`: `countStaleLeadsForStaff(input?: { assignment?: "unassigned" | "assigned" }): Promise<number>` — **also consumed by the Dashboard area (spec D.4 stale-leads widget)**
  - `lib/leads/assign/bulk-status.ts`: `bulkSetLeadStatus(input: { leadIds: string[]; status: string }): Promise<BulkSetLeadStatusResult>` where `BulkSetLeadStatusResult = { ok: true; updated: number; failed: { leadId: string; error: string }[] } | { ok: false; error: string }`
  - `components/leads-bulk-table.tsx`: `LeadsBulkTable({ rows }: { rows: BulkLeadRow[] })`, `type BulkLeadRow`

- [ ] **Step 1: write the failing stale-helper test**

Create `apps/web/tests/leads-stale.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isStaleLead, STALE_AFTER_DAYS } from "@/lib/leads/stale";

const NOW = new Date("2026-07-23T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("isStaleLead", () => {
  it("flags a non-terminal lead whose last activity is older than 7 days", () => {
    expect(isStaleLead({ status: "contacted", lastActivityAt: daysAgo(8) }, NOW)).toBe(true);
    expect(isStaleLead({ status: "new", lastActivityAt: daysAgo(8) }, NOW)).toBe(true);
    expect(isStaleLead({ status: "qualified", lastActivityAt: daysAgo(8) }, NOW)).toBe(true);
  });

  it("does not flag activity 7 days old or newer", () => {
    expect(isStaleLead({ status: "contacted", lastActivityAt: daysAgo(7) }, NOW)).toBe(false);
    expect(isStaleLead({ status: "contacted", lastActivityAt: daysAgo(1) }, NOW)).toBe(false);
  });

  it("never flags terminal stages", () => {
    for (const status of ["unqualified", "duplicate", "converted"]) {
      expect(isStaleLead({ status, lastActivityAt: daysAgo(30) }, NOW)).toBe(false);
    }
  });

  it("does not flag a lead with no recorded activity", () => {
    expect(isStaleLead({ status: "new", lastActivityAt: null }, NOW)).toBe(false);
  });

  it("exports a 7-day threshold", () => {
    expect(STALE_AFTER_DAYS).toBe(7);
  });
});
```

Run — expect failure (module does not exist):

```bash
npx vitest run tests/leads-stale.test.ts
# FAIL — Cannot find module '@/lib/leads/stale'
```

- [ ] **Step 2: create `lib/leads/stale.ts`**

```ts
import { TERMINAL_LEAD_STATUSES } from "./labels";

export const STALE_AFTER_DAYS = 7;

const TERMINAL = new Set<string>(TERMINAL_LEAD_STATUSES);

/**
 * A lead is stale when it is still workable (non-terminal) but nobody has
 * touched it for over a week. Leads with no recorded activity are "unworked",
 * a separate queue concept (getLeadDashboardCounts), not stale.
 */
export function isStaleLead(
  lead: { status: string; lastActivityAt: Date | null },
  now: Date = new Date()
): boolean {
  if (TERMINAL.has(lead.status)) return false;
  if (!lead.lastActivityAt) return false;
  return now.getTime() - lead.lastActivityAt.getTime() > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
```

Run — expect pass:

```bash
npx vitest run tests/leads-stale.test.ts
# ✓ 5 passed
```

- [ ] **Step 3: write the failing integration test for `bulkSetLeadStatus` + `countStaleLeadsForStaff`**

Create `apps/web/tests/integration/leads-bulk-status.integration.test.ts`:

```ts
/**
 * Integration tests for bulkSetLeadStatus (lib/leads/assign/bulk-status.ts)
 * and countStaleLeadsForStaff (lib/leads/queries.ts). Real Postgres scratch
 * database; only the session is mocked.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sessionState = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(async () => sessionState.user),
  requireSessionUser: vi.fn(async () => {
    if (!sessionState.user) throw new Error("UNAUTHENTICATED");
    return sessionState.user;
  })
}));

import { bulkSetLeadStatus } from "@/lib/leads/assign/bulk-status";
import { countStaleLeadsForStaff } from "@/lib/leads/queries";
import {
  describeIntegration,
  setupIntegrationDatabase,
  type IntegrationDbHandle
} from "./helpers/db";
import {
  createInvestor,
  createLead,
  createLeadList,
  createStaff,
  getLead,
  listAuditEvents,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(user: { id: string; email: string } | null) {
  sessionState.user = user;
}

type Staff = Awaited<ReturnType<typeof createStaff>>;

describeIntegration("bulkSetLeadStatus + countStaleLeadsForStaff (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Staff;
  let list: Awaited<ReturnType<typeof createLeadList>>;

  async function makeIbWithAgent() {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    const agent = await createStaff({
      email: uniqEmail("agent"),
      role: "agent",
      ibId: ib.profile.id
    });
    return { ib, agent };
  }

  beforeAll(async () => {
    handle = await setupIntegrationDatabase();
    const adminEmail = uniqEmail("sa");
    process.env.SUPER_ADMIN_EMAILS = adminEmail;
    admin = await createStaff({ email: adminEmail, role: "super_admin" });
    list = await createLeadList(admin.profile.id);
  }, 120_000);

  afterAll(async () => {
    await handle?.teardown();
  });

  beforeEach(() => {
    signInAs(admin.authUser);
  });

  it("updates every selected in-scope lead and writes one audit event per row", async () => {
    const { ib, agent } = await makeIbWithAgent();
    const leadA = await createLead({
      listId: list.id,
      email: uniqEmail("a"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id
    });
    const leadB = await createLead({
      listId: list.id,
      email: uniqEmail("b"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id
    });

    signInAs(agent.authUser);
    const result = await bulkSetLeadStatus({
      leadIds: [leadA.id, leadB.id],
      status: "contacted"
    });

    expect(result).toEqual({ ok: true, updated: 2, failed: [] });
    expect((await getLead(leadA.id))?.status).toBe("contacted");
    expect((await getLead(leadB.id))?.status).toBe("contacted");
    expect((await getLead(leadA.id))?.lastActivityAt).not.toBeNull();
    expect(await listAuditEvents("lead.status_changed", leadA.id)).toHaveLength(1);
    expect(await listAuditEvents("lead.status_changed", leadB.id)).toHaveLength(1);
  });

  it("collects per-row errors (partial success) instead of failing silently", async () => {
    const { ib, agent } = await makeIbWithAgent();
    const other = await makeIbWithAgent();
    const own = await createLead({
      listId: list.id,
      email: uniqEmail("own"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id
    });
    const foreign = await createLead({
      listId: list.id,
      email: uniqEmail("foreign"),
      ibId: other.ib.profile.id,
      assignedAgentId: other.agent.profile.id
    });
    const missing = randomUUID();

    signInAs(agent.authUser);
    const result = await bulkSetLeadStatus({
      leadIds: [own.id, foreign.id, missing],
      status: "qualified"
    });

    expect(result).toEqual({
      ok: true,
      updated: 1,
      failed: [
        { leadId: foreign.id, error: "You do not have access to this lead." },
        { leadId: missing, error: "Lead not found." }
      ]
    });
    expect((await getLead(own.id))?.status).toBe("qualified");
    expect((await getLead(foreign.id))?.status).toBe("new");
    expect(await listAuditEvents("lead.status_changed", foreign.id)).toHaveLength(0);
  });

  it("refuses converted leads linked to an investor, per row", async () => {
    const { investor } = await createInvestor({ email: uniqEmail("inv") });
    const converted = await createLead({
      listId: list.id,
      email: uniqEmail("conv"),
      status: "converted",
      investorId: investor.id
    });

    const result = await bulkSetLeadStatus({
      leadIds: [converted.id],
      status: "contacted"
    });

    expect(result).toEqual({
      ok: true,
      updated: 0,
      failed: [
        {
          leadId: converted.id,
          error: "This lead is converted and linked to an investor; its stage cannot be changed."
        }
      ]
    });
    expect((await getLead(converted.id))?.status).toBe("converted");
  });

  it("rejects an invalid status or an empty selection for the whole call", async () => {
    expect(await bulkSetLeadStatus({ leadIds: [randomUUID()], status: "bogus" })).toEqual({
      ok: false,
      error: "Invalid status."
    });
    expect(await bulkSetLeadStatus({ leadIds: [], status: "contacted" })).toEqual({
      ok: false,
      error: "No leads selected."
    });
  });

  it("countStaleLeadsForStaff counts only stale, non-terminal leads in scope", async () => {
    const { ib, agent } = await makeIbWithAgent();
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await createLead({ // stale: non-terminal, 10 days idle
      listId: list.id,
      email: uniqEmail("stale"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id,
      status: "contacted",
      lastActivityAt: daysAgo(10)
    });
    await createLead({ // fresh
      listId: list.id,
      email: uniqEmail("fresh"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id,
      status: "contacted",
      lastActivityAt: daysAgo(2)
    });
    await createLead({ // terminal, old — excluded
      listId: list.id,
      email: uniqEmail("term"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id,
      status: "unqualified",
      lastActivityAt: daysAgo(30)
    });
    await createLead({ // no activity yet — "unworked", not stale
      listId: list.id,
      email: uniqEmail("new"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id
    });

    signInAs(agent.authUser);
    expect(await countStaleLeadsForStaff()).toBe(1);
    expect(await countStaleLeadsForStaff({ assignment: "assigned" })).toBe(1);
    expect(await countStaleLeadsForStaff({ assignment: "unassigned" })).toBe(0);

    // The parent IB sees the same stale lead across queue + team.
    signInAs(ib.authUser);
    expect(await countStaleLeadsForStaff()).toBe(1);
  });
});
```

Run — expect failure (`bulkSetLeadStatus` module missing; `countStaleLeadsForStaff` not exported):

```bash
npx vitest run tests/integration/leads-bulk-status.integration.test.ts
# FAIL — Cannot find module '@/lib/leads/assign/bulk-status'
```

- [ ] **Step 4: create the `bulkSetLeadStatus` server action**

Create `apps/web/lib/leads/assign/bulk-status.ts`:

```ts
"use server";

import { eq, inArray } from "drizzle-orm";
import { auditEvents, db, leads } from "@/lib/db";
import { leadVisibleToStaff } from "../scope";
import { requireActor, revalidateLead } from "./shared";

/** Stages offered by the bulk-action bar (spec A.3). */
const BULK_SETTABLE_STATUSES = new Set(["contacted", "qualified", "unqualified"]);

/** Hard cap so a crafted request cannot turn one call into an unbounded loop. */
const MAX_BULK_IDS = 100;

export type BulkSetLeadStatusResult =
  | { ok: true; updated: number; failed: { leadId: string; error: string }[] }
  | { ok: false; error: string };

/**
 * Move many leads to one stage. Scope and validity are checked per row:
 * rows that fail are reported in `failed` (never silently skipped) while the
 * rest still update, and every updated row gets its own audit event.
 */
export async function bulkSetLeadStatus(input: {
  leadIds: string[];
  status: string;
}): Promise<BulkSetLeadStatusResult> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { staff } = actor;

  if (!BULK_SETTABLE_STATUSES.has(input.status)) {
    return { ok: false, error: "Invalid status." };
  }

  const leadIds = [...new Set(input.leadIds)].slice(0, MAX_BULK_IDS);
  if (leadIds.length === 0) {
    return { ok: false, error: "No leads selected." };
  }

  const rows = await db
    .select({
      id: leads.id,
      listId: leads.listId,
      ibId: leads.ibId,
      assignedAgentId: leads.assignedAgentId,
      investorId: leads.investorId,
      status: leads.status
    })
    .from(leads)
    .where(inArray(leads.id, leadIds));
  const byId = new Map(rows.map((row) => [row.id, row]));

  const failed: { leadId: string; error: string }[] = [];
  let updated = 0;

  for (const leadId of leadIds) {
    const lead = byId.get(leadId);
    if (!lead) {
      failed.push({ leadId, error: "Lead not found." });
      continue;
    }
    if (
      !leadVisibleToStaff({
        role: staff.role,
        staffId: staff.staff.id,
        lead: { assignedAgentId: lead.assignedAgentId, ibId: lead.ibId }
      })
    ) {
      failed.push({ leadId, error: "You do not have access to this lead." });
      continue;
    }
    // Same rule as setLeadStatus: a converted lead with a linked investor
    // must never leave the converted stage.
    if (lead.status === "converted" && lead.investorId) {
      failed.push({
        leadId,
        error: "This lead is converted and linked to an investor; its stage cannot be changed."
      });
      continue;
    }

    await db
      .update(leads)
      .set({
        status: input.status as "contacted" | "qualified" | "unqualified",
        lastActivityAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(leads.id, lead.id));

    await db.insert(auditEvents).values({
      actorUserId: staff.user.id,
      action: "lead.status_changed",
      entityType: "lead",
      entityId: lead.id,
      payload: { status: input.status, listId: lead.listId, bulk: true }
    });

    updated += 1;
  }

  if (updated > 0) revalidateLead();
  return { ok: true, updated, failed };
}
```

- [ ] **Step 5: add `countStaleLeadsForStaff` to `lib/leads/queries.ts`**

Change the drizzle import (after Task 1 it reads `import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";`) to add `lt`:

```ts
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
```

Extend the labels import (added in Task 1) to:

```ts
import { LEAD_STATUS_VALUES, TERMINAL_LEAD_STATUSES, type LeadStatus } from "./labels";
```

Also add the stale import:

```ts
import { STALE_AFTER_DAYS } from "./stale";
```

Append directly after `searchLeadsForStaff`:

```ts
/**
 * Scoped count of stale leads (non-terminal, idle for over STALE_AFTER_DAYS),
 * for section headers and the dashboard stale-leads widget. Accepts the same
 * assignment split as searchLeadsForStaff so each queue header gets an
 * accurate number.
 */
export async function countStaleLeadsForStaff(input?: {
  assignment?: "unassigned" | "assigned";
}): Promise<number> {
  const staff = await requireStaff();

  const conditions = [
    sql`${leads.status} not in ('unqualified','duplicate','converted')`,
    sql`${leads.lastActivityAt} is not null`,
    lt(leads.lastActivityAt, new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000))
  ];

  if (staff.role === "ib") {
    conditions.push(eq(leads.ibId, staff.staff.id));
  } else if (staff.role !== "super_admin") {
    conditions.push(eq(leads.assignedAgentId, staff.staff.id));
  }

  if (input?.assignment === "unassigned") {
    conditions.push(isNull(leads.assignedAgentId));
  } else if (input?.assignment === "assigned") {
    conditions.push(isNotNull(leads.assignedAgentId));
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(and(...conditions));

  return Number(row?.count ?? 0);
}
```

Run — expect pass:

```bash
npx vitest run tests/integration/leads-bulk-status.integration.test.ts
# ✓ 5 passed (skips cleanly without PARKWISE_TEST_DATABASE_URL)
```

- [ ] **Step 6: add the CSS (exact edits, no inline styles anywhere)**

In `apps/web/app/globals.css`, after line 1085 (`.badge-status-closed { background: var(--cream-dark); color: var(--muted); }`) add:

```css
.badge-stale { background: rgba(232, 97, 60, 0.14); color: var(--orange-dark); }
```

After line 1451 (the `.table-wrap { ... }` rule) add:

```css
.bulk-bar { position: sticky; bottom: var(--space-3); z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-top: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--line-soft); border-radius: var(--radius-m); background: var(--paper); }
.admin-table input[type="checkbox"] { width: 22px; height: 22px; cursor: pointer; }
```

Verify:

```bash
npx tsc --noEmit   # unaffected; CSS is checked by the build in the final step
```

- [ ] **Step 7: create the `LeadsBulkTable` client component**

Create `apps/web/components/leads-bulk-table.tsx`. One fixed column set serves all four sections (super "All leads", IB queue, IB team, agent book); per-row checkboxes, sticky bulk-action bar with the three spec actions, per-row error rendering under the stage cell, stale badge next to the stage label. Buttons use `btn btn-ghost btn-sm` (≥40px tap targets); the whole table stays inside `.table-wrap`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bulkSetLeadStatus } from "@/lib/leads/assign/bulk-status";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads/labels";
import { isStaleLead } from "@/lib/leads/stale";

/** Serializable row shape — server pages map LeadRow → BulkLeadRow (ISO dates). */
export type BulkLeadRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  source: string;
  sourceDetail: string | null;
  status: string;
  assignedAgentEmail: string | null;
  investorId: string | null;
  lastActivityAt: string | null;
};

const BULK_ACTIONS = [
  { status: "contacted", label: "Mark contacted" },
  { status: "qualified", label: "Mark qualified" },
  { status: "unqualified", label: "Mark unqualified" }
] as const;

function stageLabel(status: string): string {
  return LEAD_STATUS_LABEL[status as LeadStatus] ?? status;
}

export function LeadsBulkTable({ rows }: { rows: BulkLeadRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<{ leadId: string; error: string }[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allChecked = rows.length > 0 && rows.every((row) => selected.has(row.id));

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(rows.map((row) => row.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function runBulk(status: string) {
    setFormError(null);
    setRowErrors([]);
    startTransition(async () => {
      const result = await bulkSetLeadStatus({ leadIds: [...selected], status });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      // Partial success: keep the failed rows selected so the user can retry
      // or open them; refreshed rows clear their checkboxes.
      setRowErrors(result.failed);
      setSelected(new Set(result.failed.map((failure) => failure.leadId)));
      if (result.updated > 0) router.refresh();
    });
  }

  const errorFor = (id: string) => rowErrors.find((entry) => entry.leadId === id)?.error;

  return (
    <>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all leads on this page"
                  checked={allChecked}
                  onChange={toggleAll}
                />
              </th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Source</th>
              <th>Stage</th>
              <th>Agent</th>
              <th>Linked</th>
              <th>Last activity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => {
              const stale = isStaleLead({
                status: lead.status,
                lastActivityAt: lead.lastActivityAt ? new Date(lead.lastActivityAt) : null
              });
              return (
                <tr key={lead.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${lead.fullName}`}
                      checked={selected.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                    />
                  </td>
                  <td>{lead.fullName}</td>
                  <td>{lead.email}</td>
                  <td>{lead.phone || "—"}</td>
                  <td>
                    {lead.source}
                    {lead.sourceDetail ? ` · ${lead.sourceDetail}` : ""}
                  </td>
                  <td>
                    {stageLabel(lead.status)}
                    {stale ? (
                      <>
                        {" "}
                        <span className="badge badge-stale">Stale</span>
                      </>
                    ) : null}
                    {errorFor(lead.id) ? (
                      <p className="form-error" role="alert">
                        {errorFor(lead.id)}
                      </p>
                    ) : null}
                  </td>
                  <td>{lead.assignedAgentEmail ?? "Unassigned"}</td>
                  <td>{lead.investorId ? "Yes" : "No"}</td>
                  <td>{lead.lastActivityAt ? lead.lastActivityAt.slice(0, 10) : "—"}</td>
                  <td>
                    <Link className="link-arrow" href={`/admin/leads/lead/${lead.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected.size > 0 ? (
        <div className="bulk-bar">
          <span>{selected.size} selected</span>
          {BULK_ACTIONS.map((action) => (
            <button
              key={action.status}
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={isPending}
              onClick={() => runBulk(action.status)}
            >
              {action.label}
            </button>
          ))}
          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 8: wire bulk tables + stale counts into `app/admin/leads/page.tsx` (exact edits)**

Edit 1 — imports. Replace:

```tsx
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads/labels";
import {
  LEADS_PAGE_SIZE,
  listLeadListsForStaff,
  searchLeadsForStaff,
  type LeadListRow,
  type LeadSearchResult
} from "@/lib/leads/queries";
```

with:

```tsx
import { LeadsBulkTable, type BulkLeadRow } from "@/components/leads-bulk-table";
import {
  LEADS_PAGE_SIZE,
  countStaleLeadsForStaff,
  listLeadListsForStaff,
  searchLeadsForStaff,
  type LeadListRow,
  type LeadRow,
  type LeadSearchResult
} from "@/lib/leads/queries";
```

(`LEAD_STATUS_LABEL` / `stageLabel` leave the page — the bulk table owns stage rendering now. Delete the `function stageLabel(...)` helper from the page.)

Edit 2 — add the row mapper below `parsePage`:

```ts
function toBulkRow(lead: LeadRow): BulkLeadRow {
  return {
    id: lead.id,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    sourceDetail: lead.sourceDetail,
    status: lead.status,
    assignedAgentEmail: lead.assignedAgentEmail,
    investorId: lead.investorId,
    lastActivityAt: lead.lastActivityAt ? lead.lastActivityAt.toISOString() : null
  };
}
```

Edit 3 — fetch stale counts. Replace the whole `try { ... } catch` data block with:

```tsx
  let lists: LeadListRow[] = [];
  let allLeads = EMPTY_RESULT;
  let queueLeads = EMPTY_RESULT;
  let teamLeads = EMPTY_RESULT;
  let allStale = 0;
  let queueStale = 0;
  let teamStale = 0;
  try {
    if (isSuper) {
      [lists, allLeads, allStale] = await Promise.all([
        listLeadListsForStaff(),
        searchLeadsForStaff({ q, status, page: parsePage(first(raw.page)) }),
        countStaleLeadsForStaff()
      ]);
    } else if (isIb) {
      [queueLeads, teamLeads, queueStale, teamStale] = await Promise.all([
        searchLeadsForStaff({
          q,
          status,
          page: parsePage(first(raw.qp)),
          assignment: "unassigned"
        }),
        searchLeadsForStaff({
          q,
          status,
          page: parsePage(first(raw.tp)),
          assignment: "assigned"
        }),
        countStaleLeadsForStaff({ assignment: "unassigned" }),
        countStaleLeadsForStaff({ assignment: "assigned" })
      ]);
    } else {
      [allLeads, allStale] = await Promise.all([
        searchLeadsForStaff({ q, status, page: parsePage(first(raw.page)) }),
        countStaleLeadsForStaff()
      ]);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }
```

Edit 4 — super "All leads" section. Replace the section title and the entire `<div className="table-wrap stack-3">…</div>` block inside it with:

```tsx
          <AdminSection title={`All leads (${allLeads.total} · ${allStale} stale)`}>
            <LeadsSearchForm q={q} status={status} />
            {allLeads.rows.length === 0 ? (
              <p className="lead stack-3">No leads match your search.</p>
            ) : (
              <>
                <div className="stack-3">
                  <LeadsBulkTable rows={allLeads.rows.map(toBulkRow)} />
                </div>
                <LeadsPagination
                  basePath="/admin/leads"
                  params={baseParams}
                  pageParam="page"
                  page={allLeads.page}
                  total={allLeads.total}
                  pageSize={allLeads.pageSize}
                />
              </>
            )}
          </AdminSection>
```

Edit 5 — IB "Unassigned leads" section: same replacement, with title `` `Unassigned leads (${queueLeads.total} · ${queueStale} stale)` ``, rows `queueLeads.rows.map(toBulkRow)`, and the existing `qp` pagination block kept unchanged below it.

Edit 6 — IB "Team leads" section: replace title with `` `Team leads (${teamLeads.total} · ${teamStale} stale)` `` and the `<div className="table-wrap">…</div>` block with `<LeadsBulkTable rows={teamLeads.rows.map(toBulkRow)} />`, keeping the `tp` pagination block.

Edit 7 — agent "Assigned leads" section: title `` `Assigned leads (${allLeads.total} · ${allStale} stale)` ``, table block →

```tsx
              <div className="stack-3">
                <LeadsBulkTable rows={allLeads.rows.map(toBulkRow)} />
              </div>
```

keeping the `page` pagination block.

(The queue table's old "Assign" link text becomes "Open" — the bulk table uses one link label for all sections; the destination `/admin/leads/lead/[leadId]` is unchanged, and assignment still happens on the detail page.)

- [ ] **Step 9: typecheck and run all leads tests**

```bash
npx tsc --noEmit
npx vitest run tests/leads-stale.test.ts tests/leads-labels.test.ts tests/integration/leads-search.integration.test.ts tests/integration/leads-bulk-status.integration.test.ts
# tsc: no errors; vitest: all pass
```

- [ ] **Step 10: commit**

```bash
git add apps/web/lib/leads/stale.ts \
  apps/web/lib/leads/assign/bulk-status.ts \
  apps/web/components/leads-bulk-table.tsx \
  apps/web/lib/leads/queries.ts \
  apps/web/app/globals.css \
  apps/web/app/admin/leads/page.tsx \
  apps/web/tests/leads-stale.test.ts \
  apps/web/tests/integration/leads-bulk-status.integration.test.ts
git commit -m "feat(leads): stale flags and bulk stage updates on /admin/leads"
```

---

### Task 3: Correctness fixes — converted-lead guard + terminal exclusion in the IB queue

**Files:**
- Modify: `apps/web/lib/leads/assign/shared.ts` (`loadLead` also selects `status`)
- Modify: `apps/web/lib/leads/assign/status.ts` (refuse to move a converted lead with `investorId`)
- Modify: `apps/web/lib/leads/queries.ts` (`assignment: "unassigned"` excludes terminal statuses)
- Test: `apps/web/tests/integration/leads-status-fixes.integration.test.ts`

**Interfaces:**
- Consumes: `searchLeadsForStaff`, `TERMINAL_LEAD_STATUSES` (Task 1); `LeadOwnershipRow`, `loadLead` (`lib/leads/assign/shared.ts`)
- Produces: nothing new — this task only tightens existing signatures' behavior (`setLeadStatus`, `searchLeadsForStaff`)

- [ ] **Step 1: write the failing integration test**

Create `apps/web/tests/integration/leads-status-fixes.integration.test.ts`:

```ts
/**
 * Integration tests for the leads correctness fixes (spec A.4):
 *  - setLeadStatus refuses to move a lead out of `converted` when investorId is set
 *  - the IB "Unassigned leads" queue excludes terminal statuses
 * Real Postgres scratch database; only the session is mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sessionState = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(async () => sessionState.user),
  requireSessionUser: vi.fn(async () => {
    if (!sessionState.user) throw new Error("UNAUTHENTICATED");
    return sessionState.user;
  })
}));

import { setLeadStatus } from "@/lib/leads/assign/status";
import { searchLeadsForStaff } from "@/lib/leads/queries";
import {
  describeIntegration,
  setupIntegrationDatabase,
  type IntegrationDbHandle
} from "./helpers/db";
import {
  createInvestor,
  createLead,
  createLeadList,
  createStaff,
  getLead,
  listAuditEvents,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(user: { id: string; email: string } | null) {
  sessionState.user = user;
}

type Staff = Awaited<ReturnType<typeof createStaff>>;

describeIntegration("leads correctness fixes (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Staff;
  let list: Awaited<ReturnType<typeof createLeadList>>;

  beforeAll(async () => {
    handle = await setupIntegrationDatabase();
    const adminEmail = uniqEmail("sa");
    process.env.SUPER_ADMIN_EMAILS = adminEmail;
    admin = await createStaff({ email: adminEmail, role: "super_admin" });
    list = await createLeadList(admin.profile.id);
  }, 120_000);

  afterAll(async () => {
    await handle?.teardown();
  });

  beforeEach(() => {
    signInAs(admin.authUser);
  });

  describe("setLeadStatus converted guard", () => {
    it("refuses to move a converted lead with a linked investor, writing no audit event", async () => {
      const { investor } = await createInvestor({ email: uniqEmail("inv") });
      const lead = await createLead({
        listId: list.id,
        email: uniqEmail("conv"),
        status: "converted",
        investorId: investor.id
      });

      const result = await setLeadStatus({ leadId: lead.id, status: "contacted" });

      expect(result).toEqual({
        ok: false,
        error: "This lead is converted and linked to an investor; its stage cannot be changed."
      });
      expect((await getLead(lead.id))?.status).toBe("converted");
      expect(await listAuditEvents("lead.status_changed", lead.id)).toHaveLength(0);
    });

    it("still allows a converted lead with no linked investor to change stage", async () => {
      const lead = await createLead({
        listId: list.id,
        email: uniqEmail("nolink"),
        status: "converted"
      });

      expect(await setLeadStatus({ leadId: lead.id, status: "qualified" })).toEqual({
        ok: true
      });
      expect((await getLead(lead.id))?.status).toBe("qualified");
    });

    it("still allows ordinary stage transitions and audits them", async () => {
      const lead = await createLead({ listId: list.id, email: uniqEmail("ok") });

      expect(await setLeadStatus({ leadId: lead.id, status: "contacted" })).toEqual({
        ok: true
      });
      expect((await getLead(lead.id))?.status).toBe("contacted");
      expect(await listAuditEvents("lead.status_changed", lead.id)).toHaveLength(1);
    });
  });

  describe("IB unassigned queue excludes terminal statuses", () => {
    it("hides unqualified/duplicate/converted queue leads but keeps workable ones", async () => {
      const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
      const workable = await createLead({
        listId: list.id,
        email: uniqEmail("work"),
        ibId: ib.profile.id,
        status: "contacted"
      });
      for (const status of ["unqualified", "duplicate", "converted"] as const) {
        await createLead({
          listId: list.id,
          email: uniqEmail(status),
          ibId: ib.profile.id,
          status
        });
      }

      signInAs(ib.authUser);
      const queue = await searchLeadsForStaff({ assignment: "unassigned" });
      expect(queue.rows.map((row) => row.id)).toEqual([workable.id]);

      // Terminal leads are not deleted from the book: the scope-wide search
      // (and the stage filter) still surfaces them.
      const all = await searchLeadsForStaff({});
      expect(all.total).toBe(4);
      const terminal = await searchLeadsForStaff({ status: "unqualified" });
      expect(terminal.total).toBe(1);
    });
  });
});
```

Run — expect two failures (the guard and the queue exclusion do not exist yet):

```bash
npx vitest run tests/integration/leads-status-fixes.integration.test.ts
# FAIL — "refuses to move a converted lead…" (expected ok:false, got ok:true)
# FAIL — "hides unqualified/duplicate/converted queue leads…" (queue returned 4 rows)
```

- [ ] **Step 2: make `loadLead` select `status` in `lib/leads/assign/shared.ts`**

Change `LeadOwnershipRow` (lines 45–51) from:

```ts
export type LeadOwnershipRow = {
  id: string;
  listId: string;
  ibId: string | null;
  assignedAgentId: string | null;
  investorId: string | null;
};
```

to:

```ts
export type LeadOwnershipRow = {
  id: string;
  listId: string;
  ibId: string | null;
  assignedAgentId: string | null;
  investorId: string | null;
  status: "new" | "contacted" | "qualified" | "unqualified" | "duplicate" | "converted";
};
```

and in `loadLead` (lines 57–68) add `status` to the select:

```ts
  const [lead] = await exec
    .select({
      id: leads.id,
      listId: leads.listId,
      ibId: leads.ibId,
      assignedAgentId: leads.assignedAgentId,
      investorId: leads.investorId,
      status: leads.status
    })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
```

(The assignment cores in `cores.ts` destructure only the fields they need — the extra column is behavior-neutral there.)

- [ ] **Step 3: add the converted guard to `setLeadStatus` in `lib/leads/assign/status.ts`**

After the visibility check (lines 78–86), before the `await db.update(leads)…`, insert:

```ts
  // A converted lead linked to an investor is a client, not a pipeline row —
  // moving it back into the pipeline would desync the investor record.
  if (lead.status === "converted" && lead.investorId) {
    return {
      ok: false,
      error: "This lead is converted and linked to an investor; its stage cannot be changed."
    };
  }
```

- [ ] **Step 4: exclude terminal statuses from the unassigned queue in `lib/leads/queries.ts`**

Add `notInArray` to the drizzle import (which after Task 2 reads `import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";`):

```ts
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
```

In `searchLeadsForStaff`, change the `assignment` branch from:

```ts
  if (input?.assignment === "unassigned") {
    conditions.push(isNull(leads.assignedAgentId));
  } else if (input?.assignment === "assigned") {
```

to:

```ts
  if (input?.assignment === "unassigned") {
    conditions.push(isNull(leads.assignedAgentId));
    // The IB queue mirrors every workload query: terminal stages never appear.
    conditions.push(notInArray(leads.status, [...TERMINAL_LEAD_STATUSES]));
  } else if (input?.assignment === "assigned") {
```

(`TERMINAL_LEAD_STATUSES` is already imported into `queries.ts` from Task 2's step 5.)

- [ ] **Step 5: run the tests — expect pass, then full verification**

```bash
npx vitest run tests/integration/leads-status-fixes.integration.test.ts
# ✓ 4 passed (skips cleanly without PARKWISE_TEST_DATABASE_URL)

npx tsc --noEmit
npx vitest run
npm run build
# tsc: no errors; full vitest suite green; production build succeeds
```

- [ ] **Step 6: commit**

```bash
git add apps/web/lib/leads/assign/shared.ts \
  apps/web/lib/leads/assign/status.ts \
  apps/web/lib/leads/queries.ts \
  apps/web/tests/integration/leads-status-fixes.integration.test.ts
git commit -m "fix(leads): guard converted leads and exclude terminal stages from the IB queue"
```

---

## Final verification (whole leads area)

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd /Users/mac/Documents/Park/apps/web
npx tsc --noEmit
npx vitest run
npm run build
```

All three must be green (spec E). No migrations are needed — nothing in Tasks 1–3 changes the schema (head stays 0017).

---

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

---

# Area C — Opportunities / Assets (Tasks 7–8)

Spec: `docs/superpowers/specs/2026-07-23-crm-redesign-design.md`, section C ("Opportunities (`/admin/assets`) — super-admin only creation"), bound by section E (cross-cutting standards).

Scope notes discovered while reading the code (relevant for assembly):

- **"Target payment frequency" and "term" are not columns on `assets`.** They are presentation derivations (`lib/assets/presentation.ts:92-104`): payment frequency comes from the `contractual_monthly_rent` commercial term (`formatPaymentFrequency` → "Monthly" or "See opportunity details"), and term is the free-text `leaseLabel` column (seed values like `"12 years"`). The form therefore collects a payment-frequency select (Monthly / Other) that toggles `contractual_monthly_rent` inside `commercialTermIds`, and a term text input that writes `leaseLabel`. No schema change, no migration.
- **The spec's "EV" option is the `green` option id** in `lib/assets/investment-options.ts` (`INVESTMENT_OPTION_IDS = ["standard", "premium", "green"]`); seed data labels it `"EV option"`. "EV as applicable" is enforced by `supportsGreenOption(mix)` (EV charging or micromobility charging in the income mix) inside `validateInvestmentOptions`.
- **The form must collect the income mix** even though the spec's field list omits it: `validateInvestmentOptions` needs the mix as context (green gating), and the spec's own validation bullet requires "income mix sums to 100 with parking dominant" (`validateIncomeMix`, `lib/assets/income-streams.ts:45`). The form gets one percentage input per income stream, defaulting to `vehicle_parking = 100`.
- **The `assets` table has NOT NULL columns the spec's field list does not mention** (`lib/db/schema.ts:324-374`): `slug`, `district`, `tier`, `targetYieldPct`, `spaces`, `occupancyPct`. The server action derives/fills them with documented placeholders: `slug` slugified from the name (unique via `assets_slug_uidx`, friendly error on 23505), `district = city`, `tier = "Standard"` (a seed tier value), `targetYieldPct` = standard-option yield, `spaces = 0`, `occupancyPct = "0.00"`. Drafts are invisible to consumers (`listPublishedAssets` filters `status = "published"`), so placeholders cannot break consumer pages; ops refines content before publishing.
- **`isSafeHttpUrl` is currently a private helper in `lib/assets/admin-actions.ts:50-63`.** The new shared form-validation module needs it too, so it moves to `lib/assets/asset-form.ts` and `admin-actions.ts` imports it (single copy).
- **The assets table currently renders the raw status enum** (`app/admin/assets/page.tsx:55`: `<td>{a.status}</td>`), violating standard E ("no raw enum strings"). Task 7 adds an `ASSET_STATUS_LABEL` map (`lib/portal/labels.ts` pattern) since the page is being modified anyway.
- There is **no component-render test infrastructure** (no `@testing-library` in `apps/web/package.json`). Behavior is funneled into the pure module `lib/assets/asset-form.ts` plus action tests with a mocked `@/lib/db` (style of `tests/leads-admin-actions.test.ts`); pure markup edits get exact before/after edits plus `tsc`/`vitest` verification.
- The existing inline style in `components/asset-status-actions.tsx:30` (`display:flex; gap:8`) predates this round and no `stack-*` utility covers flex rows, so it is left untouched.

Common setup for every command (from the repo root unless noted):

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd /Users/mac/Documents/Park/apps/web
```

---

### Task 7: Super-admin "New opportunity" create flow

A single form at `/admin/assets/new` creating an asset in `draft` status. All catalogue invariants are enforced server-side in a new pure module (`lib/assets/asset-form.ts`) that reuses `validateIncomeMix`, `validateInvestmentOptions`, `validateCommercialTermIds`, and `parseAdvisoryCapacityInput`, so a created asset can never break consumer pages. The `createAsset` server action follows the existing `lib/assets/admin-actions.ts` pattern (`requireSuperAdmin`, `{ ok, error }`, audit event, `revalidatePath`).

**Files:**
- Create: `apps/web/lib/assets/asset-form.ts`
- Test: `apps/web/lib/assets/asset-form.test.ts`
- Modify: `apps/web/lib/assets/admin-actions.ts`
- Test: `apps/web/tests/asset-admin-actions.test.ts`
- Create: `apps/web/lib/assets/labels.ts`
- Create: `apps/web/components/asset-form.tsx`
- Create: `apps/web/app/admin/assets/new/page.tsx`
- Modify: `apps/web/app/admin/assets/page.tsx`
- Modify: `apps/web/app/globals.css` (one `.admin-form` rule)

**Interfaces:**
- Consumes: nothing from earlier tasks (Tasks 1–6 are the leads/investors areas; this area is independent).
- Produces:
  - `slugifyAssetName(name: string): string`
  - `SITE_TYPE_OPTIONS: readonly ["airport", "city", "retail", "station"]`
  - `type AssetFormInput` (raw string/boolean form payload — serializable across the server-action boundary)
  - `type ValidatedAssetForm` (DB-ready insert values minus `status`)
  - `validateAssetForm(input: AssetFormInput): { ok: true; values: ValidatedAssetForm } | { ok: false; error: string }`
  - `emptyAssetFormInput(): AssetFormInput`
  - `isSafeHttpUrl(url: string): boolean` (moved out of `admin-actions.ts`; still used by `updateAssetImages`)
  - `createAsset(input: AssetFormInput): Promise<{ ok: true; assetId: string } | { ok: false; error: string }>` — writes `asset.created` audit event
  - `AssetForm` client component (`components/asset-form.tsx`), props `{ initial: AssetFormInput }` — create-only in this task; Task 8 extends it to `{ mode: "create" | "edit"; assetId?: string; initial: AssetFormInput }`
  - `ASSET_STATUS_LABEL: Record<string, string>` (`lib/assets/labels.ts`)

- [ ] **Step 1: Write the failing test for the pure form module**

  Create `apps/web/lib/assets/asset-form.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import {
    emptyAssetFormInput,
    slugifyAssetName,
    validateAssetForm,
    type AssetFormInput
  } from "@/lib/assets/asset-form";

  function validInput(overrides: Partial<AssetFormInput> = {}): AssetFormInput {
    return {
      name: "Lisbon Airport Parking",
      city: "Lisbon",
      country: "Portugal",
      siteType: "airport",
      operator: "ParkOperator Lda",
      term: "12 years",
      paymentFrequency: "monthly",
      advisoryCapacityEur: "1500000",
      description: "Busy airport car park next to the terminal.",
      coverImageUrl: "https://images.example.com/lisbon.jpg",
      incomeMix: [
        { id: "vehicle_parking", pct: "80" },
        { id: "ev_charging", pct: "20" }
      ],
      standardMinTicketEur: "9900",
      standardYieldPct: "7.7",
      premiumEnabled: false,
      premiumMinTicketEur: "",
      premiumYieldPct: "",
      greenEnabled: false,
      greenMinTicketEur: "",
      greenYieldPct: "",
      ...overrides
    };
  }

  describe("slugifyAssetName", () => {
    it("lowercases, strips punctuation and diacritics", () => {
      expect(slugifyAssetName("Lisbon Airport — Parking!")).toBe("lisbon-airport-parking");
      expect(slugifyAssetName("München Süd")).toBe("munchen-sud");
    });

    it("returns an empty string when nothing usable remains", () => {
      expect(slugifyAssetName("  —!!!—  ")).toBe("");
    });
  });

  describe("emptyAssetFormInput", () => {
    it("defaults to a 100% vehicle parking mix and monthly frequency", () => {
      const input = emptyAssetFormInput();
      expect(input.incomeMix).toEqual([{ id: "vehicle_parking", pct: "100" }]);
      expect(input.paymentFrequency).toBe("monthly");
      expect(input.premiumEnabled).toBe(false);
      expect(input.greenEnabled).toBe(false);
    });
  });

  describe("validateAssetForm", () => {
    it("accepts a valid form and derives catalogue-consistent values", () => {
      const result = validateAssetForm(validInput());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.values.slug).toBe("lisbon-airport-parking");
      expect(result.values.targetYieldPct).toBe("7.70");
      expect(result.values.minTicketEur).toBe(9900);
      expect(result.values.leaseLabel).toBe("12 years");
      expect(result.values.blurb).toContain("airport car park");
      expect(result.values.advisoryCapacityEur).toBe(1500000);
      expect(result.values.coverImageUrl).toBe("https://images.example.com/lisbon.jpg");
      expect(result.values.commercialTermIds).toContain("contractual_monthly_rent");
      expect(result.values.investmentOptions).toHaveLength(1);
      const standard = result.values.investmentOptions[0]!;
      expect(standard.id).toBe("standard");
      expect(standard.annualIncomeEur).toBe(762); // round(9900 × 7.7 / 100)
      expect(standard.monthlyIncomeEur).toBe(64); // round(762 / 12)
      expect(standard.recommended).toBe(true);
    });

    it("drops contractual_monthly_rent when frequency is not monthly", () => {
      const result = validateAssetForm(validInput({ paymentFrequency: "other" }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.values.commercialTermIds).not.toContain("contractual_monthly_rent");
      expect(result.values.commercialTermIds.length).toBeGreaterThan(0);
    });

    it("rejects a premium yield below the standard yield", () => {
      const result = validateAssetForm(
        validInput({
          premiumEnabled: true,
          premiumMinTicketEur: "25000",
          premiumYieldPct: "7.0"
        })
      );
      expect(result).toEqual({ ok: false, error: "premium yield must be ≥ standard" });
    });

    it("accepts an EV (green) option when the mix supports it", () => {
      const result = validateAssetForm(
        validInput({
          greenEnabled: true,
          greenMinTicketEur: "15000",
          greenYieldPct: "8.5"
        })
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.values.investmentOptions.map((o) => o.id)).toEqual(["standard", "green"]);
      expect(result.values.investmentOptions[1]!.label).toBe("EV option");
    });

    it("rejects a green option without an EV or micromobility story", () => {
      const result = validateAssetForm(
        validInput({
          incomeMix: [{ id: "vehicle_parking", pct: "100" }],
          greenEnabled: true,
          greenMinTicketEur: "15000",
          greenYieldPct: "8.5"
        })
      );
      expect(result).toEqual({
        ok: false,
        error: "green option requires EV or micromobility charging story"
      });
    });

    it("rejects an income mix that does not sum to 100", () => {
      const result = validateAssetForm(
        validInput({
          incomeMix: [
            { id: "vehicle_parking", pct: "60" },
            { id: "ev_charging", pct: "20" }
          ]
        })
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("income mix percentages must sum to 100");
    });

    it("rejects an unsafe cover image URL", () => {
      const result = validateAssetForm(validInput({ coverImageUrl: "javascript:alert(1)" }));
      expect(result).toEqual({
        ok: false,
        error: "Cover image must be an http(s) URL or a site path starting with /."
      });
    });

    it("requires a name, term and description", () => {
      expect(validateAssetForm(validInput({ name: " " }))).toEqual({
        ok: false,
        error: "Name is required."
      });
      expect(validateAssetForm(validInput({ term: "" }))).toEqual({
        ok: false,
        error: 'Term is required (e.g. "12 years").'
      });
      expect(validateAssetForm(validInput({ description: "" }))).toEqual({
        ok: false,
        error: "Description is required."
      });
    });

    it("treats a blank advisory capacity as null", () => {
      const result = validateAssetForm(validInput({ advisoryCapacityEur: "" }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.values.advisoryCapacityEur).toBeNull();
    });
  });
  ```

  Run — expect failure (`Cannot find module '@/lib/assets/asset-form'`):

  ```bash
  npx vitest run lib/assets/asset-form.test.ts
  ```

- [ ] **Step 2: Implement the pure form module**

  Create `apps/web/lib/assets/asset-form.ts`:

  ```ts
  /**
   * Shared validation/derivation for the super-admin opportunity create/edit
   * form. Pure module: the server actions (lib/assets/admin-actions.ts) call
   * validateAssetForm, the client form (components/asset-form.tsx) imports the
   * types and option lists. Reuses the catalogue invariants so a form-created
   * asset can never break consumer pages.
   */

  import {
    DEFAULT_COMMERCIAL_TERM_IDS,
    validateCommercialTermIds,
    type CommercialTermId
  } from "@/lib/assets/commercial-terms";
  import { validateIncomeMix, type IncomeMixEntry } from "@/lib/assets/income-streams";
  import {
    buildStandardOption,
    optionAnnualIncome,
    optionMonthlyIncome,
    validateInvestmentOptions,
    type InvestmentOption,
    type InvestmentOptionId
  } from "@/lib/assets/investment-options";
  import { parseAdvisoryCapacityInput } from "@/lib/assets/advisory-capacity";

  /** Site types used across the seed catalogue (free text in the DB). */
  export const SITE_TYPE_OPTIONS = ["airport", "city", "retail", "station"] as const;

  export type AssetFormInput = {
    name: string;
    city: string;
    country: string;
    /** "" or one of SITE_TYPE_OPTIONS */
    siteType: string;
    operator: string;
    /** Free-text lease term, e.g. "12 years" (assets.leaseLabel). */
    term: string;
    /** "monthly" maps to the contractual_monthly_rent commercial term. */
    paymentFrequency: string;
    /** Raw text; "" clears (parseAdvisoryCapacityInput). */
    advisoryCapacityEur: string;
    /** Longer marketing description (assets.blurb). */
    description: string;
    /** "" allowed; http(s) URL or site path. */
    coverImageUrl: string;
    /** Raw per-stream percentages; "" rows are dropped before validation. */
    incomeMix: { id: string; pct: string }[];
    standardMinTicketEur: string;
    standardYieldPct: string;
    premiumEnabled: boolean;
    premiumMinTicketEur: string;
    premiumYieldPct: string;
    greenEnabled: boolean;
    greenMinTicketEur: string;
    greenYieldPct: string;
  };

  /** DB-ready insert values for a draft asset (status set by the action). */
  export type ValidatedAssetForm = {
    slug: string;
    name: string;
    operator: string;
    city: string;
    district: string;
    country: string;
    targetYieldPct: string;
    tier: string;
    minTicketEur: number;
    spaces: number;
    occupancyPct: string;
    leaseLabel: string;
    blurb: string;
    siteType: string | null;
    incomeMix: IncomeMixEntry[];
    commercialTermIds: CommercialTermId[];
    investmentOptions: InvestmentOption[];
    advisoryCapacityEur: number | null;
    coverImageUrl: string | null;
  };

  export function slugifyAssetName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics after NFKD
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  export function isSafeHttpUrl(url: string): boolean {
    // Reject protocol-relative URLs (//evil.example/…)
    if (url.startsWith("//")) return false;
    if (url.startsWith("/")) {
      // Site-relative path only — no scheme smuggling
      return !url.includes("://");
    }
    try {
      const u = new URL(url);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }

  export function emptyAssetFormInput(): AssetFormInput {
    return {
      name: "",
      city: "",
      country: "",
      siteType: "",
      operator: "",
      term: "",
      paymentFrequency: "monthly",
      advisoryCapacityEur: "",
      description: "",
      coverImageUrl: "",
      incomeMix: [{ id: "vehicle_parking", pct: "100" }],
      standardMinTicketEur: "",
      standardYieldPct: "",
      premiumEnabled: false,
      premiumMinTicketEur: "",
      premiumYieldPct: "",
      greenEnabled: false,
      greenMinTicketEur: "",
      greenYieldPct: ""
    };
  }

  function parsePositiveInt(
    raw: string,
    label: string
  ): { ok: true; value: number } | { ok: false; error: string } {
    const n = Number(raw.trim());
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, error: `${label} must be a positive whole number.` };
    }
    return { ok: true, value: n };
  }

  function parseYieldPct(
    raw: string,
    label: string
  ): { ok: true; value: number } | { ok: false; error: string } {
    const n = Number(raw.trim());
    if (!Number.isFinite(n) || n <= 0 || n > 100) {
      return { ok: false, error: `${label} must be a number between 0 and 100.` };
    }
    return { ok: true, value: n };
  }

  function buildOption(
    id: InvestmentOptionId,
    label: string,
    minTicketEur: number,
    yieldPct: number,
    commercialTermIds: CommercialTermId[]
  ): InvestmentOption {
    const annualIncomeEur = optionAnnualIncome(minTicketEur, yieldPct);
    return {
      id,
      label,
      recommended: false,
      minTicketEur,
      yieldPct,
      monthlyIncomeEur: optionMonthlyIncome(annualIncomeEur),
      annualIncomeEur,
      commercialTermIds
    };
  }

  export function validateAssetForm(
    input: AssetFormInput
  ): { ok: true; values: ValidatedAssetForm } | { ok: false; error: string } {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Name is required." };
    const slug = slugifyAssetName(name);
    if (!slug) return { ok: false, error: "Name must contain letters or numbers." };

    const city = input.city.trim();
    if (!city) return { ok: false, error: "City is required." };
    const country = input.country.trim();
    if (!country) return { ok: false, error: "Country is required." };
    const operator = input.operator.trim();
    if (!operator) return { ok: false, error: "Operator is required." };

    const siteType = input.siteType.trim().toLowerCase();
    if (siteType && !(SITE_TYPE_OPTIONS as readonly string[]).includes(siteType)) {
      return { ok: false, error: "Unknown site type." };
    }

    const leaseLabel = input.term.trim();
    if (!leaseLabel) return { ok: false, error: 'Term is required (e.g. "12 years").' };

    if (input.paymentFrequency !== "monthly" && input.paymentFrequency !== "other") {
      return { ok: false, error: "Unknown payment frequency." };
    }

    const blurb = input.description.trim();
    if (!blurb) return { ok: false, error: "Description is required." };

    const cover = input.coverImageUrl.trim();
    if (cover && !isSafeHttpUrl(cover)) {
      return {
        ok: false,
        error: "Cover image must be an http(s) URL or a site path starting with /."
      };
    }

    const mixResult = validateIncomeMix(
      input.incomeMix
        .map((entry) => ({ id: entry.id, pct: entry.pct.trim() }))
        .filter((entry) => entry.pct !== "")
        .map((entry) => ({ id: entry.id, pct: Number(entry.pct) }))
    );
    if (!mixResult.ok) return { ok: false, error: `Income mix: ${mixResult.error}` };
    const mix = mixResult.mix;

    const commercialTermIds: CommercialTermId[] =
      input.paymentFrequency === "monthly"
        ? [...DEFAULT_COMMERCIAL_TERM_IDS]
        : DEFAULT_COMMERCIAL_TERM_IDS.filter((id) => id !== "contractual_monthly_rent");
    const terms = validateCommercialTermIds(commercialTermIds);
    if (!terms.ok) return terms;

    const stdMin = parsePositiveInt(input.standardMinTicketEur, "Standard minimum ticket");
    if (!stdMin.ok) return stdMin;
    const stdYield = parseYieldPct(input.standardYieldPct, "Standard target yield");
    if (!stdYield.ok) return stdYield;

    const options: InvestmentOption[] = [
      buildStandardOption({
        minTicketEur: stdMin.value,
        yieldPct: stdYield.value,
        commercialTermIds: terms.ids,
        recommended: true
      })
    ];

    if (input.premiumEnabled) {
      const min = parsePositiveInt(input.premiumMinTicketEur, "Premium minimum ticket");
      if (!min.ok) return min;
      const yieldPct = parseYieldPct(input.premiumYieldPct, "Premium target yield");
      if (!yieldPct.ok) return yieldPct;
      options.push(
        buildOption("premium", "Premium option", min.value, yieldPct.value, terms.ids)
      );
    }

    if (input.greenEnabled) {
      const min = parsePositiveInt(input.greenMinTicketEur, "EV minimum ticket");
      if (!min.ok) return min;
      const yieldPct = parseYieldPct(input.greenYieldPct, "EV target yield");
      if (!yieldPct.ok) return yieldPct;
      options.push(buildOption("green", "EV option", min.value, yieldPct.value, terms.ids));
    }

    // Catalogue invariants: income = min × yield, monotonic yields, exactly one
    // recommended, green only with an EV/micromobility story.
    const validatedOptions = validateInvestmentOptions(options, { mix });
    if (!validatedOptions.ok) return validatedOptions;

    const capacity = parseAdvisoryCapacityInput(input.advisoryCapacityEur);
    if (!capacity.ok) return capacity;

    return {
      ok: true,
      values: {
        slug,
        name,
        operator,
        city,
        // NOT NULL placeholders for columns the form does not collect; drafts
        // are invisible to consumers, ops refines content before publishing.
        district: city,
        country,
        targetYieldPct: stdYield.value.toFixed(2),
        tier: "Standard",
        minTicketEur: stdMin.value,
        spaces: 0,
        occupancyPct: "0.00",
        leaseLabel,
        blurb,
        siteType: siteType || null,
        incomeMix: mix,
        commercialTermIds: terms.ids,
        investmentOptions: validatedOptions.options,
        advisoryCapacityEur: capacity.value,
        coverImageUrl: cover || null
      }
    };
  }
  ```

  Run — expect pass:

  ```bash
  npx vitest run lib/assets/asset-form.test.ts
  ```

- [ ] **Step 3: Write the failing test for the `createAsset` server action**

  Create `apps/web/tests/asset-admin-actions.test.ts`:

  ```ts
  import { beforeEach, describe, expect, it, vi } from "vitest";

  vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.mock("@/lib/auth/staff", () => ({
    requireStaff: vi.fn(),
    requireSuperAdmin: vi.fn()
  }));
  vi.mock("@/lib/db", () => ({
    db: { insert: vi.fn(), select: vi.fn(), update: vi.fn() },
    assets: {},
    auditEvents: {}
  }));

  import { revalidatePath } from "next/cache";
  import { requireSuperAdmin } from "@/lib/auth/staff";
  import { db } from "@/lib/db";
  import { createAsset } from "@/lib/assets/admin-actions";
  import type { AssetFormInput } from "@/lib/assets/asset-form";

  const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>;
  const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

  function validInput(overrides: Partial<AssetFormInput> = {}): AssetFormInput {
    return {
      name: "Lisbon Airport Parking",
      city: "Lisbon",
      country: "Portugal",
      siteType: "airport",
      operator: "ParkOperator Lda",
      term: "12 years",
      paymentFrequency: "monthly",
      advisoryCapacityEur: "1500000",
      description: "Busy airport car park next to the terminal.",
      coverImageUrl: "",
      incomeMix: [
        { id: "vehicle_parking", pct: "80" },
        { id: "ev_charging", pct: "20" }
      ],
      standardMinTicketEur: "9900",
      standardYieldPct: "7.7",
      premiumEnabled: false,
      premiumMinTicketEur: "",
      premiumYieldPct: "",
      greenEnabled: false,
      greenMinTicketEur: "",
      greenYieldPct: "",
      ...overrides
    };
  }

  describe("createAsset", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(requireSuperAdmin).mockResolvedValue({
        user: { id: "user-1", email: "admin@example.com" },
        staff: { id: "staff-1", role: "super_admin", ibId: null },
        role: "super_admin"
      });
    });

    it("returns Forbidden when the caller is not a super admin", async () => {
      vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

      const result = await createAsset(validInput());

      expect(result).toEqual({ ok: false, error: "Forbidden." });
      expect(insertMock).not.toHaveBeenCalled();
    });

    it("rejects invalid input without touching the database", async () => {
      const result = await createAsset(validInput({ name: " " }));

      expect(result).toEqual({ ok: false, error: "Name is required." });
      expect(insertMock).not.toHaveBeenCalled();
    });

    it("creates a draft asset and writes the asset.created audit event", async () => {
      const valuesSpy = vi.fn(() => ({
        returning: () => Promise.resolve([{ id: "asset-1" }])
      }));
      insertMock.mockImplementationOnce(() => ({ values: valuesSpy }));
      const auditValues = vi.fn();
      insertMock.mockImplementationOnce(() => ({ values: auditValues }));

      const result = await createAsset(validInput());

      expect(result).toEqual({ ok: true, assetId: "asset-1" });
      expect(valuesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "lisbon-airport-parking",
          name: "Lisbon Airport Parking",
          status: "draft",
          targetYieldPct: "7.70",
          minTicketEur: 9900,
          leaseLabel: "12 years"
        })
      );
      expect(auditValues).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: "user-1",
          action: "asset.created",
          entityType: "asset",
          entityId: "asset-1"
        })
      );
      expect(revalidatePath).toHaveBeenCalledWith("/admin/assets");
      expect(revalidatePath).toHaveBeenCalledWith("/opportunities");
    });

    it("maps a slug unique violation to a friendly error", async () => {
      const duplicate = Object.assign(new Error("duplicate key value"), { code: "23505" });
      insertMock.mockImplementationOnce(() => ({
        values: () => ({ returning: () => Promise.reject(duplicate) })
      }));

      const result = await createAsset(validInput());

      expect(result).toEqual({
        ok: false,
        error: "An opportunity with a similar name already exists."
      });
      expect(insertMock).toHaveBeenCalledTimes(1); // no audit insert
    });
  });
  ```

  Run — expect failure (`createAsset is not a function` / not exported):

  ```bash
  npx vitest run tests/asset-admin-actions.test.ts
  ```

- [ ] **Step 4: Implement `createAsset` in `lib/assets/admin-actions.ts`**

  Three edits to `apps/web/lib/assets/admin-actions.ts`:

  1. Replace the import block at the top — before:

     ```ts
     import { eq } from "drizzle-orm";
     import { requireSuperAdmin } from "@/lib/auth/staff";
     import { assets, auditEvents, db } from "@/lib/db";
     import { revalidatePath } from "next/cache";
     import { parseAdvisoryCapacityInput } from "@/lib/assets/advisory-capacity";
     ```

     after:

     ```ts
     import { eq } from "drizzle-orm";
     import { requireSuperAdmin } from "@/lib/auth/staff";
     import { assets, auditEvents, db } from "@/lib/db";
     import { revalidatePath } from "next/cache";
     import { parseAdvisoryCapacityInput } from "@/lib/assets/advisory-capacity";
     import {
       isSafeHttpUrl,
       validateAssetForm,
       type AssetFormInput
     } from "@/lib/assets/asset-form";
     ```

  2. Delete the now-duplicated private `isSafeHttpUrl` function (lines 50-63, `function isSafeHttpUrl(url: string): boolean { ... }`) — it moved to `lib/assets/asset-form.ts` and is imported above.

  3. Append the unique-violation helper (mirrors `lib/leads/admin-actions.ts:34-41`) and the new action at the end of the file:

     ```ts
     function isUniqueViolation(error: unknown): boolean {
       return (
         typeof error === "object" &&
         error !== null &&
         "code" in error &&
         (error as { code?: string }).code === "23505"
       );
     }

     export async function createAsset(
       input: AssetFormInput
     ): Promise<{ ok: true; assetId: string } | { ok: false; error: string }> {
       let userId: string;
       try {
         const staff = await requireSuperAdmin();
         userId = staff.user.id;
       } catch (error) {
         const message = error instanceof Error ? error.message : "";
         if (message === "UNAUTHENTICATED") return { ok: false, error: "Unauthenticated." };
         return { ok: false, error: "Forbidden." };
       }

       const parsed = validateAssetForm(input);
       if (!parsed.ok) return parsed;

       let inserted: { id: string } | undefined;
       try {
         [inserted] = await db
           .insert(assets)
           .values({ ...parsed.values, status: "draft" })
           .returning({ id: assets.id });
       } catch (error) {
         if (isUniqueViolation(error)) {
           return { ok: false, error: "An opportunity with a similar name already exists." };
         }
         throw error;
       }

       await db.insert(auditEvents).values({
         actorUserId: userId,
         action: "asset.created",
         entityType: "asset",
         entityId: inserted!.id,
         payload: { slug: parsed.values.slug, name: parsed.values.name }
       });

       revalidatePath("/admin/assets");
       revalidatePath("/opportunities");
       revalidatePath("/");
       return { ok: true, assetId: inserted!.id };
     }
     ```

  Run — expect pass (the whole file, including the pre-existing suites):

  ```bash
  npx vitest run tests/asset-admin-actions.test.ts lib/assets/asset-form.test.ts
  ```

- [ ] **Step 5: Build the form component, the `/admin/assets/new` page, and wire the list page**

  Create `apps/web/components/asset-form.tsx` (shared by Task 8's edit page):

  ```tsx
  "use client";

  import { useState, useTransition } from "react";
  import { useRouter } from "next/navigation";
  import { createAsset } from "@/lib/assets/admin-actions";
  import { INCOME_STREAM_IDS, INCOME_STREAM_LABELS } from "@/lib/assets/income-streams";
  import { supportsGreenOption } from "@/lib/assets/investment-options";
  import { SITE_TYPE_OPTIONS, type AssetFormInput } from "@/lib/assets/asset-form";

  function inputFromForm(fd: FormData): AssetFormInput {
    return {
      name: String(fd.get("name") ?? ""),
      city: String(fd.get("city") ?? ""),
      country: String(fd.get("country") ?? ""),
      siteType: String(fd.get("siteType") ?? ""),
      operator: String(fd.get("operator") ?? ""),
      term: String(fd.get("term") ?? ""),
      paymentFrequency: String(fd.get("paymentFrequency") ?? ""),
      advisoryCapacityEur: String(fd.get("advisoryCapacityEur") ?? ""),
      description: String(fd.get("description") ?? ""),
      coverImageUrl: String(fd.get("coverImageUrl") ?? ""),
      incomeMix: INCOME_STREAM_IDS.map((id) => ({
        id,
        pct: String(fd.get(`mix_${id}`) ?? "")
      })),
      standardMinTicketEur: String(fd.get("standardMinTicketEur") ?? ""),
      standardYieldPct: String(fd.get("standardYieldPct") ?? ""),
      premiumEnabled: fd.get("premiumEnabled") === "on",
      premiumMinTicketEur: String(fd.get("premiumMinTicketEur") ?? ""),
      premiumYieldPct: String(fd.get("premiumYieldPct") ?? ""),
      greenEnabled: fd.get("greenEnabled") === "on",
      greenMinTicketEur: String(fd.get("greenMinTicketEur") ?? ""),
      greenYieldPct: String(fd.get("greenYieldPct") ?? "")
    };
  }

  export function AssetForm({ initial }: { initial: AssetFormInput }) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [mixPcts, setMixPcts] = useState<Record<string, string>>(() =>
      Object.fromEntries(initial.incomeMix.map((entry) => [entry.id, entry.pct]))
    );
    const [premiumOn, setPremiumOn] = useState(initial.premiumEnabled);
    const [greenOn, setGreenOn] = useState(initial.greenEnabled);

    const greenEligible = supportsGreenOption(
      INCOME_STREAM_IDS.map((id) => ({ id, pct: Number(mixPcts[id] ?? "") || 0 })).filter(
        (entry) => entry.pct > 0
      )
    );

    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      setError(null);
      const input = inputFromForm(new FormData(event.currentTarget));
      startTransition(async () => {
        const result = await createAsset(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push("/admin/assets");
        router.refresh();
      });
    }

    return (
      <form className="admin-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Name</span>
          <input name="name" type="text" defaultValue={initial.name} required />
        </label>
        <label className="form-field">
          <span>City</span>
          <input name="city" type="text" defaultValue={initial.city} required />
        </label>
        <label className="form-field">
          <span>Country</span>
          <input name="country" type="text" defaultValue={initial.country} required />
        </label>
        <label className="form-field">
          <span>Site type</span>
          <select name="siteType" defaultValue={initial.siteType}>
            <option value="">Not specified</option>
            {SITE_TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Operator</span>
          <input name="operator" type="text" defaultValue={initial.operator} required />
        </label>
        <label className="form-field">
          <span>Term</span>
          <input
            name="term"
            type="text"
            defaultValue={initial.term}
            placeholder='e.g. "12 years"'
            required
          />
        </label>
        <label className="form-field">
          <span>Target payment frequency</span>
          <select name="paymentFrequency" defaultValue={initial.paymentFrequency}>
            <option value="monthly">Monthly</option>
            <option value="other">Other / see deal documents</option>
          </select>
        </label>
        <label className="form-field">
          <span>Advisory capacity (€)</span>
          <input
            name="advisoryCapacityEur"
            type="text"
            inputMode="numeric"
            defaultValue={initial.advisoryCapacityEur}
            placeholder="e.g. 1500000"
          />
        </label>
        <p className="field-hint">Used for funding % on the consumer site. Blank clears.</p>
        <label className="form-field">
          <span>Description</span>
          <textarea name="description" rows={4} defaultValue={initial.description} required />
        </label>
        <label className="form-field">
          <span>Cover image URL</span>
          <input
            name="coverImageUrl"
            type="text"
            defaultValue={initial.coverImageUrl}
            placeholder="https://… or /site/path"
          />
        </label>

        <fieldset className="form-field">
          <legend>Income mix (%)</legend>
          <p className="field-hint">
            Must sum to 100, with vehicle parking the largest stream.
          </p>
          {INCOME_STREAM_IDS.map((id) => (
            <label className="form-field" key={id}>
              <span>{INCOME_STREAM_LABELS[id]}</span>
              <input
                name={`mix_${id}`}
                type="text"
                inputMode="decimal"
                value={mixPcts[id] ?? ""}
                onChange={(event) =>
                  setMixPcts((prev) => ({ ...prev, [id]: event.target.value }))
                }
              />
            </label>
          ))}
        </fieldset>

        <fieldset className="form-field">
          <legend>Standard option (required)</legend>
          <label className="form-field">
            <span>Minimum ticket (€)</span>
            <input
              name="standardMinTicketEur"
              type="text"
              inputMode="numeric"
              defaultValue={initial.standardMinTicketEur}
              required
            />
          </label>
          <label className="form-field">
            <span>Target yield (%)</span>
            <input
              name="standardYieldPct"
              type="text"
              inputMode="decimal"
              defaultValue={initial.standardYieldPct}
              required
            />
          </label>
        </fieldset>

        <fieldset className="form-field">
          <legend>
            <label>
              <input
                type="checkbox"
                name="premiumEnabled"
                checked={premiumOn}
                onChange={(event) => setPremiumOn(event.target.checked)}
              />{" "}
              Add Premium option
            </label>
          </legend>
          {premiumOn ? (
            <>
              <label className="form-field">
                <span>Minimum ticket (€)</span>
                <input
                  name="premiumMinTicketEur"
                  type="text"
                  inputMode="numeric"
                  defaultValue={initial.premiumMinTicketEur}
                />
              </label>
              <label className="form-field">
                <span>Target yield (%) — must be ≥ Standard</span>
                <input
                  name="premiumYieldPct"
                  type="text"
                  inputMode="decimal"
                  defaultValue={initial.premiumYieldPct}
                />
              </label>
            </>
          ) : null}
        </fieldset>

        {greenEligible ? (
          <fieldset className="form-field">
            <legend>
              <label>
                <input
                  type="checkbox"
                  name="greenEnabled"
                  checked={greenOn}
                  onChange={(event) => setGreenOn(event.target.checked)}
                />{" "}
                Add EV option
              </label>
            </legend>
            {greenOn ? (
              <>
                <label className="form-field">
                  <span>Minimum ticket (€)</span>
                  <input
                    name="greenMinTicketEur"
                    type="text"
                    inputMode="numeric"
                    defaultValue={initial.greenMinTicketEur}
                  />
                </label>
                <label className="form-field">
                  <span>Target yield (%) — must be ≥ Standard/Premium</span>
                  <input
                    name="greenYieldPct"
                    type="text"
                    inputMode="decimal"
                    defaultValue={initial.greenYieldPct}
                  />
                </label>
              </>
            ) : null}
          </fieldset>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Create draft opportunity"}
        </button>
      </form>
    );
  }
  ```

  The component is create-only here; Task 8 extends it with `mode`/`assetId` props and the `updateDraftAsset` branch (exact edits there) so this task's deliverable verifies independently.

  Create `apps/web/app/admin/assets/new/page.tsx`:

  ```tsx
  import { redirect } from "next/navigation";
  import { requireSuperAdmin } from "@/lib/auth/staff";
  import { emptyAssetFormInput } from "@/lib/assets/asset-form";
  import { AdminPageHeader } from "@/components/admin/admin-page-header";
  import { AssetForm } from "@/components/asset-form";

  export const dynamic = "force-dynamic";

  export default async function NewAssetPage() {
    try {
      await requireSuperAdmin();
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
      throw error;
    }

    return (
      <div className="admin-page">
        <AdminPageHeader
          title="New opportunity"
          subtitle="Creates a draft. Publish it from the assets list when the content is ready."
        />
        <AssetForm initial={emptyAssetFormInput()} />
      </div>
    );
  }
  ```

  Create `apps/web/lib/assets/labels.ts` (standard E: no raw enum strings):

  ```ts
  /** Friendly labels for asset status values in admin UI. */
  export const ASSET_STATUS_LABEL: Record<string, string> = {
    draft: "Draft",
    published: "Published",
    closed: "Closed"
  };
  ```

  Append one rule to `apps/web/app/globals.css` (next to the other admin rules, e.g. after `.admin-page-actions` at line 1951) — no suitable existing form class (`onboarding-form` is onboarding-specific, `admin-filter-form` is a horizontal filter bar):

  ```css
  .admin-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 640px;
  }
  ```

  Edit `apps/web/app/admin/assets/page.tsx` — three changes:

  1. Import block — before:

     ```tsx
     import { redirect } from "next/navigation";
     import { requireSuperAdmin } from "@/lib/auth/staff";
     ```

     after:

     ```tsx
     import Link from "next/link";
     import { redirect } from "next/navigation";
     import { requireSuperAdmin } from "@/lib/auth/staff";
     import { ASSET_STATUS_LABEL } from "@/lib/assets/labels";
     ```

  2. Header — before:

     ```tsx
           <AdminPageHeader
             title="Assets"
             subtitle="Publish catalogue assets, set advisory raise capacity for funding bars, and attach optional cover or gallery image URLs."
           />
     ```

     after:

     ```tsx
           <AdminPageHeader
             title="Assets"
             subtitle="Publish catalogue assets, set advisory raise capacity for funding bars, and attach optional cover or gallery image URLs."
             actions={
               <Link className="btn btn-primary" href="/admin/assets/new">
                 New opportunity
               </Link>
             }
           />
     ```

  3. Status cell — before:

     ```tsx
                     <td>{a.status}</td>
     ```

     after:

     ```tsx
                     <td>{ASSET_STATUS_LABEL[a.status] ?? a.status}</td>
     ```

  Verify (markup-only changes; no forced component test per repo convention):

  ```bash
  npx tsc --noEmit
  npx vitest run
  ```

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/asset-form.ts apps/web/lib/assets/asset-form.test.ts \
    apps/web/lib/assets/admin-actions.ts apps/web/tests/asset-admin-actions.test.ts \
    apps/web/lib/assets/labels.ts apps/web/components/asset-form.tsx \
    apps/web/app/admin/assets/new/page.tsx apps/web/app/admin/assets/page.tsx \
    apps/web/app/globals.css
  git commit -m "feat(admin): super-admin create-opportunity flow reusing catalogue invariants"
  ```

---

### Task 8: Edit-draft flow (prefilled form, drafts only)

The same `AssetForm` prefilled via a pure `assetToFormInput` mapper, served at `/admin/assets/[id]/edit` for `draft` assets only. `updateDraftAsset` re-runs full catalogue validation, writes `asset.updated`, and refuses non-draft assets; published assets remain status-managed only (the list page shows the Edit button only on draft rows, and the action is the hard gate).

**Files:**
- Modify: `apps/web/lib/assets/asset-form.ts`
- Test: `apps/web/lib/assets/asset-form.test.ts`
- Modify: `apps/web/lib/assets/admin-actions.ts`
- Test: `apps/web/tests/asset-admin-actions.test.ts`
- Create: `apps/web/app/admin/assets/[id]/edit/page.tsx`
- Modify: `apps/web/components/asset-form.tsx`
- Modify: `apps/web/app/admin/assets/new/page.tsx` (pass `mode="create"`)
- Modify: `apps/web/app/admin/assets/page.tsx`

**Interfaces:**
- Consumes (from Task 7): `AssetFormInput`, `ValidatedAssetForm`, `validateAssetForm`, `AssetForm` component, `isUniqueViolation` pattern and the `{ ok, error }` / `requireSuperAdmin` / audit conventions in `lib/assets/admin-actions.ts`.
- Produces:
  - `assetToFormInput(asset: Asset): AssetFormInput` (`lib/assets/asset-form.ts`)
  - `updateDraftAsset(input: { assetId: string; form: AssetFormInput }): Promise<{ ok: true } | { ok: false; error: string }>` — writes `asset.updated` audit event

- [ ] **Step 1: Write the failing test for `assetToFormInput`**

  Append to `apps/web/lib/assets/asset-form.test.ts` (extend the import from `@/lib/assets/asset-form` with `assetToFormInput`, and add `import type { Asset } from "@/lib/assets";`):

  ```ts
  describe("assetToFormInput", () => {
    const asset = {
      id: "asset-1",
      slug: "lisbon-airport-parking",
      name: "Lisbon Airport Parking",
      operator: "ParkOperator Lda",
      city: "Lisbon",
      district: "Lisbon",
      country: "Portugal",
      targetYieldPct: "7.70",
      tier: "Standard",
      minTicketEur: 9900,
      spaces: 0,
      occupancyPct: "0.00",
      leaseLabel: "12 years",
      blurb: "Busy airport car park next to the terminal.",
      status: "draft",
      advisoryCapacityEur: 1500000,
      artVariant: 0,
      incomeMix: [
        { id: "vehicle_parking", pct: 80 },
        { id: "ev_charging", pct: 20 }
      ],
      visitorsPerDay: null,
      visitorsProvenance: "withheld",
      availableSpaces: null,
      annualRevenueEur: null,
      revenueProvenance: "withheld",
      commercialTermIds: [
        "triple_net",
        "contractual_monthly_rent",
        "indexation_floor",
        "parkwise_protections",
        "flexible_term"
      ],
      investmentOptions: [
        {
          id: "standard",
          label: "Standard option",
          recommended: true,
          minTicketEur: 9900,
          yieldPct: 7.7,
          monthlyIncomeEur: 64,
          annualIncomeEur: 762,
          commercialTermIds: []
        },
        {
          id: "green",
          label: "EV option",
          recommended: false,
          minTicketEur: 15000,
          yieldPct: 8.5,
          monthlyIncomeEur: 106,
          annualIncomeEur: 1275,
          commercialTermIds: []
        }
      ],
      operatorDisplay: null,
      siteType: "airport",
      coverImageUrl: "https://images.example.com/lisbon.jpg",
      galleryImageUrls: [],
      createdAt: new Date("2026-07-23T00:00:00Z"),
      updatedAt: new Date("2026-07-23T00:00:00Z")
    } as unknown as Asset;

    it("maps a draft asset back to raw form inputs", () => {
      const input = assetToFormInput(asset);
      expect(input.name).toBe("Lisbon Airport Parking");
      expect(input.term).toBe("12 years");
      expect(input.paymentFrequency).toBe("monthly");
      expect(input.advisoryCapacityEur).toBe("1500000");
      expect(input.description).toContain("airport car park");
      expect(input.coverImageUrl).toBe("https://images.example.com/lisbon.jpg");
      expect(input.incomeMix).toEqual([
        { id: "vehicle_parking", pct: "80" },
        { id: "ev_charging", pct: "20" }
      ]);
      expect(input.standardMinTicketEur).toBe("9900");
      expect(input.standardYieldPct).toBe("7.7");
      expect(input.premiumEnabled).toBe(false);
      expect(input.greenEnabled).toBe(true);
      expect(input.greenMinTicketEur).toBe("15000");
      expect(input.greenYieldPct).toBe("8.5");
    });

    it("round-trips through validateAssetForm", () => {
      const result = validateAssetForm(assetToFormInput(asset));
      expect(result.ok).toBe(true);
    });

    it("maps non-monthly assets to the other frequency", () => {
      const other = {
        ...asset,
        commercialTermIds: asset.commercialTermIds.filter(
          (id: string) => id !== "contractual_monthly_rent"
        )
      } as unknown as Asset;
      expect(assetToFormInput(other).paymentFrequency).toBe("other");
    });
  });
  ```

  Run — expect failure (`assetToFormInput is not a function`):

  ```bash
  npx vitest run lib/assets/asset-form.test.ts
  ```

- [ ] **Step 2: Implement `assetToFormInput`**

  Append to `apps/web/lib/assets/asset-form.ts` (and add `import type { Asset } from "@/lib/assets";` to its import block — type-only, so no client-bundle or cycle concerns):

  ```ts
  /** Prefill mapping for the edit-draft form: DB row back to raw form inputs. */
  export function assetToFormInput(asset: Asset): AssetFormInput {
    const options = asset.investmentOptions ?? [];
    const standard = options.find((o) => o.id === "standard");
    const premium = options.find((o) => o.id === "premium");
    const green = options.find((o) => o.id === "green");
    return {
      name: asset.name,
      city: asset.city,
      country: asset.country,
      siteType: asset.siteType ?? "",
      operator: asset.operator,
      term: asset.leaseLabel,
      paymentFrequency: asset.commercialTermIds.includes("contractual_monthly_rent")
        ? "monthly"
        : "other",
      advisoryCapacityEur:
        asset.advisoryCapacityEur != null ? String(asset.advisoryCapacityEur) : "",
      description: asset.blurb,
      coverImageUrl: asset.coverImageUrl ?? "",
      incomeMix: asset.incomeMix.map((entry) => ({ id: entry.id, pct: String(entry.pct) })),
      standardMinTicketEur: standard ? String(standard.minTicketEur) : "",
      standardYieldPct: standard ? String(standard.yieldPct) : "",
      premiumEnabled: Boolean(premium),
      premiumMinTicketEur: premium ? String(premium.minTicketEur) : "",
      premiumYieldPct: premium ? String(premium.yieldPct) : "",
      greenEnabled: Boolean(green),
      greenMinTicketEur: green ? String(green.minTicketEur) : "",
      greenYieldPct: green ? String(green.yieldPct) : ""
    };
  }
  ```

  Run — expect pass:

  ```bash
  npx vitest run lib/assets/asset-form.test.ts
  ```

- [ ] **Step 3: Write the failing `updateDraftAsset` action tests, then implement the action**

  Append to `apps/web/tests/asset-admin-actions.test.ts` (extend the action import to `import { createAsset, updateDraftAsset } from "@/lib/assets/admin-actions";`, add `const updateMock = db.update as unknown as ReturnType<typeof vi.fn>;` next to the other mock aliases, and reuse the `validInput` helper already in the file):

  ```ts
  /** Queue one db.select chain resolving to `rows`. */
  function mockSelect(rows: unknown) {
    selectMock.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) })
    }));
  }

  describe("updateDraftAsset", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(requireSuperAdmin).mockResolvedValue({
        user: { id: "user-1", email: "admin@example.com" },
        staff: { id: "staff-1", role: "super_admin", ibId: null },
        role: "super_admin"
      });
    });

    it("returns Forbidden when the caller is not a super admin", async () => {
      vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

      const result = await updateDraftAsset({ assetId: "asset-1", form: validInput() });

      expect(result).toEqual({ ok: false, error: "Forbidden." });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("returns an error when the asset does not exist", async () => {
      mockSelect([]);

      const result = await updateDraftAsset({ assetId: "missing", form: validInput() });

      expect(result).toEqual({ ok: false, error: "Asset not found." });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("refuses to edit a published asset", async () => {
      mockSelect([{ id: "asset-1", status: "published", slug: "lisbon-airport-parking" }]);

      const result = await updateDraftAsset({ assetId: "asset-1", form: validInput() });

      expect(result).toEqual({
        ok: false,
        error: "Only draft opportunities can be edited."
      });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("rejects invalid input without updating", async () => {
      mockSelect([{ id: "asset-1", status: "draft", slug: "lisbon-airport-parking" }]);

      const result = await updateDraftAsset({
        assetId: "asset-1",
        form: validInput({ name: " " })
      });

      expect(result).toEqual({ ok: false, error: "Name is required." });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("updates the draft and writes the asset.updated audit event", async () => {
      mockSelect([{ id: "asset-1", status: "draft", slug: "lisbon-airport-parking" }]);
      const setSpy = vi.fn(() => ({ where: () => Promise.resolve(undefined) }));
      updateMock.mockImplementationOnce(() => ({ set: setSpy }));
      const auditValues = vi.fn();
      insertMock.mockImplementationOnce(() => ({ values: auditValues }));

      const result = await updateDraftAsset({
        assetId: "asset-1",
        form: validInput({ name: "Lisbon Airport Parking — Terminal 2" })
      });

      expect(result).toEqual({ ok: true });
      expect(setSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Lisbon Airport Parking — Terminal 2",
          leaseLabel: "12 years"
        })
      );
      // Slug is identity: a rename must not rewrite it.
      expect(setSpy.mock.calls[0]![0]).not.toHaveProperty("slug");
      expect(auditValues).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: "user-1",
          action: "asset.updated",
          entityType: "asset",
          entityId: "asset-1"
        })
      );
      expect(revalidatePath).toHaveBeenCalledWith("/admin/assets");
      expect(revalidatePath).toHaveBeenCalledWith("/opportunities/lisbon-airport-parking");
    });
  });
  ```

  Run — expect failure (`updateDraftAsset is not a function`):

  ```bash
  npx vitest run tests/asset-admin-actions.test.ts
  ```

  Then append the action to `apps/web/lib/assets/admin-actions.ts` (after `createAsset`; no new imports needed beyond `validateAssetForm` / `AssetFormInput` added in Task 7):

  ```ts
  export async function updateDraftAsset(input: {
    assetId: string;
    form: AssetFormInput;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    let userId: string;
    try {
      const staff = await requireSuperAdmin();
      userId = staff.user.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "UNAUTHENTICATED") return { ok: false, error: "Unauthenticated." };
      return { ok: false, error: "Forbidden." };
    }

    const [existing] = await db
      .select()
      .from(assets)
      .where(eq(assets.id, input.assetId))
      .limit(1);
    if (!existing) return { ok: false, error: "Asset not found." };
    if (existing.status !== "draft") {
      return { ok: false, error: "Only draft opportunities can be edited." };
    }

    const parsed = validateAssetForm(input.form);
    if (!parsed.ok) return parsed;

    // Slug is identity (consumer URLs); a rename does not rewrite it.
    const { slug: _slug, ...updateValues } = parsed.values;
    await db
      .update(assets)
      .set({ ...updateValues, updatedAt: new Date() })
      .where(eq(assets.id, input.assetId));

    await db.insert(auditEvents).values({
      actorUserId: userId,
      action: "asset.updated",
      entityType: "asset",
      entityId: input.assetId,
      payload: { slug: existing.slug, name: parsed.values.name }
    });

    revalidatePath("/admin/assets");
    revalidatePath("/opportunities");
    revalidatePath(`/opportunities/${existing.slug}`);
    revalidatePath("/");
    return { ok: true };
  }
  ```

  Run — expect pass:

  ```bash
  npx vitest run tests/asset-admin-actions.test.ts lib/assets/asset-form.test.ts
  ```

- [ ] **Step 4: Extend `AssetForm` for edit mode, create the edit page, and gate the list-page Edit button to drafts**

  Edit `apps/web/components/asset-form.tsx` — three changes:

  1. Action import — before:

     ```tsx
     import { createAsset } from "@/lib/assets/admin-actions";
     ```

     after:

     ```tsx
     import { createAsset, updateDraftAsset } from "@/lib/assets/admin-actions";
     ```

  2. Props — before:

     ```tsx
     export function AssetForm({ initial }: { initial: AssetFormInput }) {
     ```

     after:

     ```tsx
     export function AssetForm({
       mode,
       assetId,
       initial
     }: {
       mode: "create" | "edit";
       assetId?: string;
       initial: AssetFormInput;
     }) {
     ```

  3. Submit branch and button label — before:

     ```tsx
         startTransition(async () => {
           const result = await createAsset(input);
     ```

     after:

     ```tsx
         startTransition(async () => {
           const result =
             mode === "create"
               ? await createAsset(input)
               : await updateDraftAsset({ assetId: assetId!, form: input });
     ```

     and — before:

     ```tsx
           <button className="btn btn-primary" type="submit" disabled={isPending}>
             {isPending ? "Saving…" : "Create draft opportunity"}
           </button>
     ```

     after:

     ```tsx
           <button className="btn btn-primary" type="submit" disabled={isPending}>
             {isPending
               ? "Saving…"
               : mode === "create"
                 ? "Create draft opportunity"
                 : "Save draft"}
           </button>
     ```

  Also update the create page `apps/web/app/admin/assets/new/page.tsx` — before:

  ```tsx
        <AssetForm initial={emptyAssetFormInput()} />
  ```

  after:

  ```tsx
        <AssetForm mode="create" initial={emptyAssetFormInput()} />
  ```

  Create `apps/web/app/admin/assets/[id]/edit/page.tsx`:

  ```tsx
  import { eq } from "drizzle-orm";
  import { notFound, redirect } from "next/navigation";
  import { requireSuperAdmin } from "@/lib/auth/staff";
  import { assets, db } from "@/lib/db";
  import { assetToFormInput } from "@/lib/assets/asset-form";
  import { AdminPageHeader } from "@/components/admin/admin-page-header";
  import { AssetForm } from "@/components/asset-form";

  export const dynamic = "force-dynamic";

  export default async function EditAssetPage({
    params
  }: {
    params: Promise<{ id: string }>;
  }) {
    try {
      await requireSuperAdmin();
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
      throw error;
    }

    const { id } = await params;
    const [asset] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
    if (!asset) notFound();
    // Published assets stay status-managed only (spec C.2).
    if (asset.status !== "draft") redirect("/admin/assets");

    return (
      <div className="admin-page">
        <AdminPageHeader
          title={`Edit ${asset.name}`}
          subtitle="Draft opportunity — publish it from the assets list when the content is ready."
        />
        <AssetForm mode="edit" assetId={asset.id} initial={assetToFormInput(asset)} />
      </div>
    );
  }
  ```

  Edit `apps/web/app/admin/assets/page.tsx` — Actions cell. Before:

  ```tsx
                <td>
                  <AssetStatusActions assetId={a.id} status={a.status} />
                </td>
  ```

  After:

  ```tsx
                <td>
                  <AssetStatusActions assetId={a.id} status={a.status} />
                  {a.status === "draft" ? (
                    <Link className="btn btn-ghost btn-sm" href={`/admin/assets/${a.id}/edit`}>
                      Edit
                    </Link>
                  ) : null}
                </td>
  ```

  (`Link` is already imported from Task 7 Step 5.)

  Verify (markup-only changes):

  ```bash
  npx tsc --noEmit
  npx vitest run
  ```

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/asset-form.ts apps/web/lib/assets/asset-form.test.ts \
    apps/web/lib/assets/admin-actions.ts apps/web/tests/asset-admin-actions.test.ts \
    "apps/web/app/admin/assets/[id]/edit/page.tsx" apps/web/app/admin/assets/page.tsx \
    apps/web/components/asset-form.tsx apps/web/app/admin/assets/new/page.tsx
  git commit -m "feat(admin): edit draft opportunities with prefilled validated form"
  ```

---

# Parkwise CRM Redesign — Plan Part: Dashboard

Date: 2026-07-23
Spec: `docs/superpowers/specs/2026-07-23-crm-redesign-design.md` (section D, cross-cutting standards in section E)
Area: `/admin` dashboard rework
Canonical app: `apps/web` — run all commands from `/Users/mac/Documents/Park/apps/web` with `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` first.

---

### Task 9: /admin dashboard rework — KPI row, activity feed, stale-leads widget

**Files:**
- Create: `apps/web/lib/admin/dashboard.ts`
- Create: `apps/web/tests/admin-dashboard.test.ts`
- Modify: `apps/web/app/admin/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: nothing from earlier tasks. Read-side only; the page keeps calling the existing `getPendingInterestCountsForStaff(scope)` (`lib/interests/queries.ts`), `getLeadDashboardCounts()` / `listLeadsForStaff()` / `listLeadListsForStaff()` (`lib/leads/queries.ts`), `listInvestorsForStaff()` (`lib/investors/queries.ts`), `listStaff()` (`lib/staff/queries.ts`), `countAssets()` (`lib/assets/queries.ts`) for the preserved queues section. Scope checks reuse `investorVisibleToStaff` (`lib/auth/staff.ts`) and `leadVisibleToStaff` (`lib/leads/scope.ts`).
- Produces (from `lib/admin/dashboard.ts`; the investors-area Activity-tab task may reuse `describeAuditEvent` / `formatRelativeTime` instead of duplicating them):
  - `export type StaffScope = { role: StaffRole; staffId: string }`
  - `export type AdminDashboardKpis = { investorsInBook: number; newLeadsThisWeek: number; pendingKyc: number; scheduledDistributions: number }`
  - `export type ScopedAuditEvent = { id: string; action: string; entityType: string; entityId: string | null; payload: Record<string, unknown>; actorEmail: string | null; createdAt: Date }`
  - `export type ActivityScopeLookups = { investors: Map<string, { assignedAgentId: string | null; ibId: string | null }>; leads: Map<string, { assignedAgentId: string | null; ibId: string | null }>; interestInvestorIds: Map<string, string>; distributionInvestorIds: Map<string, string>; documents: Map<string, { ownerType: string; ownerId: string | null }> }`
  - `export const ACTIVITY_FEED_LIMIT = 15`
  - `export const STALE_LEAD_AFTER_DAYS = 7`
  - `export function formatRelativeTime(date: Date, now?: Date): string`
  - `export function describeAuditEvent(event: { action: string; entityType: string; payload: Record<string, unknown> }): string`
  - `export function isAuditEventVisibleForStaff(scope: StaffScope, event: { entityType: string; entityId: string | null }, lookups: ActivityScopeLookups): boolean`
  - `export async function getAdminDashboardKpis(scope: StaffScope): Promise<AdminDashboardKpis>`
  - `export async function getStaleLeadCountForStaff(scope: StaffScope): Promise<number>`
  - `export async function listScopedActivityForStaff(scope: StaffScope, limit?: number): Promise<ScopedAuditEvent[]>`

Notes on scope decisions (spec D + house rules):
- "Pending KYC" = investors with `kycStatus` in (`submitted`, `under_review`) — the two states where staff action is pending (`lib/db/schema.ts` kycStatus enum: `not_started | submitted | under_review | approved | rejected`).
- "Distributions due this month" = count of `distributions.status = 'scheduled'` in the staff member's book. The `distributions` table has no due-date column (only `paidAt` and free-text `periodLabel`), so the spec's parenthetical "(scheduled count)" is the implementable definition.
- Stale-lead predicate mirrors spec A.2: non-terminal (`status not in ('unqualified','duplicate','converted')`) and `lastActivityAt` older than 7 days. If the leads-area task extracts a shared stale predicate, this module should import it at assembly instead of keeping its own constant.
- Staff-scoped query functions take the already-authorized `{ role, staffId }` explicitly and `requireStaff` stays in the page — the established pattern in `lib/interests/queries.ts` ("Staff-scoped functions take the already-authorized role/id explicitly").

- [ ] **Step 1: `formatRelativeTime` — failing test**

  Create `apps/web/tests/admin-dashboard.test.ts`. The `vi.mock("@/lib/db")` factory lists every table `lib/admin/dashboard.ts` will import; later steps only append `describe` blocks and never touch this preamble again.

  ```ts
  import { beforeEach, describe, expect, it, vi } from "vitest";

  vi.mock("@/lib/db", () => ({
    db: { select: vi.fn() },
    auditEvents: {},
    distributions: {},
    documents: {},
    interests: {},
    investors: {},
    leads: {},
    user: {}
  }));

  import { db } from "@/lib/db";
  import {
    describeAuditEvent,
    formatRelativeTime,
    getAdminDashboardKpis,
    getStaleLeadCountForStaff,
    isAuditEventVisibleForStaff,
    listScopedActivityForStaff
  } from "@/lib/admin/dashboard";

  const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

  /** Queue one db.select chain resolving to `rows` at `.where(...)` (with optional innerJoin in between). */
  function mockWhereSelect(rows: unknown) {
    const whereResult = Promise.resolve(rows);
    selectMock.mockImplementationOnce(() => ({
      from: () => ({
        where: () => whereResult,
        innerJoin: () => ({ where: () => whereResult })
      })
    }));
  }

  /** Queue the audit-events feed select chain (terminal `.limit()`). */
  function mockFeedSelect(rows: unknown) {
    selectMock.mockImplementationOnce(() => ({
      from: () => ({
        leftJoin: () => ({
          orderBy: () => ({ limit: () => Promise.resolve(rows) })
        })
      })
    }));
  }

  describe("formatRelativeTime", () => {
    const now = new Date("2026-07-23T12:00:00Z");

    it("renders compact relative labels", () => {
      expect(formatRelativeTime(new Date("2026-07-23T11:59:40Z"), now)).toBe("just now");
      expect(formatRelativeTime(new Date("2026-07-23T11:45:00Z"), now)).toBe("15 min ago");
      expect(formatRelativeTime(new Date("2026-07-23T09:00:00Z"), now)).toBe("3 h ago");
      expect(formatRelativeTime(new Date("2026-07-21T12:00:00Z"), now)).toBe("2 d ago");
    });

    it("falls back to a short date after a week", () => {
      expect(formatRelativeTime(new Date("2026-07-10T12:00:00Z"), now)).toBe("10 Jul");
    });
  });
  ```

  Run:

  ```bash
  cd /Users/mac/Documents/Park/apps/web
  export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
  npx vitest run tests/admin-dashboard.test.ts
  ```

  Expected: FAIL — `Failed to resolve import "@/lib/admin/dashboard"`.

- [ ] **Step 2: `formatRelativeTime` — minimal implementation**

  Create `apps/web/lib/admin/dashboard.ts`:

  ```ts
  import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
  import type { StaffRole } from "@/lib/auth/roles";
  import { investorVisibleToStaff } from "@/lib/auth/staff";
  import {
    auditEvents,
    db,
    distributions,
    documents,
    interests,
    investors,
    leads,
    user
  } from "@/lib/db";
  import { leadVisibleToStaff } from "@/lib/leads/scope";

  /**
   * Read-side data access for the /admin dashboard. Plain module (no
   * "use server"): runs inside the admin page only. Staff-scoped functions
   * take the already-authorized role/id explicitly — requireStaff stays in
   * the page (same pattern as lib/interests/queries.ts).
   */

  export type StaffScope = { role: StaffRole; staffId: string };

  /** Compact relative timestamp for the activity feed ("15 min ago", "3 h ago"). */
  export function formatRelativeTime(date: Date, now: Date = new Date()): string {
    const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} d ago`;
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  ```

  (The remaining imports are unused until later steps; TypeScript's default config in this repo does not error on unused imports — confirm with `npx tsc --noEmit` in step 13 and trim then if it does.)

  Run:

  ```bash
  npx vitest run tests/admin-dashboard.test.ts
  ```

  Expected: PASS (2 tests).

  Commit:

  ```bash
  git add apps/web/lib/admin/dashboard.ts apps/web/tests/admin-dashboard.test.ts
  git commit -m "feat(admin): relative-time helper for dashboard activity feed"
  ```

- [ ] **Step 3: `describeAuditEvent` — failing test**

  Append to `tests/admin-dashboard.test.ts`:

  ```ts
  describe("describeAuditEvent", () => {
    it("renders friendly lines for known actions", () => {
      expect(
        describeAuditEvent({ action: "lead.status_changed", entityType: "lead", payload: { status: "qualified" } })
      ).toBe("moved a lead to Qualified");
      expect(
        describeAuditEvent({ action: "kyc.submitted", entityType: "investor", payload: { files: 2 } })
      ).toBe("submitted KYC documents");
      expect(
        describeAuditEvent({ action: "distribution.recorded", entityType: "distribution", payload: {} })
      ).toBe("recorded a distribution");
      expect(
        describeAuditEvent({ action: "interest.confirmed", entityType: "interest", payload: {} })
      ).toBe("confirmed an investment");
    });

    it("uses label maps — never raw enum strings — and has a safe fallback", () => {
      expect(
        describeAuditEvent({ action: "lead.status_changed", entityType: "lead", payload: { status: "unqualified" } })
      ).toBe("moved a lead to Unqualified");
      // Unknown actions must not leak the raw action key into the UI.
      expect(
        describeAuditEvent({ action: "staff.two_factor_reset", entityType: "staff_profile", payload: {} })
      ).toBe("recorded an activity");
    });
  });
  ```

  Run `npx vitest run tests/admin-dashboard.test.ts`. Expected: FAIL — `describeAuditEvent is not a function`.

- [ ] **Step 4: `describeAuditEvent` — minimal implementation**

  Append to `lib/admin/dashboard.ts`:

  ```ts
  /** Lead-stage labels for friendly feed lines (label-map pattern from lib/portal/labels.ts). */
  const LEAD_STATUS_LABEL: Record<string, string> = {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    unqualified: "Unqualified",
    duplicate: "Duplicate",
    converted: "Converted"
  };

  /**
   * Friendly sentence fragment for one audit event, rendered after the actor
   * email ("sara@… moved a lead to Qualified"). Never returns the raw action
   * key: unknown actions fall back to a generic line.
   */
  export function describeAuditEvent(event: {
    action: string;
    entityType: string;
    payload: Record<string, unknown>;
  }): string {
    const status = typeof event.payload.status === "string" ? event.payload.status : null;
    switch (event.action) {
      case "lead.status_changed":
        return `moved a lead to ${LEAD_STATUS_LABEL[status ?? ""] ?? "a new stage"}`;
      case "lead.call_logged":
        return "logged a call with a lead";
      case "lead.follow_up_changed":
        return "updated a lead follow-up date";
      case "lead.linked_on_signup":
        return "linked a lead to a new sign-up";
      case "leads.uploaded":
        return "uploaded leads from CSV";
      case "lead_list.created":
        return "created a lead list";
      case "investor.created":
        return "added an investor";
      case "investor.assigned":
        return "reassigned an investor";
      case "investor.invited":
        return "invited an investor to the portal";
      case "kyc.submitted":
        return "submitted KYC documents";
      case "kyc.document_uploaded":
      case "kyc.assisted_upload":
        return "uploaded a KYC document";
      case "kyc.approved":
        return "approved KYC";
      case "kyc.under_review":
        return "marked KYC as under review";
      case "kyc.rejected":
        return "rejected KYC";
      case "interest.created":
        return "registered an investment interest";
      case "interest.confirm_first_approval":
        return "gave a first approval to an investment";
      case "interest.confirmed":
        return "confirmed an investment";
      case "interest.declined":
        return "declined an interest";
      case "interest.withdrawn":
        return "withdrew an interest";
      case "distribution.recorded":
        return "recorded a distribution";
      case "document.uploaded":
        return "uploaded a document";
      case "document.downloaded":
        return "downloaded a document";
      case "application.submitted":
        return "received an application";
      case "application.contacted":
        return "marked an application as contacted";
      case "application.rejected":
        return "rejected an application";
      case "asset.status_changed":
        return "changed an opportunity status";
      case "asset.capacity_updated":
        return "updated opportunity capacity";
      case "asset.images_updated":
        return "updated opportunity images";
      default:
        return "recorded an activity";
    }
  }
  ```

  Run `npx vitest run tests/admin-dashboard.test.ts`. Expected: PASS (4 tests).

  Commit:

  ```bash
  git add apps/web/lib/admin/dashboard.ts apps/web/tests/admin-dashboard.test.ts
  git commit -m "feat(admin): friendly audit-event lines for dashboard feed"
  ```

- [ ] **Step 5: `isAuditEventVisibleForStaff` — failing test**

  Append to `tests/admin-dashboard.test.ts`:

  ```ts
  describe("isAuditEventVisibleForStaff", () => {
    const lookups = {
      investors: new Map([
        ["inv-own", { assignedAgentId: "agent-1", ibId: "ib-1" }],
        ["inv-other", { assignedAgentId: "agent-2", ibId: "ib-2" }]
      ]),
      leads: new Map([
        ["lead-own", { assignedAgentId: "agent-1", ibId: "ib-1" }],
        ["lead-other", { assignedAgentId: "agent-2", ibId: "ib-2" }]
      ]),
      interestInvestorIds: new Map([["int-1", "inv-own"], ["int-2", "inv-other"]]),
      distributionInvestorIds: new Map([["dist-1", "inv-own"]]),
      documents: new Map([
        ["doc-inv", { ownerType: "investor", ownerId: "inv-own" }],
        ["doc-asset", { ownerType: "asset", ownerId: "asset-1" }]
      ])
    };
    const agent = { role: "agent" as const, staffId: "agent-1" };

    it("super admin sees everything", () => {
      expect(
        isAuditEventVisibleForStaff(
          { role: "super_admin", staffId: "s1" },
          { entityType: "staff_profile", entityId: "x" },
          lookups
        )
      ).toBe(true);
    });

    it("agent sees own-book investor and lead events only", () => {
      expect(isAuditEventVisibleForStaff(agent, { entityType: "investor", entityId: "inv-own" }, lookups)).toBe(true);
      expect(isAuditEventVisibleForStaff(agent, { entityType: "investor", entityId: "inv-other" }, lookups)).toBe(false);
      expect(isAuditEventVisibleForStaff(agent, { entityType: "lead", entityId: "lead-own" }, lookups)).toBe(true);
      expect(isAuditEventVisibleForStaff(agent, { entityType: "lead", entityId: "lead-other" }, lookups)).toBe(false);
    });

    it("ib sees team-book events, scoped by ibId", () => {
      const ib = { role: "ib" as const, staffId: "ib-1" };
      expect(isAuditEventVisibleForStaff(ib, { entityType: "investor", entityId: "inv-own" }, lookups)).toBe(true);
      expect(isAuditEventVisibleForStaff(ib, { entityType: "lead", entityId: "lead-other" }, lookups)).toBe(false);
    });

    it("resolves interest and distribution events through their investor", () => {
      expect(isAuditEventVisibleForStaff(agent, { entityType: "interest", entityId: "int-1" }, lookups)).toBe(true);
      expect(isAuditEventVisibleForStaff(agent, { entityType: "interest", entityId: "int-2" }, lookups)).toBe(false);
      expect(isAuditEventVisibleForStaff(agent, { entityType: "distribution", entityId: "dist-1" }, lookups)).toBe(true);
    });

    it("skips events whose entity is not resolvable in scope", () => {
      expect(isAuditEventVisibleForStaff(agent, { entityType: "investor", entityId: "inv-gone" }, lookups)).toBe(false);
      expect(isAuditEventVisibleForStaff(agent, { entityType: "lead", entityId: null }, lookups)).toBe(false);
      // staff_profile / lead_list events are super-admin only.
      expect(isAuditEventVisibleForStaff(agent, { entityType: "staff_profile", entityId: "sp-1" }, lookups)).toBe(false);
      expect(isAuditEventVisibleForStaff(agent, { entityType: "lead_list", entityId: "ll-1" }, lookups)).toBe(false);
    });

    it("documents follow their owner; asset events are staff-wide", () => {
      expect(isAuditEventVisibleForStaff(agent, { entityType: "document", entityId: "doc-inv" }, lookups)).toBe(true);
      expect(isAuditEventVisibleForStaff(agent, { entityType: "document", entityId: "doc-asset" }, lookups)).toBe(true);
      expect(isAuditEventVisibleForStaff(agent, { entityType: "asset", entityId: "asset-1" }, lookups)).toBe(true);
    });
  });
  ```

  Run `npx vitest run tests/admin-dashboard.test.ts`. Expected: FAIL — `isAuditEventVisibleForStaff is not a function`.

- [ ] **Step 6: `isAuditEventVisibleForStaff` — minimal implementation**

  Append to `lib/admin/dashboard.ts`:

  ```ts
  /** Batch-loaded ownership records used to scope the activity feed without N+1 queries. */
  export type ActivityScopeLookups = {
    investors: Map<string, { assignedAgentId: string | null; ibId: string | null }>;
    leads: Map<string, { assignedAgentId: string | null; ibId: string | null }>;
    interestInvestorIds: Map<string, string>;
    distributionInvestorIds: Map<string, string>;
    documents: Map<string, { ownerType: string; ownerId: string | null }>;
  };

  /**
   * Whether one audit event belongs to the staff member's book. Events whose
   * entity cannot be resolved in scope are skipped (spec D.3); staff_profile
   * and lead_list events are super-admin only; asset and non-investor
   * document events are staff-wide (catalogue/ops level, no book boundary).
   */
  export function isAuditEventVisibleForStaff(
    scope: StaffScope,
    event: { entityType: string; entityId: string | null },
    lookups: ActivityScopeLookups
  ): boolean {
    if (scope.role === "super_admin") return true;

    const investorVisible = (investorId: string | null | undefined): boolean => {
      if (!investorId) return false;
      const investor = lookups.investors.get(investorId);
      if (!investor) return false;
      return investorVisibleToStaff({ role: scope.role, staffId: scope.staffId, investor });
    };

    switch (event.entityType) {
      case "investor":
        return investorVisible(event.entityId);
      case "lead": {
        const lead = event.entityId ? lookups.leads.get(event.entityId) : undefined;
        if (!lead) return false;
        return leadVisibleToStaff({ role: scope.role, staffId: scope.staffId, lead });
      }
      case "interest":
        return investorVisible(event.entityId ? lookups.interestInvestorIds.get(event.entityId) : null);
      case "distribution":
        return investorVisible(
          event.entityId ? lookups.distributionInvestorIds.get(event.entityId) : null
        );
      case "document": {
        const doc = event.entityId ? lookups.documents.get(event.entityId) : undefined;
        if (!doc) return false;
        if (doc.ownerType === "investor") return investorVisible(doc.ownerId);
        return true;
      }
      case "asset":
        return true;
      default:
        return false;
    }
  }
  ```

  Run `npx vitest run tests/admin-dashboard.test.ts`. Expected: PASS (10 tests).

  Commit:

  ```bash
  git add apps/web/lib/admin/dashboard.ts apps/web/tests/admin-dashboard.test.ts
  git commit -m "feat(admin): scoped visibility check for dashboard activity feed"
  ```

- [ ] **Step 7: `getAdminDashboardKpis` — failing test**

  Append to `tests/admin-dashboard.test.ts` (the `beforeEach` lives at file scope so every query describe gets it; add it directly above this block):

  ```ts
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAdminDashboardKpis", () => {
    it("counts investors in book, new leads this week, pending KYC and scheduled distributions", async () => {
      mockWhereSelect([{ id: "i1" }, { id: "i2" }]); // investors in book
      mockWhereSelect([{ id: "l1" }]); // new leads this week
      mockWhereSelect([{ id: "i3" }]); // pending KYC (submitted / under_review)
      mockWhereSelect([{ id: "d1" }, { id: "d2" }, { id: "d3" }]); // scheduled distributions

      const kpis = await getAdminDashboardKpis({ role: "agent", staffId: "agent-1" });

      expect(kpis).toEqual({
        investorsInBook: 2,
        newLeadsThisWeek: 1,
        pendingKyc: 1,
        scheduledDistributions: 3
      });
    });

    it("returns zeroes for an empty book", async () => {
      mockWhereSelect([]);
      mockWhereSelect([]);
      mockWhereSelect([]);
      mockWhereSelect([]);

      const kpis = await getAdminDashboardKpis({ role: "super_admin", staffId: "s1" });

      expect(kpis).toEqual({
        investorsInBook: 0,
        newLeadsThisWeek: 0,
        pendingKyc: 0,
        scheduledDistributions: 0
      });
    });
  });
  ```

  Run `npx vitest run tests/admin-dashboard.test.ts`. Expected: FAIL — `getAdminDashboardKpis is not a function`.

- [ ] **Step 8: `getAdminDashboardKpis` — minimal implementation**

  Append to `lib/admin/dashboard.ts`. Follows the "select scoped ids, count `.length`" style of `getPendingInterestCountsForStaff` in `lib/interests/queries.ts`.

  ```ts
  export type AdminDashboardKpis = {
    investorsInBook: number;
    newLeadsThisWeek: number;
    pendingKyc: number;
    scheduledDistributions: number;
  };

  /**
   * KPI row for /admin: investors in book, leads created in the last 7 days,
   * KYC awaiting staff review (submitted / under_review), and scheduled
   * distributions — all scoped to the caller's book (super admin: whole pool).
   */
  export async function getAdminDashboardKpis(scope: StaffScope): Promise<AdminDashboardKpis> {
    const investorScope =
      scope.role === "super_admin"
        ? undefined
        : scope.role === "ib"
          ? eq(investors.ibId, scope.staffId)
          : eq(investors.assignedAgentId, scope.staffId);
    const leadScope =
      scope.role === "super_admin"
        ? undefined
        : scope.role === "ib"
          ? eq(leads.ibId, scope.staffId)
          : eq(leads.assignedAgentId, scope.staffId);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [investorRows, newLeadRows, kycRows, distributionRows] = await Promise.all([
      db.select({ id: investors.id }).from(investors).where(investorScope),
      db
        .select({ id: leads.id })
        .from(leads)
        .where(and(gte(leads.createdAt, weekAgo), leadScope)),
      db
        .select({ id: investors.id })
        .from(investors)
        .where(and(inArray(investors.kycStatus, ["submitted", "under_review"]), investorScope)),
      db
        .select({ id: distributions.id })
        .from(distributions)
        .innerJoin(investors, eq(distributions.investorId, investors.id))
        .where(and(eq(distributions.status, "scheduled"), investorScope))
    ]);

    return {
      investorsInBook: investorRows.length,
      newLeadsThisWeek: newLeadRows.length,
      pendingKyc: kycRows.length,
      scheduledDistributions: distributionRows.length
    };
  }
  ```

  Run `npx vitest run tests/admin-dashboard.test.ts`. Expected: PASS (12 tests).

  Commit:

  ```bash
  git add apps/web/lib/admin/dashboard.ts apps/web/tests/admin-dashboard.test.ts
  git commit -m "feat(admin): scoped KPI counts for dashboard"
  ```

- [ ] **Step 9: `getStaleLeadCountForStaff` — failing test**

  Append to `tests/admin-dashboard.test.ts`:

  ```ts
  describe("getStaleLeadCountForStaff", () => {
    it("counts stale leads in the caller's book", async () => {
      mockWhereSelect([{ id: "l1" }, { id: "l2" }]);

      const count = await getStaleLeadCountForStaff({ role: "ib", staffId: "ib-1" });

      expect(count).toBe(2);
    });
  });
  ```

  Run `npx vitest run tests/admin-dashboard.test.ts`. Expected: FAIL — `getStaleLeadCountForStaff is not a function`.

- [ ] **Step 10: `getStaleLeadCountForStaff` — minimal implementation**

  Append to `lib/admin/dashboard.ts`:

  ```ts
  /** A non-terminal lead with no activity for this many days is "stale" (spec A.2). */
  export const STALE_LEAD_AFTER_DAYS = 7;

  /** Stale-lead count for the dashboard widget, scoped to the caller's book. */
  export async function getStaleLeadCountForStaff(scope: StaffScope): Promise<number> {
    const staleBefore = new Date(Date.now() - STALE_LEAD_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const leadScope =
      scope.role === "super_admin"
        ? undefined
        : scope.role === "ib"
          ? eq(leads.ibId, scope.staffId)
          : eq(leads.assignedAgentId, scope.staffId);

    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          sql`(${leads.status} not in ('unqualified','duplicate','converted'))`,
          lt(leads.lastActivityAt, staleBefore),
          leadScope
        )
      );

    return rows.length;
  }
  ```

  Run `npx vitest run tests/admin-dashboard.test.ts`. Expected: PASS (13 tests).

  Commit:

  ```bash
  git add apps/web/lib/admin/dashboard.ts apps/web/tests/admin-dashboard.test.ts
  git commit -m "feat(admin): stale-lead count for dashboard widget"
  ```

- [ ] **Step 11: `listScopedActivityForStaff` — failing test**

  Append to `tests/admin-dashboard.test.ts`:

  ```ts
  describe("listScopedActivityForStaff", () => {
    const baseEvent = {
      action: "kyc.submitted",
      payload: {},
      actorEmail: "agent@example.com",
      createdAt: new Date("2026-07-23T10:00:00Z")
    };

    it("keeps only events visible in an agent's book", async () => {
      mockFeedSelect([
        { ...baseEvent, id: "e1", entityType: "investor", entityId: "inv-own" },
        { ...baseEvent, id: "e2", entityType: "investor", entityId: "inv-other" },
        { ...baseEvent, id: "e3", entityType: "staff_profile", entityId: "sp-1" }
      ]);
      // Batch ownership lookups: only the investors query hits the db here
      // (no lead/interest/distribution/document entity ids in the feed rows).
      mockWhereSelect([
        { id: "inv-own", assignedAgentId: "agent-1", ibId: "ib-1" },
        { id: "inv-other", assignedAgentId: "agent-2", ibId: "ib-2" }
      ]);

      const feed = await listScopedActivityForStaff({ role: "agent", staffId: "agent-1" });

      expect(feed.map((row) => row.id)).toEqual(["e1"]);
    });

    it("resolves interest events through their investor and caps at the limit", async () => {
      const interestEvents = Array.from({ length: 20 }, (_, i) => ({
        ...baseEvent,
        id: `e${i}`,
        entityType: "interest",
        entityId: `int-${i}`
      }));
      mockFeedSelect(interestEvents);
      // interests batch: all belong to the agent's investor.
      mockWhereSelect(
        interestEvents.map((row) => ({ id: row.entityId, investorId: "inv-own" }))
      );
      // investors batch (ids gathered from the interest rows).
      mockWhereSelect([{ id: "inv-own", assignedAgentId: "agent-1", ibId: "ib-1" }]);

      const feed = await listScopedActivityForStaff({ role: "agent", staffId: "agent-1" }, 15);

      expect(feed).toHaveLength(15);
      expect(feed[0]?.id).toBe("e0");
    });

    it("returns the latest events unfiltered for super admin", async () => {
      mockFeedSelect([
        { ...baseEvent, id: "e1", entityType: "staff_profile", entityId: "sp-1" },
        { ...baseEvent, id: "e2", entityType: "investor", entityId: null }
      ]);

      const feed = await listScopedActivityForStaff({ role: "super_admin", staffId: "s1" });

      expect(feed.map((row) => row.id)).toEqual(["e1", "e2"]);
      // Super admin path must not run any batch ownership queries.
      expect(selectMock).toHaveBeenCalledTimes(1);
    });
  });
  ```

  Run `npx vitest run tests/admin-dashboard.test.ts`. Expected: FAIL — `listScopedActivityForStaff is not a function`.

- [ ] **Step 12: `listScopedActivityForStaff` — minimal implementation**

  Append to `lib/admin/dashboard.ts`. Non-super roles over-fetch the 100 most recent events, batch-resolve ownership for the referenced entities (no N+1), drop anything outside the book, then cap at the feed limit.

  ```ts
  export type ScopedAuditEvent = {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    payload: Record<string, unknown>;
    actorEmail: string | null;
    createdAt: Date;
  };

  export const ACTIVITY_FEED_LIMIT = 15;
  /** Over-fetch window for scoped roles so the feed still fills after filtering. */
  const ACTIVITY_OVERFETCH = 100;

  /**
   * Latest audit events visible within the staff member's scope, newest
   * first. Super admins see the raw latest events; agents/IBs see only their
   * book's events — events whose entity is not resolvable in scope are
   * skipped (spec D.3).
   */
  export async function listScopedActivityForStaff(
    scope: StaffScope,
    limit: number = ACTIVITY_FEED_LIMIT
  ): Promise<ScopedAuditEvent[]> {
    const rows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        payload: auditEvents.payload,
        actorEmail: user.email,
        createdAt: auditEvents.createdAt
      })
      .from(auditEvents)
      .leftJoin(user, eq(auditEvents.actorUserId, user.id))
      .orderBy(desc(auditEvents.createdAt))
      .limit(scope.role === "super_admin" ? limit : ACTIVITY_OVERFETCH);

    if (scope.role === "super_admin") {
      return rows;
    }

    const entityIdsOf = (entityType: string): string[] => [
      ...new Set(
        rows
          .filter((row) => row.entityType === entityType && row.entityId !== null)
          .map((row) => row.entityId as string)
      )
    ];

    const leadIds = entityIdsOf("lead");
    const interestIds = entityIdsOf("interest");
    const distributionIds = entityIdsOf("distribution");
    const documentIds = entityIdsOf("document");

    const [leadRows, interestRows, distributionRows, documentRows] = await Promise.all([
      leadIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: leads.id, assignedAgentId: leads.assignedAgentId, ibId: leads.ibId })
            .from(leads)
            .where(inArray(leads.id, leadIds)),
      interestIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: interests.id, investorId: interests.investorId })
            .from(interests)
            .where(inArray(interests.id, interestIds)),
      distributionIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: distributions.id, investorId: distributions.investorId })
            .from(distributions)
            .where(inArray(distributions.id, distributionIds)),
      documentIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: documents.id, ownerType: documents.ownerType, ownerId: documents.ownerId })
            .from(documents)
            .where(inArray(documents.id, documentIds))
    ]);

    const investorIds = new Set<string>(entityIdsOf("investor"));
    for (const row of interestRows) investorIds.add(row.investorId);
    for (const row of distributionRows) investorIds.add(row.investorId);
    for (const row of documentRows) {
      if (row.ownerType === "investor" && row.ownerId) investorIds.add(row.ownerId);
    }

    const investorRows =
      investorIds.size === 0
        ? []
        : await db
            .select({
              id: investors.id,
              assignedAgentId: investors.assignedAgentId,
              ibId: investors.ibId
            })
            .from(investors)
            .where(inArray(investors.id, [...investorIds]));

    const lookups: ActivityScopeLookups = {
      investors: new Map(
        investorRows.map((row) => [
          row.id,
          { assignedAgentId: row.assignedAgentId, ibId: row.ibId }
        ])
      ),
      leads: new Map(
        leadRows.map((row) => [row.id, { assignedAgentId: row.assignedAgentId, ibId: row.ibId }])
      ),
      interestInvestorIds: new Map(interestRows.map((row) => [row.id, row.investorId])),
      distributionInvestorIds: new Map(distributionRows.map((row) => [row.id, row.investorId])),
      documents: new Map(
        documentRows.map((row) => [row.id, { ownerType: row.ownerType, ownerId: row.ownerId }])
      )
    };

    return rows
      .filter((row) => isAuditEventVisibleForStaff(scope, row, lookups))
      .slice(0, limit);
  }
  ```

  Run `npx vitest run tests/admin-dashboard.test.ts`. Expected: PASS (16 tests).

  Commit:

  ```bash
  git add apps/web/lib/admin/dashboard.ts apps/web/tests/admin-dashboard.test.ts
  git commit -m "feat(admin): scoped activity feed query for dashboard"
  ```

- [ ] **Step 13: Page rework — KPI row, preserved queues, stale widget, activity feed**

  Pure markup change: exact before/after, verified by typecheck + full unit suite (no forced component test — the behavior lives in the already-tested query module).

  1. Add one utility class to `apps/web/app/globals.css`, immediately after the `.stack-b-4` line (~line 154):

     ```css
     .admin-activity-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
     .admin-activity-list time { color: var(--muted); font-size: 12px; font-weight: 600; }
     ```

  2. Replace the whole of `apps/web/app/admin/page.tsx` with the following. The existing hub-card queues section (Applications / Interests / Distributions / AML check / Leads / Investors / Documents / assignment + overdue cards / super-admin Staff + Assets cards) is preserved verbatim; the KPI row reuses the existing `.dash-kpi-grid` / `.dash-kpi` styles (already 4-up → 2-up at ≤1100px → 1-up at ≤560px, `app/globals.css:2492-2574`), so no new responsive CSS is needed for it. No tables are added, so `.table-wrap` does not apply; all tappable rows are the existing ≥40px `admin-hub-card` links; no raw enum strings and no inline styles are introduced.

     ```tsx
     import Link from "next/link";
     import { redirect } from "next/navigation";
     import { AdminPageHeader } from "@/components/admin/admin-page-header";
     import { requireStaff } from "@/lib/auth/staff";
     import { isTwoFactorEnabledForUser } from "@/lib/auth/queries";
     import { TwoFactorOptionalBanner } from "@/components/two-factor-optional-banner";
     import {
       describeAuditEvent,
       formatRelativeTime,
       getAdminDashboardKpis,
       getStaleLeadCountForStaff,
       listScopedActivityForStaff
     } from "@/lib/admin/dashboard";
     import { countAssets } from "@/lib/assets/queries";
     import { getPendingInterestCountsForStaff } from "@/lib/interests/queries";
     import { listInvestorsForStaff } from "@/lib/investors/queries";
     import {
       getLeadDashboardCounts,
       listLeadListsForStaff,
       listLeadsForStaff
     } from "@/lib/leads/queries";
     import { listStaff } from "@/lib/staff/queries";

     export default async function AdminPage() {
       let staff;
       try {
         staff = await requireStaff();
       } catch (error) {
         if (error instanceof Error && error.message === "FORBIDDEN") {
           redirect("/");
         }
         throw error;
       }

       const isSuper = staff.role === "super_admin";
       const isIb = staff.role === "ib";
       const scope = { role: staff.role, staffId: staff.staff.id };

       const [
         kpis,
         staleLeadCount,
         activity,
         interestCounts,
         leadBook,
         investorBook,
         leadLists,
         staffRows,
         assetsCount
       ] = await Promise.all([
         getAdminDashboardKpis(scope),
         getStaleLeadCountForStaff(scope),
         listScopedActivityForStaff(scope),
         getPendingInterestCountsForStaff(scope),
         listLeadsForStaff().catch(() => []),
         listInvestorsForStaff().catch(() => []),
         isSuper ? listLeadListsForStaff().catch(() => []) : Promise.resolve([]),
         isSuper ? listStaff().catch(() => []) : Promise.resolve([]),
         isSuper ? countAssets() : Promise.resolve(0)
       ]);

       const pendingInterests = interestCounts.pending;
       const kycBlockedPending = interestCounts.kycBlocked;
       const pendingApplications = investorBook.filter(
         (row) =>
           row.accountStatus === "pending_access" ||
           row.applicationStatus === "submitted" ||
           row.applicationStatus === "contacted"
       ).length;
       const leadsCount = isSuper ? leadLists.length : leadBook.length;
       const leadCounts = await getLeadDashboardCounts().catch(() => null);
       const investorsCount = investorBook.length;
       const unassignedInvestors = isSuper
         ? investorBook.filter((row) => row.assignedAgentId === null).length
         : 0;
       const staffCount = staffRows.length;
       const twoFactorEnabled = await isTwoFactorEnabledForUser(staff.user.id);

       return (
         <div className="admin-page">
           {!twoFactorEnabled ? <TwoFactorOptionalBanner /> : null}
           <AdminPageHeader
             title={isSuper ? "Operations" : isIb ? "Team pipeline" : "Your book"}
             subtitle={
               isSuper
                 ? "Pool health and platform tools."
                 : isIb
                   ? "Your unassigned queue and your team's pipeline."
                   : "Queues that need action in your assigned book."
             }
           />

           <div className="dash-kpi-grid stack-4">
             <div className="dash-kpi">
               <span>Investors in book</span>
               <b>{kpis.investorsInBook}</b>
             </div>
             <div className="dash-kpi">
               <span>New leads this week</span>
               <b>{kpis.newLeadsThisWeek}</b>
             </div>
             <div className="dash-kpi">
               <span>Pending KYC</span>
               <b>{kpis.pendingKyc}</b>
               <small>Submitted or under review</small>
             </div>
             <div className="dash-kpi">
               <span>Distributions due</span>
               <b>{kpis.scheduledDistributions}</b>
               <small>Scheduled payments</small>
             </div>
           </div>

           <div className="admin-hub-grid stack-6">
             <Link className="admin-hub-card" href="/admin/investors?filter=pending">
               <span className="admin-hub-k">Applications</span>
               <span className="admin-hub-v">{pendingApplications} pending</span>
             </Link>
             <Link className="admin-hub-card" href="/admin/interests">
               <span className="admin-hub-k">Interests</span>
               <span className="admin-hub-v">
                 {pendingInterests} pending
                 {kycBlockedPending > 0 ? ` · ${kycBlockedPending} KYC-blocked` : ""}
               </span>
             </Link>
             <Link className="admin-hub-card" href="/admin/distributions">
               <span className="admin-hub-k">Distributions</span>
               <span className="admin-hub-v">Record payments</span>
             </Link>
             <Link className="admin-hub-card" href="/admin/aml-checklist">
               <span className="admin-hub-k">AML check</span>
               <span className="admin-hub-v">Before confirm</span>
             </Link>
             <Link className="admin-hub-card" href="/admin/leads">
               <span className="admin-hub-k">Leads</span>
               <span className="admin-hub-v">
                 {isSuper ? `${leadsCount} lists` : `${leadsCount} in book`}
               </span>
             </Link>
             <Link className="admin-hub-card" href="/admin/investors">
               <span className="admin-hub-k">Investors</span>
               <span className="admin-hub-v">
                 {isSuper
                   ? `${investorsCount} total · ${unassignedInvestors} unassigned`
                   : `${investorsCount} in book`}
               </span>
             </Link>
             <Link className="admin-hub-card" href="/admin/documents">
               <span className="admin-hub-k">Documents</span>
               <span className="admin-hub-v">Vault</span>
             </Link>
             {leadCounts ? (
               <>
                 <Link className="admin-hub-card" href="/admin/leads">
                   <span className="admin-hub-k">{isSuper ? "Awaiting assignment" : "Unassigned queue"}</span>
                   <span className="admin-hub-v">
                     {isSuper ? leadCounts.awaitingAssignment : leadCounts.ibQueue}
                   </span>
                 </Link>
                 <Link className="admin-hub-card" href="/admin/leads">
                   <span className="admin-hub-k">Overdue follow-ups</span>
                   <span className="admin-hub-v">
                     {leadCounts.overdueFollowUps}
                     {leadCounts.unworked > 0 ? ` · ${leadCounts.unworked} unworked` : ""}
                   </span>
                 </Link>
               </>
             ) : null}
             {isSuper ? (
               <>
                 <Link className="admin-hub-card" href="/admin/staff">
                   <span className="admin-hub-k">Staff</span>
                   <span className="admin-hub-v">{staffCount} profiles</span>
                 </Link>
                 <Link className="admin-hub-card" href="/admin/assets">
                   <span className="admin-hub-k">Assets</span>
                   <span className="admin-hub-v">{assetsCount} in catalogue</span>
                 </Link>
               </>
             ) : null}
           </div>

           <div className="admin-hub-grid stack-6">
             <Link className="admin-hub-card" href="/admin/leads">
               <span className="admin-hub-k">Stale leads</span>
               <span className="admin-hub-v">
                 {staleLeadCount > 0
                   ? `${staleLeadCount} need a touch — review`
                   : "None — book is fresh"}
               </span>
             </Link>
           </div>

           <section className="stack-6">
             <h2>Recent activity</h2>
             {activity.length === 0 ? (
               <p className="stack-3">No recent activity in your book yet.</p>
             ) : (
               <ul className="admin-activity-list stack-3">
                 {activity.map((event) => (
                   <li key={event.id}>
                     <strong>{event.actorEmail ?? "Someone"}</strong>{" "}
                     {describeAuditEvent(event)}{" "}
                     <time dateTime={event.createdAt.toISOString()}>
                       {formatRelativeTime(event.createdAt)}
                     </time>
                   </li>
                 ))}
               </ul>
             )}
           </section>
         </div>
       );
     }
     ```

     If the leads-area task adds a stale-filter URL param (e.g. `/admin/leads?stale=1`), update the stale-leads card `href` at assembly to point at it; `/admin/leads` is the spec-mandated fallback.

  3. Verify (typecheck + full unit suite + build):

     ```bash
     cd /Users/mac/Documents/Park/apps/web
     export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
     npx tsc --noEmit
     npx vitest run
     npm run build
     ```

     Expected: all green. If `tsc` flags the unused imports left over from step 2's forward-declared import block in `lib/admin/dashboard.ts`, confirm every one of them (`and`, `desc`, `eq`, `gte`, `inArray`, `lt`, `sql`, all tables, `leadVisibleToStaff`) is now used by steps 4–12 — they all are — so no error should remain.

  4. Commit:

     ```bash
     git add apps/web/app/admin/page.tsx apps/web/app/globals.css
     git commit -m "feat(admin): dashboard KPI row, stale-leads widget and scoped activity feed"
     ```

---

