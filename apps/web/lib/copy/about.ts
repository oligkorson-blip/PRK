/**
 * About page copy. Editorial voice: calm, concrete, risk-literate.
 * The do/don't section is framed as promises versus limits — keep both
 * columns equally visible and never soften the limits side.
 */

export const ABOUT_META_DESCRIPTION =
  "Real parking assets. Serious diligence. Clear reporting. Learn what Parkwise does and does not do.";

export const ABOUT_INTRO = {
  kicker: "About",
  title: "A clearer way to explore a familiar kind of place.",
  lead: "Parkwise is built around a simple idea: you should understand a parking investment well before anyone asks you to act on it."
} as const;

export const ABOUT_MISSION = {
  kicker: "Our mission",
  statement:
    "Make a parking investment something you could explain at the dinner table — the place, the operator, the numbers, and what could go wrong."
} as const;

export const ABOUT_WHY = {
  kicker: "Why we exist",
  title: "Make parking investing feel human",
  lead: "Most people already understand the basic model: drivers pay for a convenient space, day after day. Parkwise turns that familiar behaviour into opportunity pages you can read, compare, and question — while professional operators run each site."
} as const;

export const ABOUT_WHAT_WE_DO = {
  kicker: "What we do",
  title: "Show. Read. Stay.",
  points: [
    {
      strong: "Show you real places",
      body: "parking near the stations, airports, and city centres people already use, across our focus markets."
    },
    {
      strong: "Read before we list",
      body: "terms, risks, and structure are reviewed before anything is published."
    },
    {
      strong: "Stay beside the decision",
      body: "documents, updates, and your investments in one calm account."
    }
  ]
} as const;

export const ABOUT_PROMISES_LIMITS = {
  kicker: "Promise and limits",
  title: "What you can hold us to — and what you cannot.",
  promises: {
    title: "What we promise",
    points: [
      "Publish parking opportunities with the key terms up front",
      "Run your sign-up and investment confirmation with care",
      "Keep your documents and investments in one place",
      "Work with professional operators who manage each site day to day"
    ]
  },
  limits: {
    title: "Where we stop",
    points: [
      "We do not guarantee returns or monthly income",
      "We are not a bank, and your money is not a deposit with us",
      "We are not a regulated fund (UCITS or AIF), and we do not claim to be",
      "We cannot read the risks for you — the documents are yours to read"
    ]
  }
} as const;

export const ABOUT_OPERATORS = {
  kicker: "Operators",
  title: "Professional operators run each site",
  lead: "Each site is run day to day by an experienced parking operator. We look after the investor side — presenting each opportunity, guiding you in, and keeping your reporting clear."
} as const;

export const ABOUT_FEES = {
  kicker: "How Parkwise earns",
  title: "Fees, in plain terms",
  /** Follows NO_PLATFORM_FEE_LINE in the rendered paragraph. */
  leadTail:
    "Where an opportunity carries its own structuring or administration costs, they are set out in the opportunity documents before you confirm — so you know what comes off target returns before you commit.",
  linkLabel: "View fees →",
  linkHref: "/fees"
} as const;

export const ABOUT_LOCATION_NOTE =
  "We're based in Ireland. Right now we focus on Austria, Belgium, France, Germany, Ireland, Italy, Spain, and Switzerland.";

export const ABOUT_CTA = {
  title: "See what's open",
  lead: "Compare open opportunities, then apply when you're ready.",
  primaryLabel: "Request access",
  primaryHref: "/apply",
  secondaryLabel: "Sign in",
  secondaryHref: "/sign-in"
} as const;
