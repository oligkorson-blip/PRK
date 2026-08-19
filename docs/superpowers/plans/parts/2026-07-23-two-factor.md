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
