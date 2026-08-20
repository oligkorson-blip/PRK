/**
 * Shared four-step investor journey — How it works (agency §4.2).
 * Framed as one narrative: see the place, get the documents, decide.
 * Home “A clear path” uses ACCESS_STEPS (3 steps).
 */

export const JOURNEY_STEPS = [
  {
    n: "01",
    title: "See the place",
    body: "Start somewhere familiar: parking near the stations, airports, and city centres people already use. The operator, the minimum investment, the target return, and the risks are all visible before you create an account."
  },
  {
    n: "02",
    title: "Request an invitation",
    body: "A short application tells us who you are and what you are considering. We usually reply within three business days, and applying commits you to nothing."
  },
  {
    n: "03",
    title: "Get the documents",
    body: "If you are invited, your private portal opens with the deal documents, the costs, and the risks in writing. Complete your identity check and read everything at your own pace."
  },
  {
    n: "04",
    title: "Decide, then follow along",
    body: "Registering interest is not a commitment. Once an investment is confirmed, its recorded payments and updates live in the same portal, so you always know where you stand."
  }
] as const;

export type JourneyStep = (typeof JOURNEY_STEPS)[number];

/**
 * “What you get” portal preview — How it works, below the journey steps.
 * Shows what membership actually contains; keep free of advisory language.
 */
export const PORTAL_PREVIEW = {
  kicker: "What you get",
  title: "One portal for the whole relationship",
  lead: "After confirmation, everything about your investments lives in one place: the figures, the paperwork, and the payments as they are recorded.",
  points: [
    {
      title: "Your places at a glance",
      body: "Every confirmed investment on one screen, with its location, operator, and target return."
    },
    {
      title: "Payments as they are recorded",
      body: "Each distribution appears with its date and amount, next to the schedule set out in the documents."
    },
    {
      title: "Your documents, kept together",
      body: "Contracts, identity checks, and opportunity documents stay in one place, ready whenever you need them."
    },
    {
      title: "A person when you need one",
      body: "Questions go to the team directly, and replies come by email."
    }
  ]
} as const;
