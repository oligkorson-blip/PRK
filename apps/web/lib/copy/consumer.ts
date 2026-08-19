/**
 * Consumer-facing copy system for Parkwise marketing and product UI.
 * Written for a mature audience: warm, direct, and free of investment-desk jargon.
 */

export const CAMPAIGN_HEADLINE = "They park. You earn.";

/** @deprecated Prefer CAMPAIGN_HEADLINE — kept as an alias for older imports. */
export const CAMPAIGN_HEADLINE_STRICT = CAMPAIGN_HEADLINE;

export const CAMPAIGN_KICKER = "Invest in the places Europe already depends on";

export const CAMPAIGN_SUPPORT =
  "Parking near the stations, airports, and city centres people already use. Browse the numbers, read the details, and decide when you are ready.";

export const CAMPAIGN_QUALIFIER =
  "Familiar European locations. Experienced operators. One clear catalogue to browse.";

export const RISK_LINE =
  "Investment values and income can fall. Target returns are not guaranteed.";

export const RISK_LINE_SHORT = "Capital at risk. Target returns are not guaranteed.";

/** Home chrome strip under the hero — true product facts only (no vanity metrics). */
export const STATUS_BAR_HOME =
  "Browse without an account · Invitation before documents · No platform fee today · Capital at risk";

export const HOME_TRUST_FACTS = [
  { label: "Browse freely", detail: "No account needed to explore" },
  { label: "Invitation first", detail: "Documents after you request access" },
  { label: "Operator-run sites", detail: "Day-to-day parking stays with the operator" },
  { label: "No platform fee today", detail: "Any deal costs are shown in the documents" }
] as const;

/**
 * Qualified "no platform fee" line — mirrors the Terms wording ("Unless
 * separately disclosed in writing, Parkwise does not charge a platform fee…")
 * for marketing surfaces. Keep free of apostrophes (asserted in rendered HTML).
 */
export const NO_PLATFORM_FEE_LINE =
  "Parkwise does not charge a platform fee today. Any costs specific to an opportunity are set out in the opportunity documents before you invest.";

/** Short, contextual fee summary for opportunity pages. */
export const OPPORTUNITY_FEE_SUMMARY =
  "No platform fee from Parkwise today. Opportunity-specific fees or costs, if any, are set out in the deal documents before you invest.";

/** Explains the boundary between platform fees and costs in the underlying opportunity. */
export const FEE_TERMINOLOGY_LINE =
  "A platform fee would be charged by Parkwise. Opportunity fees and operating costs relate to the underlying deal and can reduce what is available for distribution.";

export const ILLUSTRATION_DISCLAIMER =
  "Example only, before tax. You may receive less, more, later — or nothing.";

/**
 * Always-visible marker for guide articles — guides must read as education,
 * not as catalogue entries. Not env-gated; independent of the demo banner.
 * Keep free of apostrophes (asserted in rendered HTML).
 */
export const GUIDE_ILLUSTRATIVE_DISCLAIMER =
  "This guide is illustrative and not a live investment offering. Figures are examples only. Capital at risk.";

/**
 * Always-visible marker for the Help Me Choose tool — same substance as the
 * guide disclaimer, but tool-scoped (avoid "This guide…" on a preference flow).
 * Keep free of apostrophes (asserted in rendered HTML).
 */
export const CHOOSER_ILLUSTRATIVE_DISCLAIMER =
  "This shortlist is illustrative and not a live investment offering. Figures are examples only. Capital at risk.";

/** Preference matches are browsing filters, not personal advice. No apostrophes. */
export const CHOOSER_NON_ADVISORY_LINE =
  "These are filters to help you browse — not personal advice.";

export const ILLUSTRATION_ASSUMPTIONS =
  "Assumes target income is achieved. Figures are gross of tax and before any costs; the target basis is described in the deal documents.";

export const TARGET_RETURN_EXPLAINER =
  "Target returns come from the deal terms. They're goals, not promises.";

export const FOOTER_BLURB =
  "Explore parking opportunities across familiar European destinations.";

export const POSTURE_CONSUMER =
  "Parkwise helps you explore parking investments in Europe. Target figures are not guarantees. Investment values and income can fall.";

/** Primary marketing CTA label (agency lexicon). */
export const REQUEST_ACCESS_LABEL = "Request access";

