import { createHash } from "node:crypto";

import nodemailer from "nodemailer";

import { isDemoMode } from "../demo-mode";

/**
 * Transactional email for one-server hosting.
 * Skips (and logs) when SMTP_HOST is unset. Uses nodemailer when configured.
 * When DEMO_MODE=false and SMTP is unset, logs an error (fail loud) — callers still get skipped:true
 * so invite link UIs can show manual delivery. Resend is not used.
 */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

function isProductionLike(): boolean {
  return !isDemoMode();
}

function smtpPort(): number {
  const raw = process.env.SMTP_PORT?.trim();
  if (!raw) return 587;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 587;
}

function smtpSecure(): boolean {
  const flag = process.env.SMTP_SECURE?.trim().toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return smtpPort() === 465;
}

function smtpFrom(): string {
  const from = process.env.SMTP_FROM?.trim();
  if (from) return from;
  const user = process.env.SMTP_USER?.trim();
  if (user) return user;
  return "Parkwise <noreply@localhost>";
}

// Non-reversible log handle: correlates log lines for one recipient without
// writing the raw address (PII) or message subject into logs.
function recipientLogId(to: string): string {
  return createHash("sha256").update(to.trim().toLowerCase()).digest("hex").slice(0, 12);
}

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<{ sent: boolean; skipped?: boolean }> {
  if (!isSmtpConfigured()) {
    if (isProductionLike()) {
      console.error(
        "[email:skip:production]",
        "SMTP_HOST is unset while DEMO_MODE=false — message not delivered. Configure SMTP before relying on email.",
        recipientLogId(opts.to)
      );
    } else {
      console.info("[email:skip]", recipientLogId(opts.to));
    }
    return { sent: false, skipped: true };
  }

  const host = process.env.SMTP_HOST!.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;

  // Fail fast on a partial SMTP quartet: an empty password or a localhost
  // fallback From would otherwise send (or "send") mail we cannot deliver.
  if (!process.env.SMTP_FROM?.trim() || !user || !pass) {
    console.error(
      "[email:config]",
      "SMTP_HOST is set but SMTP_FROM/SMTP_USER/SMTP_PASS are incomplete — refusing to send. Set the full SMTP quartet or unset SMTP_HOST.",
      recipientLogId(opts.to)
    );
    return { sent: false, skipped: false };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: smtpPort(),
      secure: smtpSecure(),
      // Never fall back to plaintext: STARTTLS must be negotiated (no-op when secure is true).
      requireTLS: true,
      // Bounded waits: a hung SMTP server must not stall server actions on
      // nodemailer's multi-minute defaults (10s connect/greet, 30s socket).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from: smtpFrom(),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      replyTo: opts.replyTo
    });

    console.info("[email:sent]", recipientLogId(opts.to));
    return { sent: true };
  } catch (err) {
    console.error("[email:fail]", recipientLogId(opts.to), err);
    return { sent: false, skipped: false };
  }
}
