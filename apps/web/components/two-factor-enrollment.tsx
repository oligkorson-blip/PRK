"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth/client";
import {
  TWO_FACTOR_BACKUP_CODES_CONNECTION_ERROR,
  TWO_FACTOR_BACKUP_CODES_SAVED_LABEL,
  TWO_FACTOR_BACKUP_CODES_STEP,
  TWO_FACTOR_BACKUP_STORAGE_GUIDANCE,
  TWO_FACTOR_DISABLE_CONNECTION_ERROR,
  TWO_FACTOR_NEW_BACKUP_CODES_NOTICE,
  TWO_FACTOR_SETUP_CONNECTION_ERROR,
  TWO_FACTOR_VERIFY_CONNECTION_ERROR
} from "@/lib/copy/security";

type Enrollment = {
  secret: string;
  totpUri: string;
  backupCodes: string[];
};

function TwoFactorManagement({ destination }: { destination: "/admin" | "/portal" }) {
  const [mode, setMode] = useState<"idle" | "disable" | "regenerate">("idle");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const freshCodesRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (pending || !error) return;
    errorRef.current?.focus();
  }, [pending, error]);

  useEffect(() => {
    if (!freshCodes) return;
    freshCodesRef.current?.focus();
  }, [freshCodes]);

  async function disableTwoFactor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    try {
      const result = await authClient.twoFactor.disable({ password });
      if (result.error) {
        setError("Two-factor could not be disabled. Check your password and try again.");
        return;
      }
      // Full reload: the server re-reads the (now disabled) flag and the
      // enrollment form returns, so the user can re-set up immediately.
      window.location.reload();
    } catch {
      setError(TWO_FACTOR_DISABLE_CONNECTION_ERROR);
    } finally {
      setPending(false);
    }
  }

  async function regenerateBackupCodes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFreshCodes(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    try {
      const result = await authClient.twoFactor.generateBackupCodes({ password });
      if (result.error || !result.data) {
        setError("Backup codes could not be regenerated. Check your password and try again.");
        return;
      }
      // Regeneration invalidates the previous codes server-side.
      setFreshCodes(result.data.backupCodes);
      setMode("idle");
    } catch {
      setError(TWO_FACTOR_BACKUP_CODES_CONNECTION_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="portal-banner portal-banner-flow">
      <p><strong>Two-factor authentication is enabled.</strong></p>
      <p>
        {TWO_FACTOR_BACKUP_STORAGE_GUIDANCE} If you lose access to your authenticator,{" "}
        <a href="/contact">contact the team</a>.
      </p>

      {freshCodes ? (
        <div className="form-field">
          <p ref={freshCodesRef} role="status" tabIndex={-1}>
            <strong>{TWO_FACTOR_NEW_BACKUP_CODES_NOTICE}</strong>
          </p>
          <ul className="security-code-list">
            {freshCodes.map((code) => <li key={code}><code>{code}</code></li>)}
          </ul>
        </div>
      ) : null}

      {mode === "idle" ? (
        <div className="stack-4">
          <button
            className="btn btn-ghost btn-block"
            type="button"
            onClick={() => { setMode("regenerate"); setError(null); }}
          >
            Regenerate backup codes
          </button>
          <button
            className="btn btn-ghost btn-block"
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
          {error ? (
            <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
              {error}
            </p>
          ) : null}
          <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
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

export function TwoFactorEnrollment({ enabled, destination }: {
  enabled: boolean;
  destination: "/admin" | "/portal";
}) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (pending || !error) return;
    errorRef.current?.focus();
  }, [pending, error]);

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

  async function begin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    try {
      const result = await authClient.twoFactor.enable({ password, issuer: "Parkwise" });
      if (result.error || !result.data) {
        setError("Two-factor setup could not start. Check your password and try again.");
        return;
      }
      const uri = result.data.totpURI;
      let secret = "";
      try {
        secret = new URL(uri).searchParams.get("secret") ?? "";
      } catch {
        // The complete URI remains available as a safe manual fallback.
      }
      setEnrollment({ secret, totpUri: uri, backupCodes: result.data.backupCodes });
    } catch {
      setError(TWO_FACTOR_SETUP_CONNECTION_ERROR);
    } finally {
      setPending(false);
    }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "")
      .trim()
      .replace(/\s+/g, "");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
      if (result.error) {
        setError("That code was not accepted. Check the authenticator clock and try again.");
        return;
      }
      window.location.assign(destination);
    } catch {
      setError(TWO_FACTOR_VERIFY_CONNECTION_ERROR);
    } finally {
      setPending(false);
    }
  }

  if (enabled) {
    return <TwoFactorManagement destination={destination} />;
  }

  if (!enrollment) {
    return (
      <form className="interest-form" onSubmit={begin}>
        <label className="form-field">
          <span>Current password</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error ? (
          <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Starting…" : "Set up authenticator"}
        </button>
      </form>
    );
  }

  return (
    <div className="interest-form">
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
        <p className="field-hint">
          On a compatible device, <a href={enrollment.totpUri}>open the authenticator setup link</a>.
          The secret never leaves this page for a third-party QR service.
        </p>
      </div>
      <div className="form-field">
        <span>{TWO_FACTOR_BACKUP_CODES_STEP}</span>
        <ul className="security-code-list">
          {enrollment.backupCodes.map((code) => <li key={code}><code>{code}</code></li>)}
        </ul>
      </div>
      <form className="interest-form" onSubmit={verify}>
        <label className="form-field">
          <span>3. Enter the current authenticator code</span>
          <input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={8} required />
        </label>
        <label className="form-checkbox">
          <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
          <span>{TWO_FACTOR_BACKUP_CODES_SAVED_LABEL}</span>
        </label>
        {error ? (
          <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={pending || !saved}>
          {pending ? "Verifying…" : "Verify and enable two-factor authentication"}
        </button>
      </form>
    </div>
  );
}
