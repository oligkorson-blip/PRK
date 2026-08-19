import { and, eq } from "drizzle-orm";
import { interests } from "@/lib/db/schema";

export type PendingClaimResult = { claimed: true } | { claimed: false };

/** Interpret UPDATE … WHERE status='pending' RETURNING results. */
export function interpretPendingClaim(rows: { id: string }[]): PendingClaimResult {
  return rows.length === 1 ? { claimed: true } : { claimed: false };
}

/** Atomic claim predicate: only a still-pending row can be decided. */
export function wherePendingInterest(interestId: string, opts?: { investorId?: string }) {
  const parts = [eq(interests.id, interestId), eq(interests.status, "pending" as const)];
  if (opts?.investorId) {
    parts.push(eq(interests.investorId, opts.investorId));
  }
  return and(...parts);
}

export const INTEREST_NOT_PENDING = "INTEREST_NOT_PENDING";
