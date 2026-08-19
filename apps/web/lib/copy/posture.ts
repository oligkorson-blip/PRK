/**
 * CRO residual controls (R1–R14) — product copy & gates.
 * Consumer-facing posture lives in lib/copy/consumer.ts; keep legal accuracy here.
 */

import { POSTURE_CONSUMER, RISK_LINE_SHORT as CONSUMER_RISK } from "@/lib/copy/consumer";

/** R2 — positive perimeter (what we are, not only what we are not). */
export const PERIMETER_STATEMENT =
  "Parkwise is an Irish investor platform for reviewing parking and mobility opportunities. It is not a UCITS, AIF, crowdfunding portal, or MiFID investment firm. Cross-border marketing rules may still apply.";

/** R1 — what a holding is. */
export const HOLDING_MEANING =
  "When we confirm your investment, it appears in your dashboard. Payments, if any, follow your deal documents — not through this app alone.";

/** R8 — conflicts. */
export const COI_DISCLOSURE =
  "We set terms for each opportunity and confirm investments. See our Terms for how we manage conflicts of interest.";

/** Combined public posture (footer / shells). */
export const POSTURE_LINE = POSTURE_CONSUMER;

export const RISK_LINE_SHORT = CONSUMER_RISK;

/** R12 — ops SLA (product target, not a warranty). */
export const INVITE_SLA_COPY =
  "We usually reply within three business days. If we need anything else, a member of the team will contact you.";

/** R7 — invite security (ops + SETUP). */
export const INVITE_SECURITY_NOTE =
  "Set-password invite links are single-use with a short TTL. Do not paste full invite URLs into tickets, Slack, or application logs. Store token ids only. Prefer SMTP delivery before scaling volume.";

/** R6 — minimum AML before confirm→holding (ops checklist). */
export const AML_CONFIRM_MINIMUM = [
  "Identity document reviewed (or company registry pack for corporates)",
  "Sanctions / PEP screening recorded (manual or vendor)",
  "Source-of-funds note when ticket band or risk flags require it",
  "Single admin confirm, claimed atomically from pending status and recorded in the audit log",
  "KYC status = approved on the investor record"
] as const;

/** R3 — buyback stays off until funded. */
export const BUYBACK_ENABLED =
  process.env.BUYBACK_FUNDED === "true" || process.env.BUYBACK_FUNDED === "1";
