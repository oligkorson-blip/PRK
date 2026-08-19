# Parkwise Investor Platform MVP — Plan 2: Onboarding + Interests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in investors complete onboarding, express interest in published assets, see interest status in the portal, and let admins confirm or decline interests (creating a holding on confirm), with Resend transactional emails and audit events.

**Architecture:** Extend the existing `apps/web` Next.js app. Add Drizzle tables `interests` and `holdings`. Use Server Actions for mutations with Clerk session + role checks. Gate incomplete onboarding to `/onboarding`. Resend sends interest received / confirmed / declined emails (no-op or log when `RESEND_API_KEY` is unset in local demo).

**Tech Stack:** Next.js 15, Clerk, Drizzle, Neon, Zod, Resend, Vitest (same as Plan 1).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-investor-platform-mvp-design.md`
- Setup: `apps/web/docs/SETUP.md`
- Preserve Parkwise palette and risk language; never label yields as guaranteed
- Commitment model: express interest only; ops confirms/declines manually
- Capacity is advisory only — never block confirm on capacity
- One open (`pending`) interest per investor per asset
- Admin role: Clerk `publicMetadata.role === "admin"`
- Rate limit: max 10 express-interest submissions per investor per UTC day
- No R2 / document vault in Plan 2 (Plan 3)
- Do not commit secrets; use `.env.local`
- Commit with: `git -c user.email="parkwise@local" -c user.name="Parkwise"` when local identity is unset

## File Structure (new / primary)

```
apps/web/
  lib/db/schema.ts              # add interests, holdings enums/tables
  lib/interests/transitions.ts  # pure status helpers
  lib/interests/validation.ts   # amount/note validation
  lib/interests/actions.ts      # server actions
  lib/onboarding/actions.ts
  lib/onboarding/schema.ts      # zod questionnaire
  lib/email/resend.ts
  lib/auth/gates.ts             # requireOnboarded, requireActiveInvestor
  app/onboarding/page.tsx
  app/legal/terms/page.tsx
  app/legal/privacy/page.tsx
  app/legal/risk/page.tsx
  app/opportunities/[slug]/interest-form.tsx
  app/portal/page.tsx             # list interests
  app/portal/holdings/page.tsx    # list holdings
  app/admin/interests/page.tsx
  app/admin/interests/actions.ts
  tests/interest-transitions.test.ts
  tests/interest-validation.test.ts
  tests/onboarding-schema.test.ts
```

---

### Task 1: Schema for interests and holdings

**Files:**
- Modify: `apps/web/lib/db/schema.ts`
- Create: migration via `npm run db:generate`
- Modify: `apps/web/.env.example` (add `RESEND_API_KEY`, `RESEND_FROM_EMAIL`)

**Interfaces:**
- Consumes: existing `investors`, `assets`
- Produces: tables `interests`, `holdings` matching the design spec; enums `interest_status`, `holding_status`

- [ ] **Step 1: Extend schema**

Append to `apps/web/lib/db/schema.ts`:

```ts
export const interestStatusEnum = pgEnum("interest_status", [
  "pending",
  "confirmed",
  "declined",
  "withdrawn"
]);

export const holdingStatusEnum = pgEnum("holding_status", ["active", "closed"]);

export const interests = pgTable(
  "interests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    amountEur: integer("amount_eur").notNull(),
    note: text("note"),
    status: interestStatusEnum("status").notNull().default("pending"),
    adminNote: text("admin_note"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("interests_one_pending_uidx").on(t.investorId, t.assetId, t.status)]
);
```

**Important:** A unique index on `(investor_id, asset_id, status)` would block multiple declined rows. Instead enforce “one pending” in application code and add a **partial unique index** in raw SQL migration:

```sql
CREATE UNIQUE INDEX interests_one_pending_uidx
  ON interests (investor_id, asset_id)
  WHERE status = 'pending';
