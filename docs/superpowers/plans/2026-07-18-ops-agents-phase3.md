# Parkwise Ops Agents Phase 3 — Lead Call Attempt Log

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let agents (and super admins) log multiple cold-call attempts on leads they can see, with outcomes and notes, newest-first history on the lead detail UI.

**Architecture:** Add `lead_call_attempts` table. Mutations require staff + `leadVisibleToStaff`. Agents only log on assigned leads; super admin on any lead. No dialer integration. i18n stays out of scope (Phase 4).

**Tech Stack:** Next.js 15, Drizzle, Postgres, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-ops-agents-leads-i18n-design.md` (Phase 3 only)
- Reuse `leadVisibleToStaff` from `lib/leads/scope.ts`
- Outcomes exactly: `no_answer` | `reached` | `interested` | `not_interested` | `callback` | `wrong_number` | `other`
- Admin UI English only
- Do not commit secrets
- Commit with: `git -c user.email="parkwise@local" -c user.name="Parkwise"`

## Out of scope

- Dialer / telephony / click-to-call
- Client i18n (Phase 4)
- Changing CSV / list upload behavior

## File Structure (primary)

```
apps/web/
  lib/db/schema.ts
  lib/leads/outcomes.ts            # outcome enum + labels + validation
  lib/leads/call-actions.ts        # logCallAttempt, listCallAttemptsForLead
  components/log-call-form.tsx
  app/admin/leads/[listId]/page.tsx # or lead detail section
  app/admin/leads/lead/[leadId]/page.tsx  # dedicated detail if cleaner
  tests/leads-outcomes.test.ts
  docs/plan-ops-phase3-verify.md
```

---

### Task 1: Schema — lead_call_attempts

**Files:**
- Modify: `apps/web/lib/db/schema.ts`
- Migration via `npm run db:generate`

**Interfaces:**
- Produces:
  - `leadCallOutcomeEnum`: `no_answer` | `reached` | `interested` | `not_interested` | `callback` | `wrong_number` | `other`
  - `leadCallAttempts` table:
    - `id` uuid PK
    - `leadId` uuid FK → leads not null
    - `agentId` uuid FK → staff_profiles not null (who logged)
    - `calledAt` timestamptz not null default now
    - `outcome` enum not null
    - `notes` text nullable
    - `createdAt` timestamptz default now
  - Index on `(lead_id, called_at desc)` if expressible; else single `lead_id` index

- [ ] **Step 1: Add schema**

- [ ] **Step 2: `npm run db:generate`**

- [ ] **Step 3: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/db apps/web/drizzle
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add lead_call_attempts schema for cold-call logging

EOF
)"
```

---

### Task 2: Outcome helpers (TDD)

**Files:**
- Create: `apps/web/lib/leads/outcomes.ts`
- Create: `apps/web/tests/leads-outcomes.test.ts`

**Interfaces:**
- Produces:
  - `LEAD_CALL_OUTCOMES` readonly array of the seven values
  - `isLeadCallOutcome(value: string): value is LeadCallOutcome`
  - `parseLeadCallOutcome(value: unknown): LeadCallOutcome | null`
  - `leadCallOutcomeLabel(outcome: LeadCallOutcome): string` — English UI labels

- [ ] **Step 1: Failing tests** for valid/invalid parse and all labels present

- [ ] **Step 2: Implement**

- [ ] **Step 3: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/leads/outcomes.ts apps/web/tests/leads-outcomes.test.ts
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add lead call outcome validation helpers

EOF
)"
```

---

### Task 3: Call log server actions

**Files:**
- Create: `apps/web/lib/leads/call-actions.ts`

**Interfaces:**
- Produces:
  - `logCallAttempt(input: { leadId: string; outcome: string; notes?: string | null; calledAt?: string | Date }): Promise<{ ok: true } | { ok: false; error: string }>`
    - `requireStaff()`
    - Load lead; `leadVisibleToStaff` or error
    - Validate outcome; default `calledAt` to now
    - Insert attempt with `agentId = staff.staff.id`
    - Audit `lead.call_logged`
  - `listCallAttemptsForLead(leadId: string): Promise<AttemptRow[]>`
    - Staff + visibility; order `calledAt` desc, then `createdAt` desc

- [ ] **Step 1: Implement**

- [ ] **Step 2: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/lib/leads/call-actions.ts
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add lead call attempt log server actions

EOF
)"
```

---

### Task 4: Lead detail UI + log form

**Files:**
- Create: `apps/web/app/admin/leads/lead/[leadId]/page.tsx` — contact card, assignment, call history, log form
- Create: `apps/web/components/log-call-form.tsx` — outcome select + notes + submit
- Modify: `apps/web/app/admin/leads/[listId]/page.tsx` and/or agent flat list — link each lead to detail page
- Modify: agent flat view on `app/admin/leads/page.tsx` — same links

**UI rules:**
- History newest-first: datetime, outcome label, agent email, notes
- Form: only if staff can see lead
- No dialer buttons

- [ ] **Step 1: Build pages**

- [ ] **Step 2: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/app/admin/leads apps/web/components/log-call-form.tsx
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
add lead detail call history and log-call form

EOF
)"
```

---

### Task 5: Docs + verify

**Files:**
- Create: `apps/web/docs/plan-ops-phase3-verify.md`
- Modify: `apps/web/docs/SETUP.md` — Phase 3 pointer

**Checklist:**
1. Agent opens assigned lead → logs call with outcome + notes
2. History shows newest first
3. Agent cannot log on another agent’s lead
4. Super admin can log on any lead and see all history

- [ ] **Step 1: Write docs**

- [ ] **Step 2: Commit**

```bash
git -c user.email="parkwise@local" -c user.name="Parkwise" add apps/web/docs
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "$(cat <<'EOF'
document ops Phase 3 call log verification

EOF
)"
```

---

### Task 6: Final verification

- [ ] **Step 1:** `cd apps/web && npm test`

- [ ] **Step 2:** `npm run build`

- [ ] **Step 3:** Confirm no Phase 4 i18n scaffolding started

---

## Spec coverage (Phase 3)

| Requirement | Task |
|---|---|
| lead_call_attempts table | 1 |
| Seven outcomes | 2 |
| Agent/super visibility | 3 |
| Newest-first history UI | 4 |
| No dialer | 4 (explicit non-feature) |
| Docs | 5–6 |
