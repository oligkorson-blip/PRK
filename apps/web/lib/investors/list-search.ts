import type { InvestorRow } from "./queries";

/**
 * Search + offset pagination for the staff investors list. Dependency-free on
 * purpose: the scoped rows come from listInvestorsForStaff (role scoping stays
 * in SQL there) and filtering/slicing happens server-side per request.
 */

export const INVESTORS_PAGE_SIZE = 25;

export function searchInvestorRows(rows: InvestorRow[], search: string): InvestorRow[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (row) =>
      row.email.toLowerCase().includes(needle) ||
      row.fullName.toLowerCase().includes(needle)
  );
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number
): { rows: T[]; total: number; page: number; pageCount: number } {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (clamped - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total, page: clamped, pageCount };
}
