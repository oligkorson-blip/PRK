import { TERMINAL_LEAD_STATUSES } from "./labels";

export const STALE_AFTER_DAYS = 7;

const TERMINAL = new Set<string>(TERMINAL_LEAD_STATUSES);

/**
 * A lead is stale when it is still workable (non-terminal) but nobody has
 * touched it for over a week. Leads with no recorded activity are "unworked",
 * a separate queue concept (getLeadDashboardCounts), not stale.
 */
export function isStaleLead(
  lead: { status: string; lastActivityAt: Date | null },
  now: Date = new Date()
): boolean {
  if (TERMINAL.has(lead.status)) return false;
  if (!lead.lastActivityAt) return false;
  return now.getTime() - lead.lastActivityAt.getTime() > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
