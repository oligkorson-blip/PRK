"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { resolvePostSignInDestination } from "@/lib/auth/post-sign-in-actions";
import {
  TWO_FACTOR_CONNECTION_ERROR,
  TWO_FACTOR_LOST_ACCESS_PROMPT
} from "@/lib/copy/security";

export function TwoFactorChallenge() {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [trustDevice, setTrustDevice] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (pending || !error) return;
    errorRef.current?.focus();
  }, [pending, error]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "")
      .trim()
      .replace(/\s+/g, "");
    try {
      const result =
        mode === "totp"
          ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
          : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
      if (result.error) {
        setError("That verification code is invalid or expired.");
        return;
      }
      // The full session cookie exists now, so staff context resolves; a full
      // navigation picks up the freshly upgraded session cookie.
      const destination = await resolvePostSignInDestination();
      window.location.assign(destination);
    } catch {
      setError(TWO_FACTOR_CONNECTION_ERROR);
    } finally {
      setPending(false);
    }
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
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(event) => setTrustDevice(event.target.checked)}
          />
          <span>Trust this device for 7 days</span>
        </label>
        {error ? (
          <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
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
      <p className="portal-meta">
        {TWO_FACTOR_LOST_ACCESS_PROMPT} <Link href="/contact">Contact the team</Link>.
      </p>
    </>
  );
}