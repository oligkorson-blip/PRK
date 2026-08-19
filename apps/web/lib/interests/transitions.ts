export type InterestStatus = "pending" | "confirmed" | "declined" | "withdrawn";

const ALLOWED: Record<InterestStatus, InterestStatus[]> = {
  pending: ["confirmed", "declined", "withdrawn"],
  confirmed: [],
  declined: [],
  withdrawn: []
};

export function canTransitionInterest(from: InterestStatus, to: InterestStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: InterestStatus, to: InterestStatus): void {
  if (!canTransitionInterest(from, to)) {
    throw new Error(`Illegal interest transition ${from} → ${to}`);
  }
}
