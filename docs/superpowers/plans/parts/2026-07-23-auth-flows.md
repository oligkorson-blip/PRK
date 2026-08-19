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
