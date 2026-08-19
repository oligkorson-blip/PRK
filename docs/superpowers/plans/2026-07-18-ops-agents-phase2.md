# Parkwise Ops Agents Phase 2 — Lead Lists, CSV Upload & Signup Link

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let super admins create lead lists, download a CSV template, upload leads (with source fields), assign leads to agents, and auto-link matching emails when an investor signs up.

**Architecture:** Add `lead_lists` + `leads`. Super-admin CRUD/upload/assign; agents list only assigned leads. On `ensureInvestor` create path, match email to a lead and inherit `assigned_agent_id` when set. Call log and i18n remain out of scope (Phases 3–4).

**Tech Stack:** Next.js 15, Drizzle, Postgres, Vitest (no new CSV library required — parse simple RFC4180-ish rows manually or use a tiny parser).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-ops-agents-leads-i18n-design.md` (Phase 2 only)
- Phase 1 RBAC must remain: `requireSuperAdmin` for upload/create/assign-all; agents scoped via `assigned_agent_id`
- Email required on leads (signup link); phone recommended
- CSV columns: `full_name`, `email`, `phone`, `source`, `source_detail`, `notes`
- Do not commit secrets
- Commit with: `git -c user.email="parkwise@local" -c user.name="Parkwise"`
- Admin UI English only

## Out of scope

- Call attempt log (Phase 3)
- Client i18n (Phase 4)
- Agent self-upload of lists
- Phone-only leads without email

## File Structure (primary)

```
apps/web/
  lib/db/schema.ts
  lib/leads/csv.ts                 # template + parse/validate
  lib/leads/link.ts                # signup email → lead match
  lib/leads/scope.ts               # leadVisibleToStaff
  lib/leads/admin-actions.ts       # lists, upload, assign
  app/admin/leads/page.tsx         # list index
  app/admin/leads/[listId]/page.tsx
  app/admin/leads/template/route.ts  # GET CSV template download
  app/api/admin/leads/template/route.ts  # alt if App Router prefers
  components/lead-upload-form.tsx
  components/assign-lead-form.tsx
  lib/auth/investor.ts             # call link on create
  tests/leads-csv.test.ts
  tests/leads-link.test.ts
  tests/leads-scope.test.ts
  docs/plan-ops-phase2-verify.md
```

---

### Task 1: Schema — lead_lists + leads

**Files:**
- Modify: `apps/web/lib/db/schema.ts`
- Migration via `npm run db:generate`

**Interfaces:**
- Produces:
  - `leadLists`: `id`, `name`, `defaultSource` text not null default `""`, `createdByStaffId` uuid FK staff_profiles, `createdAt`
  - `leads`: `id`, `listId` FK, `fullName`, `email`, `phone` nullable, `source`, `sourceDetail` nullable, `notes` nullable, `assignedAgentId` nullable FK staff, `investorId` nullable FK investors unique?, `createdAt`, `updatedAt`
  - Index on `lower(email)` — if Drizzle cannot express, add raw SQL in migration: `CREATE INDEX leads_email_lower_idx ON leads (lower(email));`

- [ ] **Step 1: Add tables to schema (after staffProfiles / investors)**

- [ ] **Step 2: `npm run db:generate`**

- [ ] **Step 3: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/db apps/web/drizzle
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add lead_lists and leads schema for ops CRM Phase 2

EOF
)"
```

---

### Task 2: CSV template + parse/validate (TDD)

**Files:**
- Create: `apps/web/lib/leads/csv.ts`
- Create: `apps/web/tests/leads-csv.test.ts`

**Interfaces:**
- Produces:
  - `LEADS_CSV_HEADERS = ["full_name","email","phone","source","source_detail","notes"] as const`
  - `leadsCsvTemplateContent(): string` — header + one example row
  - `type ParsedLeadRow = { fullName, email, phone: string | null, source, sourceDetail: string | null, notes: string | null }`
  - `parseLeadsCsv(text: string, opts: { defaultSource: string }): { ok: ParsedLeadRow[]; errors: { line: number; message: string }[] }`
  - Rules: trim; email required + basic `includes("@")`; full_name min 1 char; source from cell or `defaultSource` (error if both empty); phone optional; skip empty lines; case-normalize email to lowercase for storage

- [ ] **Step 1: Failing tests** for template headers, valid row, missing email, source fallback to defaultSource

- [ ] **Step 2: Implement csv.ts**

- [ ] **Step 3: Tests pass; commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/leads/csv.ts apps/web/tests/leads-csv.test.ts
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add leads CSV template and row validation