export const HOME_ABOUT = {
  kicker: "Why Parkwise",
  title: "Parking is familiar. Investing in it should feel clear.",
  lead:
    "See the place, the operator, the numbers, the costs, and the risks in one place. Explore first. Ask questions. Move forward only when you are ready.",
  points: [
    {
      title: "Places people recognise",
      body: "Opportunities near major stations, airports, retail destinations, and city centres across Europe."
    },
    {
      title: "Operators you can see",
      body: "Every opportunity names the operator who runs the site day to day."
    },
    {
      title: "A decision at your pace",
      body: "Compare the numbers, read the documents, and speak with the team before you commit."
    }
  ]
} as const;

export const HOME_RISK = {
  kicker: "Worth knowing",
  title: "Understanding the risks",
  lead: "Capital and income can go up or down. Read these before you look at a specific opportunity.",
  points: [
    {
      title: "Income can fall",
      body: "Occupancy, pricing, and operating costs can reduce what you receive — or pause payments."
    },
    {
      title: "Targets are not guarantees",
      body: "You may get less than the target return, receive it later, or receive nothing."
    },
    {
      title: "Capital is at risk",
      body: "You may lose some or all of the money you put in."
    },
    {
      title: "Liquidity is limited",
      body: "These opportunities are typically hard to sell before the end of the stated term."
    }
  ],
  linkLabel: "Read the full risk disclosure →",
  linkHref: "/legal/risk"
} as const;

export const HOME_QUIET = {
  lines: [
    "Parking is invisible.",
    "Until you realise how much of everyday life depends on it."
  ]
} as const;

export const HOME_FAQ = [
  {
    q: "How does an investment request work?",
    a: "Choose a place and an investment option, then register your interest. After identity checks and confirmation, it appears in your private portal. The operator keeps running the parking site day to day."
  },
  {
    q: "Are target returns guaranteed?",
    a: "No. Target returns are contractual targets agreed with the operator. Occupancy, pricing, and operating costs can change. You may receive less than the target, or lose part or all of your capital."
  },
  {
    q: "How often will I receive updates?",
    a: "Each opportunity shows its reporting schedule. Important updates, documents, and recorded payments appear together in your private portal."
  },
  {
    q: "Can I exit early?",
    a: "These investments are generally meant to be held for the stated term. An early transfer may not be available and could involve a discount, so do not invest money you may need at short notice."
  },
  {
    q: "What fees does Parkwise charge?",
    a: "Structuring and administration fees are shown in euros before you confirm. Where projected figures are presented net of fees, this is stated on the page."
  }
] as const;

export const HOME_FUNDING_PANEL = {
  badge: "European parking",
  label: "European opportunity catalogue",
  name: "Stations · Airports · City centres",
  footnotes: ["Published opportunities", "Invitation before documents"]
} as const;

export const PORTAL_WITHDRAWAL_UNAVAILABLE =
  "Withdrawals are currently unavailable for this account. Talk to the team if you have questions.";

export const PORTAL_WITHDRAWAL_CONFIRMATION =
  "You can keep this request active or withdraw it now. A withdrawal cannot be reversed.";

export const PORTAL_WITHDRAWAL_ERROR =
  "We couldn't complete that withdrawal just yet. Please try again, or contact the team if it continues.";

export const PORTAL_EMPTY = {
  notInvited: "Your private portal opens after invitation. We will email you when it is ready.",
  noInterests:
    "You have not requested an opportunity yet. Explore the catalogue and save one when it feels relevant.",
  noHoldings:
    "You have no confirmed investments yet. Confirmed requests will appear here with their documents and payment history.",
  kycIncomplete: "Please complete your identity check before an investment can be confirmed.",
  gettingStarted:
    "A few clear steps stand between browsing and a confirmed investment. You can stop, review, or ask for help at any point.",
  portfolioLead:
    "See what you have invested, what has been recorded as paid, and what needs your attention.",
  waitingOnTeam:
    "Thanks — we have your request. The team reviews identity and capacity before confirming. You will see the update here.",
  noAgreements:
    "Agreements appear here when the team prepares one for your account. Nothing becomes effective until the required signatures are complete.",
  contactForHelp: "Questions? Talk to the team — we reply by email."
} as const;