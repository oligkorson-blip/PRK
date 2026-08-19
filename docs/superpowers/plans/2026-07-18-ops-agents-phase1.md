# Parkwise Ops Agents Phase 1 — Roles, Investor Pool & Assignment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat `ADMIN_EMAILS` with `super_admin` / `agent` staff roles, an unassigned investor pool, and assignment so agents only see their clients’ admin data.

**Architecture:** Add `staff_profiles` (auth user ↔ role). Add nullable `investors.assigned_agent_id`. Bootstrap super admins via `SUPER_ADMIN_EMAILS`. Scope all admin interest/document/investor queries by assignment unless `super_admin`. Lead lists, call log, and i18n are **out of this plan** (Phases 2–4).

**Tech Stack:** Next.js 15, Better Auth, Drizzle, Postgres, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-ops-agents-leads-i18n-design.md` (Phase 1 only)
- One-server stack remains; do not reintroduce Clerk
- Preserve interest state machine and race-safe pending claims
- Admin UI stays English
- Do not commit secrets
- Commit with: `git -c user.email="parkwise@local" -c user.name="Parkwise"` when committing
- `SUPER_ADMIN_EMAILS` replaces `ADMIN_EMAILS` (migrate docs/env; accept both during one release if needed, prefer `SUPER_ADMIN_EMAILS`)

## Follow-up plans (do not implement here)

- Phase 2: lead lists, CSV + template, source fields, signup email link
- Phase 3: call attempt log
- Phase 4: client i18n EN/FR/DE/NL/PL

## File Structure (primary)

```
apps/web/
  lib/db/schema.ts                 # staff_profiles, assigned_agent_id
  lib/auth/roles.ts                # StaffRole, env + DB role resolution
  lib/auth/staff.ts                # requireStaff, requireSuperAdmin, scope helpers
  lib/auth/investor.ts             # requireAdmin → staff gate (compat)
  lib/investors/admin-actions.ts   # list/assign investors
  lib/staff/admin-actions.ts       # promote/demote agents
  app/admin/investors/page.tsx     # pool + assignment UI
  app/admin/staff/page.tsx         # promote agents
  app/admin/interests/page.tsx     # scope query
  app/admin/documents/page.tsx     # scope if listing by investor
  tests/staff-roles.test.ts
  tests/investor-scope.test.ts
  .env.example
  docs/SETUP.md
```

---

### Task 1: Schema — staff_profiles + assigned_agent_id

**Files:**
- Modify: `apps/web/lib/db/schema.ts`
- Migration via `npm run db:generate`
- Modify: `apps/web/lib/db/index.ts` or exports if needed

**Interfaces:**
- Produces:
  - `staffRoleEnum`: `super_admin` | `agent`
  - `staffProfiles` table: `id` uuid PK, `authUserId` text unique not null, `email` text not null, `role` staffRoleEnum not null, `createdAt`, `updatedAt`
  - `investors.assignedAgentId` → uuid nullable FK → `staff_profiles.id`

- [ ] **Step 1: Add schema**

```ts
export const staffRoleEnum = pgEnum("staff_role", ["super_admin", "agent"]);

