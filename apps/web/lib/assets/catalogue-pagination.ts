/** Pure pagination helpers for the opportunities catalogue. */

export const PAGE_SIZE = 12;

export function catalogueTotalPages(count: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

export function cataloguePageSlice<T>(items: T[], page: number, pageSize = PAGE_SIZE): T[] {
  const totalPages = catalogueTotalPages(items.length, pageSize);
  const requested = Number.isFinite(page) ? page : 1;
  const safePage = Math.min(Math.max(1, requested), totalPages);
  return items.slice((safePage - 1) * pageSize, safePage * pageSize);
}