EOF
)"
```

---

### Task 3: Lead visibility + signup link helpers (TDD)

**Files:**
- Create: `apps/web/lib/leads/scope.ts`
- Create: `apps/web/lib/leads/link.ts`
- Create: `apps/web/tests/leads-scope.test.ts`
- Create: `apps/web/tests/leads-link.test.ts`

**Interfaces:**
- Produces:
  - `leadVisibleToStaff(role, staffId, assignedAgentId): boolean` — same rules as investors
  - `pickLeadForEmailMatch(leads: { id; assignedAgentId; createdAt }[]): … | null` — prefer most recently assigned (assignedAgentId not null, newest createdAt among those), else newest createdAt overall
  - Pure functions only in unit tests; DB wiring in Task 5

- [ ] **Step 1: Failing tests**

- [ ] **Step 2: Implement**

- [ ] **Step 3: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/leads apps/web/tests
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add lead visibility and email-match selection helpers

EOF
)"
```

---

### Task 4: Admin actions — lists, upload, assign

**Files:**
- Create: `apps/web/lib/leads/admin-actions.ts`

**Interfaces:**
- Produces:
  - `createLeadList({ name, defaultSource })` — super only
  - `listLeadListsForStaff()` — super: all; agent: lists that have ≥1 lead assigned to them (or show flat lead list without lists — prefer: agents get `listLeadsForStaff()` flat)
  - `listLeadsForStaff({ listId?: string })` — scoped
  - `uploadLeadsCsv({ listId, csvText })` — super only; parse; insert ok rows; return `{ imported, errors }`
  - `assignLead({ leadId, agentStaffId: string | null })` — super only
  - `assignAllLeadsInList({ listId, agentStaffId: string | null })` — super only
  - Audit: `lead_list.created`, `leads.uploaded`, `lead.assigned`

- [ ] **Step 1: Implement actions**

- [ ] **Step 2: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/leads/admin-actions.ts
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add lead list upload and assignment server actions

EOF
)"
```

---

### Task 5: Wire signup link in ensureInvestor

**Files:**
- Modify: `apps/web/lib/auth/investor.ts`
- Optionally: `apps/web/lib/leads/link.ts` add `linkLeadOnInvestorCreate(txOrDb, investor)`

**Behavior:**
- After inserting new investor (not on existing return path):
  1. Select leads where `lower(email) = lower(investor.email)` and `investor_id` is null
  2. `pickLeadForEmailMatch`
  3. If lead: set `leads.investorId`; if lead.assignedAgentId set, set `investors.assignedAgentId`
  4. Audit `lead.linked_on_signup`

- [ ] **Step 1: Implement**

- [ ] **Step 2: Unit-test pick helper already done; optional integration skip without DB**

- [ ] **Step 3: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/auth/investor.ts apps/web/lib/leads
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
link matching CRM leads to investors on signup

EOF
)"
```

---

### Task 6: Admin UI — lists, template download, upload, assign

**Files:**
- Modify: `apps/web/app/admin/page.tsx` — Leads link
- Create: `apps/web/app/admin/leads/page.tsx`
- Create: `apps/web/app/admin/leads/[listId]/page.tsx`
- Create: `apps/web/app/admin/leads/template/route.ts` — `GET` returns `text/csv` attachment `leads-template.csv` (super only)
- Create: `apps/web/components/lead-upload-form.tsx`
- Create: `apps/web/components/assign-lead-form.tsx`
- Create: `apps/web/components/create-lead-list-form.tsx`

**UI:**
- Super: create list, download template, open list → upload CSV, see import errors, assign lead / assign all
- Agent: flat or list view of **assigned leads only** (no upload)

- [ ] **Step 1: Build pages/forms**

- [ ] **Step 2: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/app/admin/leads apps/web/components apps/web/app/admin/page.tsx
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add admin lead lists UI with CSV template and upload

EOF
)"
```

---

### Task 7: Docs + verify checklist

**Files:**
- Create: `apps/web/docs/plan-ops-phase2-verify.md`
- Modify: `apps/web/docs/SETUP.md` — short Phase 2 pointer

**Checklist:**
1. Super creates list + downloads template
2. Upload CSV with source / source_detail; see row errors for bad lines
3. Assign leads to agent; agent sees only theirs
4. New signup with matching email links lead + inherits agent
5. Unassigned lead signup → investor stays in pool

- [ ] **Step 1: Write docs**

- [ ] **Step 2: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/docs
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
document ops Phase 2 lead lists verification

EOF
)"
```

---

### Task 8: Final verification

- [ ] **Step 1:** `cd apps/web && npm test`

- [ ] **Step 2:** `npm run build`

- [ ] **Step 3:** Confirm Phase 3/4 not accidentally started

---

## Spec coverage (Phase 2)

| Requirement | Task |
|---|---|
| lead_lists + leads | 1 |
| CSV template + columns + source | 2, 6 |
| Upload + row errors | 2, 4, 6 |
| Assign lead / list | 4, 6 |
| Agent scoped view | 3, 4, 6 |
| Signup email link + agent inherit | 3, 5 |
| Docs | 7–8 |