```

In Drizzle schema, omit the composite unique on status; document the partial index in the generated migration (edit SQL if Drizzle cannot emit partial unique indexes).

```ts
export const holdings = pgTable("holdings", {
  id: uuid("id").defaultRandom().primaryKey(),
  investorId: uuid("investor_id")
    .notNull()
    .references(() => investors.id),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id),
  interestId: uuid("interest_id")
    .notNull()
    .references(() => interests.id)
    .unique(),
  amountEur: integer("amount_eur").notNull(),
  targetYieldPct: numeric("target_yield_pct", { precision: 5, scale: 2 }).notNull(),
  status: holdingStatusEnum("status").notNull().default("active"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
```

- [ ] **Step 2: Generate and commit migration**

```bash
cd apps/web && npm run db:generate
# Edit SQL to add partial unique index if needed
# If DATABASE_URL set: npm run db:migrate
```

- [ ] **Step 3: Update `.env.example`**

Add:

```bash
RESEND_API_KEY=
RESEND_FROM_EMAIL=Parkwise <noreply@localhost>
```

Update `apps/web/docs/SETUP.md` Resend rows if needed (already listed).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/db/schema.ts apps/web/drizzle apps/web/.env.example
git commit -m "add interests and holdings schema for Plan 2"
```

---

### Task 2: Pure validation and status transition helpers (TDD)

**Files:**
- Create: `apps/web/lib/interests/validation.ts`
- Create: `apps/web/lib/interests/transitions.ts`
- Create: `apps/web/tests/interest-validation.test.ts`
- Create: `apps/web/tests/interest-transitions.test.ts`

**Interfaces:**
- Produces:
  - `validateInterestAmount(amountEur: number, minTicketEur: number): { ok: true } | { ok: false; error: string }`
  - `validateInterestNote(note: string | null | undefined): { ok: true; note: string | null } | { ok: false; error: string }`
  - `canTransitionInterest(from: InterestStatus, to: InterestStatus): boolean`
  - `assertTransition(from, to): void` throws if illegal

- [ ] **Step 1: Failing tests**

```ts
// tests/interest-validation.test.ts
import { describe, expect, it } from "vitest";
import { validateInterestAmount, validateInterestNote } from "@/lib/interests/validation";

describe("validateInterestAmount", () => {
  it("rejects below minimum", () => {
    expect(validateInterestAmount(1000, 9900).ok).toBe(false);
  });
  it("accepts exact minimum", () => {
    expect(validateInterestAmount(9900, 9900).ok).toBe(true);
  });
  it("rejects non-integers", () => {
    expect(validateInterestAmount(9900.5, 9900).ok).toBe(false);
  });
});

describe("validateInterestNote", () => {
  it("allows empty", () => {
    expect(validateInterestNote("").ok).toBe(true);
  });
  it("rejects over 500 chars", () => {
    expect(validateInterestNote("x".repeat(501)).ok).toBe(false);
  });
});
```

```ts
// tests/interest-transitions.test.ts
import { describe, expect, it } from "vitest";
import { canTransitionInterest } from "@/lib/interests/transitions";

describe("canTransitionInterest", () => {
  it("allows pending to confirmed|declined|withdrawn", () => {
    expect(canTransitionInterest("pending", "confirmed")).toBe(true);
    expect(canTransitionInterest("pending", "declined")).toBe(true);
    expect(canTransitionInterest("pending", "withdrawn")).toBe(true);
  });
  it("rejects transitions out of confirmed/declined", () => {
    expect(canTransitionInterest("confirmed", "declined")).toBe(false);
    expect(canTransitionInterest("declined", "pending")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web && npm test -- tests/interest-validation.test.ts tests/interest-transitions.test.ts
```

- [ ] **Step 3: Implement helpers**

```ts
// lib/interests/validation.ts
export function validateInterestAmount(amountEur: number, minTicketEur: number) {
  if (!Number.isInteger(amountEur) || amountEur < minTicketEur) {
    return { ok: false as const, error: `Amount must be a whole number of at least €${minTicketEur}.` };
  }
  return { ok: true as const };
}

export function validateInterestNote(note: string | null | undefined) {
  const trimmed = (note ?? "").trim();
  if (trimmed.length > 500) {
    return { ok: false as const, error: "Note must be 500 characters or fewer." };
  }
  return { ok: true as const, note: trimmed.length ? trimmed : null };
}
```

```ts
// lib/interests/transitions.ts
export type InterestStatus = "pending" | "confirmed" | "declined" | "withdrawn";

const ALLOWED: Record<InterestStatus, InterestStatus[]> = {
  pending: ["confirmed", "declined", "withdrawn"],
  confirmed: [],
  declined: [],
  withdrawn: []
};

export function canTransitionInterest(from: InterestStatus, to: InterestStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: InterestStatus, to: InterestStatus): void {
  if (!canTransitionInterest(from, to)) {
    throw new Error(`Illegal interest transition ${from} → ${to}`);
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd apps/web && npm test
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/interests apps/web/tests
git commit -m "add interest validation and transition helpers"
```

---

### Task 3: Onboarding flow

**Files:**
- Create: `apps/web/lib/onboarding/schema.ts`
- Create: `apps/web/lib/onboarding/actions.ts`
- Create: `apps/web/tests/onboarding-schema.test.ts`
- Create: `apps/web/app/onboarding/page.tsx`
- Create: `apps/web/app/legal/terms/page.tsx`
- Create: `apps/web/app/legal/privacy/page.tsx`
- Create: `apps/web/app/legal/risk/page.tsx`
- Create: `apps/web/lib/auth/gates.ts`
- Modify: `apps/web/middleware.ts` (optional soft redirects)
- Modify: `apps/web/app/portal/page.tsx` (redirect to onboarding if incomplete)

**Interfaces:**
- Produces:
  - `onboardingFormSchema` (Zod)
  - `completeOnboarding(input): Promise<{ ok: true } | { ok: false; error: string }>`
  - `requireCompletedOnboarding(investor): void` / helper boolean `isOnboardingComplete(investor)`
- Eligibility questions (fixed MVP set):
  1. `isQualifyingInvestor` boolean — “I confirm I meet the eligibility criteria for this offering.”
  2. `understandsCapitalAtRisk` boolean — “I understand capital is at risk and target yields are not guaranteed.”
  3. `investmentHorizon` enum `3-5` | `5-10` | `10+`
  4. `sourceOfFunds` string max 200

Profile fields: `fullName`, `country`, `phone` (optional).

Must set `termsAcceptedAt`, `riskAcceptedAt`, `onboardingStatus: "completed"`, store answers in `eligibilityAnswers`, audit `onboarding.completed`.

Legal pages: placeholder counsel copy clearly marked “Draft — subject to legal review” with the required risk language.

- [ ] **Step 1: Zod schema tests + implement schema**

```ts
// lib/onboarding/schema.ts
import { z } from "zod";

export const onboardingFormSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  investmentHorizon: z.enum(["3-5", "5-10", "10+"]),
  sourceOfFunds: z.string().trim().min(2).max(200),
  isQualifyingInvestor: z.literal(true),
  understandsCapitalAtRisk: z.literal(true),
  acceptTerms: z.literal(true),
  acceptRisk: z.literal(true)
});
```

- [ ] **Step 2: Server action `completeOnboarding`**

Uses `ensureInvestor()`, parses form data with Zod, updates investor row, writes audit. Reject if already completed (idempotent success OK).

- [ ] **Step 3: UI page `/onboarding`**

Server page + client form using Parkwise form styles from `globals.css`. Links to `/legal/terms`, `/legal/privacy`, `/legal/risk`. On success `redirect("/portal")`.

- [ ] **Step 4: Gates**

```ts
export function isOnboardingComplete(investor: {
  onboardingStatus: string;
  termsAcceptedAt: Date | null;
  riskAcceptedAt: Date | null;
}): boolean {
  return (
    investor.onboardingStatus === "completed" &&
    investor.termsAcceptedAt != null &&
    investor.riskAcceptedAt != null
  );
}
```

Portal: if signed in and not complete → `redirect("/onboarding")`.  
Opportunity interest form: only if complete + `accountStatus === "active"`.

- [ ] **Step 5: Tests + commit**

```bash
cd apps/web && npm test
git add apps/web
git commit -m "add investor onboarding flow and legal placeholders"
```

---

### Task 4: Express interest + portal list

**Files:**
- Create: `apps/web/lib/interests/actions.ts`
- Create: `apps/web/lib/email/resend.ts`
- Create: `apps/web/components/interest-form.tsx`
- Modify: `apps/web/app/opportunities/[slug]/page.tsx`
- Modify: `apps/web/app/portal/page.tsx`
- Create: `apps/web/app/portal/holdings/page.tsx`

**Interfaces:**
- Produces:
  - `createInterest({ assetSlug, amountEur, note }): Promise<Result>`
  - `withdrawInterest({ interestId }): Promise<Result>`
  - `sendInterestEmail(type, payload)` — uses Resend when key present; otherwise `console.info` and returns `{ skipped: true }`
- Rate limit: count interests created by investor today (UTC); reject if ≥ 10 with clear error.

- [ ] **Step 1: Email helper**

```ts
// lib/email/resend.ts
export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ sent: boolean; skipped?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Parkwise <noreply@localhost>";
  if (!key) {
    console.info("[email:skip]", opts.subject, opts.to);
    return { sent: false, skipped: true };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  await resend.emails.send({ from, to: opts.to, subject: opts.subject, text: opts.text });
  return { sent: true };
}
```

Add dependency: `npm install resend`.

Also email `OPS_INBOX_EMAIL` on create.

- [ ] **Step 2: `createInterest` server action**

Checks: auth, onboarding complete, account active, asset published, validation, no existing pending for pair, rate limit, insert, audit `interest.created`, emails.

- [ ] **Step 3: Interest form on detail page**

Replace Plan 1 stub CTA:
- Signed out → link to sign-in
- Signed in, incomplete onboarding → link to `/onboarding`
- Else → form (amount, note, submit)

Show risk line under the form.

- [ ] **Step 4: Portal**

List investor interests with status badges. Allow withdraw button when `pending`.  
`/portal/holdings` lists holdings (empty until admin confirms).

- [ ] **Step 5: Tests for rate-limit helper if extracted; `npm test`; commit**

```bash
git commit -m "add express-interest flow and portal interest list"
```

---

### Task 5: Admin interest queue (confirm / decline)

**Files:**
- Create: `apps/web/app/admin/interests/page.tsx`
- Create: `apps/web/lib/interests/admin-actions.ts`
- Modify: `apps/web/app/admin/page.tsx` (link to queue)

**Interfaces:**
- Produces:
  - `confirmInterest({ interestId, adminNote? })` → transition pending→confirmed, create `holdings` snapshot (`amountEur`, `targetYieldPct` from asset at confirm time), audit `interest.confirmed`, email investor
  - `declineInterest({ interestId, adminNote? })` → pending→declined, audit, email

Both call `requireAdmin()` / `isAdmin(currentUser())`.

- [ ] **Step 1: Implement admin actions with transition asserts and holding insert in the same try flow**

On confirm failure after interest update, prefer a single transaction if Drizzle/neon-http supports batch; otherwise update interest first only after holding insert succeeds — order: insert holding is wrong without confirmed interest. Preferred order:

1. Load interest+asset+investor; assert pending
2. `assertTransition("pending","confirmed")`
3. Update interest status
4. Insert holding
5. Audit + email

If step 4 fails, leave a comment in report; ideally use `db.transaction` when available with neon WebSockets, or document neon-http limitation and perform update+insert sequentially with compensating note.

- [ ] **Step 2: Admin UI**

Table of `pending` interests: investor email, asset name, amount, createdAt, actions Confirm/Decline with optional admin note field.

- [ ] **Step 3: Manual verify (if env present) + commit**

```bash
git commit -m "add admin interest confirm/decline with holdings"
```

---

### Task 6: Plan 2 verification doc and hardening

**Files:**
- Create: `apps/web/docs/plan2-verify.md`
- Modify: `apps/web/docs/SETUP.md` (link Plan 2 verify)
- Modify: `README.md` if needed

**Checklist items:**

```markdown
- [ ] npm test passes
- [ ] npm run build passes
- [ ] Incomplete onboarding redirects from /portal to /onboarding
- [ ] Completed onboarding can submit interest ≥ min ticket
- [ ] Second pending interest on same asset rejected
- [ ] Portal shows pending interest
- [ ] Admin confirm creates holding and emails (or skip-log)
- [ ] Admin decline updates status
- [ ] Investor can withdraw pending interest
- [ ] Yield copy never says guaranteed
```

- [ ] **Step 1: Write doc and run what is possible without secrets**
- [ ] **Step 2: Commit**

```bash
git commit -m "document Plan 2 verification checklist"
```

---

## Spec coverage (Plan 2)

| Spec area | Task |
|---|---|
| Onboarding + T&Cs/risk acceptance | Task 3 |
| Express interest | Task 4 |
| Interest status machine | Tasks 2, 4, 5 |
| Admin confirm/decline + holding | Task 5 |
| Resend emails | Tasks 4–5 |
| Audit on interest/onboarding | Tasks 3–5 |
| Rate limit 10/day | Task 4 |
| R2 documents / full vault | Plan 3 |

## Out of Plan 2

- Asset admin CRUD UI (can remain seed-only)
- Document uploads
- Playwright E2E suite
- Production counsel final legal copy
