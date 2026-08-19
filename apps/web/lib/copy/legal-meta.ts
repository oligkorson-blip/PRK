/**
 * Single source of truth for legal-page metadata and version stamps.
 * `effective` is the "Last updated" date stored as ISO YYYY-MM-DD (for sorting /
 * machine use). Render with `formatDateDdMmYyyy` so the UI shows DD-MM-YYYY.
 */
export const LEGAL_META = {
  risk: {
    title: "Risk disclosure",
    description:
      "What can go wrong with parking investments on Parkwise, in plain language. Capital at risk.",
    effective: "2026-04-14"
  },
  terms: {
    title: "Platform terms",
    description: "The rules for using Parkwise as an investor.",
    effective: "2026-04-14"
  },
  privacy: {
    title: "Privacy notice",
    description: "How Parkwise processes personal data under GDPR principles.",
    effective: "2026-04-14"
  },
  cookies: {
    title: "Cookie notice",
    description: "Which cookies and storage Parkwise uses, and why.",
    effective: "2026-04-14"
  },
  complaints: {
    title: "Complaints",
    description:
      "How to raise a complaint about the Parkwise investor platform, and how we aim to respond.",
    effective: "2026-04-14"
  }
} as const;

export type LegalPageId = keyof typeof LEGAL_META;
