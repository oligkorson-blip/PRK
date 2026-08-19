/**
 * Shared four-step investor journey — How it works (agency §4.2).
 * Home “A clear path” uses ACCESS_STEPS (3 steps).
 */

export const JOURNEY_STEPS = [
  {
    n: "01",
    title: "Explore opportunities",
    body: "Browse locations, operators, minimum investments, target returns, and risks without creating an account."
  },
  {
    n: "02",
    title: "Request an invitation",
    body: "Complete a short application. We usually reply within three business days."
  },
  {
    n: "03",
    title: "Review and verify",
    body: "Set up your portal, complete your identity check, and read the opportunity documents."
  },
  {
    n: "04",
    title: "Decide and follow",
    body: "Registering interest is not a commitment. Once confirmed, follow the investment and its recorded payments in your portal."
  }
] as const;

export type JourneyStep = (typeof JOURNEY_STEPS)[number];
