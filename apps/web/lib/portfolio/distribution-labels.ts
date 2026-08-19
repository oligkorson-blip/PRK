/**
 * Pure distribution label/format helpers — no db imports, safe for client
 * components. Re-exported by lib/portfolio/distributions.ts for server callers.
 */
export function formatDistributionType(type: string): string {
  if (type === "income") return "Income";
  if (type === "return_of_capital") return "Return of capital";
  return "Other";
}

export function formatDistributionStatus(status: string): string {
  if (status === "paid") return "Paid";
  if (status === "scheduled") return "Scheduled";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return status;
}