export const staffProfiles = pgTable("staff_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  authUserId: text("auth_user_id").notNull().unique(),
  email: text("email").notNull(),
  role: staffRoleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
```

On `investors` add:

```ts
assignedAgentId: uuid("assigned_agent_id").references(() => staffProfiles.id),
```

(Declare `staffProfiles` before `investors` uses the FK, or use a deferred reference pattern consistent with Drizzle in this repo.)

- [ ] **Step 2: Generate migration**

```bash
cd apps/web && npm run db:generate
```

- [ ] **Step 3: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/db apps/web/drizzle
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add staff_profiles and investor assigned_agent_id for ops RBAC

EOF
)"
```

---

### Task 2: Staff role helpers (TDD)

**Files:**
- Modify: `apps/web/lib/auth/roles.ts`
- Create: `apps/web/tests/staff-roles.test.ts`
- Update: `apps/web/tests/roles.test.ts` (migrate from ADMIN_EMAILS to SUPER_ADMIN_EMAILS)

**Interfaces:**
- Produces:
  - `type StaffRole = "super_admin" | "agent"`
  - `parseEmailList(envValue: string | undefined): Set<string>`
  - `isSuperAdminEmail(email: string): boolean` — from `SUPER_ADMIN_EMAILS` (fallback: `ADMIN_EMAILS` if SUPER unset)
  - `effectiveStaffRole(input: { email: string; dbRole: StaffRole | null }): StaffRole | null` — if email in super list → `super_admin`; else `dbRole`; else null

- [ ] **Step 1: Failing tests**

```ts
// tests/staff-roles.test.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { effectiveStaffRole, isSuperAdminEmail } from "@/lib/auth/roles";

describe("staff roles", () => {
  const prevSuper = process.env.SUPER_ADMIN_EMAILS;
  const prevAdmin = process.env.ADMIN_EMAILS;
  beforeEach(() => {
    process.env.SUPER_ADMIN_EMAILS = "boss@parkwise.eu";
    delete process.env.ADMIN_EMAILS;
  });
  afterEach(() => {
    process.env.SUPER_ADMIN_EMAILS = prevSuper;
    process.env.ADMIN_EMAILS = prevAdmin;
  });

  it("recognizes SUPER_ADMIN_EMAILS", () => {
    expect(isSuperAdminEmail("boss@parkwise.eu")).toBe(true);
    expect(isSuperAdminEmail("other@x.com")).toBe(false);
  });

  it("env super wins over db agent role", () => {
    expect(effectiveStaffRole({ email: "boss@parkwise.eu", dbRole: "agent" })).toBe("super_admin");
  });

  it("returns db agent when not in env list", () => {
    expect(effectiveStaffRole({ email: "a@x.com", dbRole: "agent" })).toBe("agent");
  });

  it("returns null for plain investors", () => {
    expect(effectiveStaffRole({ email: "i@x.com", dbRole: null })).toBe(null);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web && npx vitest run tests/staff-roles.test.ts
```

- [ ] **Step 3: Implement roles.ts**

Keep `isAdmin` as `effectiveStaffRole(...) !== null` for temporary compat, or redefine `isAdmin` as staff check after Task 3.

- [ ] **Step 4: Run — expect PASS; update old roles tests**

- [ ] **Step 5: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/auth/roles.ts apps/web/tests
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add super_admin and agent role resolution helpers

EOF
)"
```

---

### Task 3: requireStaff / requireSuperAdmin / investor scope

**Files:**
- Create: `apps/web/lib/auth/staff.ts`
- Create: `apps/web/tests/investor-scope.test.ts`
- Modify: `apps/web/lib/auth/investor.ts` — `requireAdmin` becomes staff gate returning `{ user, staff, role }`

**Interfaces:**
- Produces:
  - `type StaffContext = { user: { id: string; email: string }; staff: { id: string; role: StaffRole }; role: StaffRole }`
  - `getStaffContext(): Promise<StaffContext | null>` — load session; if `isSuperAdminEmail`, upsert `staff_profiles` as `super_admin`; else load profile by `authUserId`
  - `requireStaff(): Promise<StaffContext>` — throws `FORBIDDEN` if null
  - `requireSuperAdmin(): Promise<StaffContext>` — throws if role !== `super_admin`
  - `investorVisibleToStaff(role: StaffRole, staffId: string, assignedAgentId: string | null): boolean` — super → true; agent → assignedAgentId === staffId
  - `requireAdmin()` — alias to `requireStaff()` for existing call sites (return shape: include `.id` / `.email` as today for minimal churn, plus `.staffId` / `.role`)

- [ ] **Step 1: Failing scope tests**

```ts
// tests/investor-scope.test.ts
import { describe, expect, it } from "vitest";
import { investorVisibleToStaff } from "@/lib/auth/staff";

