/**
 * Home “How access works” steps (3-step deck).
 * How-it-works page uses JOURNEY_STEPS (4 process steps) instead.
 */

export const ACCESS_STEPS = [
  {
    n: "01",
    title: "Explore opportunities",
    body: "Browse places across Europe by location, operator, minimum investment, and target return.",
    meta: "About 2 minutes · No account needed"
  },
  {
    n: "02",
    title: "Request an invitation",
    body: "Tell us a little about yourself and the kind of opportunity you are considering.",
    meta: "Short form · No commitment to invest"
  },
  {
    n: "03",
    title: "Review before you decide",
    body: "Complete identity checks, read the documents, and ask questions. Confirmed investments then appear in your portal.",
    meta: "Documents and checks · Decide only when ready"
  }
] as const;

export type AccessStep = (typeof ACCESS_STEPS)[number];
