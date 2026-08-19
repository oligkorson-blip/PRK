export const LEAD_CALL_OUTCOMES = [
  "no_answer",
  "reached",
  "interested",
  "not_interested",
  "callback",
  "wrong_number",
  "other"
] as const;

export type LeadCallOutcome = (typeof LEAD_CALL_OUTCOMES)[number];

const LABELS: Record<LeadCallOutcome, string> = {
  no_answer: "No answer",
  reached: "Reached",
  interested: "Interested",
  not_interested: "Not interested",
  callback: "Callback",
  wrong_number: "Wrong number",
  other: "Other"
};

export function isLeadCallOutcome(value: string): value is LeadCallOutcome {
  return (LEAD_CALL_OUTCOMES as readonly string[]).includes(value);
}

export function parseLeadCallOutcome(value: unknown): LeadCallOutcome | null {
  if (typeof value !== "string") return null;
  return isLeadCallOutcome(value) ? value : null;
}

export function leadCallOutcomeLabel(outcome: LeadCallOutcome): string {
  return LABELS[outcome];
}