describe("investorVisibleToStaff", () => {
  it("super_admin sees unassigned and any agent book", () => {
    expect(investorVisibleToStaff("super_admin", "s1", null)).toBe(true);
    expect(investorVisibleToStaff("super_admin", "s1", "other")).toBe(true);
  });
  it("agent only sees own assignments", () => {
    expect(investorVisibleToStaff("agent", "a1", "a1")).toBe(true);
    expect(investorVisibleToStaff("agent", "a1", null)).toBe(false);
    expect(investorVisibleToStaff("agent", "a1", "a2")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement staff.ts + wire requireAdmin**

Upsert super admin profile on first `getStaffContext` when email matches env (so bootstrap needs no manual DB row).

- [ ] **Step 3: Tests pass; commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/auth apps/web/tests
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add staff context and investor visibility scoping helpers

EOF
)"
```

---

### Task 4: Assign investors (actions + admin page)

**Files:**
- Create: `apps/web/lib/investors/admin-actions.ts`
- Create: `apps/web/app/admin/investors/page.tsx`
- Create: `apps/web/components/assign-investor-form.tsx` (client)
- Modify: `apps/web/app/admin/page.tsx` — link to Investors

**Interfaces:**
- Produces:
  - `listInvestorsForStaff(): Promise<InvestorRow[]>` — scoped
  - `listAgents(): Promise<{ id: string; email: string }[]>` — super only
  - `assignInvestor(input: { investorId: string; agentStaffId: string | null }): Promise<{ ok: true } | { ok: false; error: string }>` — super only; `null` returns to pool; audit `investor.assigned`

- [ ] **Step 1: Implement server actions with requireSuperAdmin on assign; requireStaff on list**

- [ ] **Step 2: UI** — table: email, name, assigned agent, status; filter Unassigned; assign dropdown for super admin. Agents see read-only their book.

- [ ] **Step 3: Manual check notes in `apps/web/docs/plan-ops-phase1-verify.md`**

- [ ] **Step 4: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/investors apps/web/app/admin apps/web/components apps/web/docs
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add investor pool assignment UI for super admins

EOF
)"
```

---

### Task 5: Promote agents (staff admin)

**Files:**
- Create: `apps/web/lib/staff/admin-actions.ts`
- Create: `apps/web/app/admin/staff/page.tsx`
- Modify: `apps/web/app/admin/page.tsx` — link to Staff

**Interfaces:**
- Produces:
  - `promoteToAgent(input: { email: string }): Promise<…>` — super only; find Better Auth user by email (query `user` table from auth schema); upsert `staff_profiles` role `agent`
  - `listStaff(): Promise<…>` — super only
  - Optional: `demoteAgent` (delete profile or block) — include demote to `remove staff access` for safety

- [ ] **Step 1: Implement promote by email (user must have signed up already); clear error if not found**

- [ ] **Step 2: Super-admin-only Staff page**

- [ ] **Step 3: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/staff apps/web/app/admin
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add super-admin staff promotion for ops agents

EOF
)"
```

---

### Task 6: Scope interests + documents admin lists

**Files:**
- Modify: `apps/web/app/admin/interests/page.tsx`
- Modify: `apps/web/lib/interests/admin-actions.ts` — before confirm/decline, verify `investorVisibleToStaff` for that interest’s investor
- Modify: `apps/web/app/admin/documents/page.tsx` / document actions if they list cross-investor data
- Modify: assets admin — **super_admin only** for status toggles (agents should not publish assets) OR leave as staff-wide; **prefer super_admin only** for asset status

**Interfaces:**
- Interests query: join investors; if agent, `eq(investors.assignedAgentId, staff.staff.id)`
- Confirm/decline: load interest → check visibility → else FORBIDDEN / friendly error

- [ ] **Step 1: Scope interests page query**

- [ ] **Step 2: Guard confirm/decline**

- [ ] **Step 3: Restrict `/admin/assets` to `requireSuperAdmin`**

- [ ] **Step 4: `npm test` + commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
scope admin interests and lock asset controls to super admins

EOF
)"
```

---

### Task 7: Env + docs + verify checklist

**Files:**
- Modify: `apps/web/.env.example` — `SUPER_ADMIN_EMAILS=`; note `ADMIN_EMAILS` deprecated
- Modify: `apps/web/docs/SETUP.md`, `DEPLOY_NJALLA_COOLIFY.md`, `PRODUCTION_CHECKLIST.md`
- Create: `apps/web/docs/plan-ops-phase1-verify.md`

**Verify doc checklist:**
1. Set `SUPER_ADMIN_EMAILS`, sign up that email → `/admin` works, staff profile upserted
2. Second user signs up → promote to agent on `/admin/staff`
3. Third user (investor) appears in Unassigned → assign to agent
4. Agent sees only that investor’s interests; cannot see others
5. Agent cannot open asset status controls
6. Super admin sees all

- [ ] **Step 1: Update docs/env**

- [ ] **Step 2: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/.env.example apps/web/docs
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
document SUPER_ADMIN_EMAILS and ops Phase 1 verification

EOF
)"
```

---

### Task 8: Final verification

- [ ] **Step 1:** `cd apps/web && npm test`

- [ ] **Step 2:** `npm run build`

- [ ] **Step 3:** Confirm no remaining hard dependency on `ADMIN_EMAILS` alone (fallback OK)

---

## Spec coverage (Phase 1)

| Phase 1 requirement | Task |
|---|---|
| Roles super_admin / agent | 1–3 |
| SUPER_ADMIN_EMAILS bootstrap | 2–3 |
| Promote agents in UI | 5 |
| Investor pool + assign | 4 |
| Agent-scoped admin views | 6 |
| Docs | 7–8 |

Phases 2–4 explicitly excluded.
