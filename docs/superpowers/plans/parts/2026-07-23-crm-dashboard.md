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
