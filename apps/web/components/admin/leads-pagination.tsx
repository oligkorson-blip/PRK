import Link from "next/link";

export function LeadsPagination({
  basePath,
  params,
  pageParam,
  page,
  total,
  pageSize,
  itemLabel = "leads"
}: {
  basePath: string;
  /** Current search params to preserve (q/status/other section's page). */
  params: Record<string, string>;
  pageParam: string;
  page: number;
  total: number;
  pageSize: number;
  /** Noun for the count line (e.g. "leads", "investors"). */
  itemLabel?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  function href(target: number): string {
    const search = new URLSearchParams(params);
    if (target <= 1) {
      search.delete(pageParam);
    } else {
      search.set(pageParam, String(target));
    }
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="staff-action-row stack-3">
      {page > 1 ? (
        <Link className="btn btn-ghost btn-sm" href={href(page - 1)}>
          Previous
        </Link>
      ) : null}
      <span>
        Page {page} of {pages} · {total} {itemLabel}
      </span>
      {page < pages ? (
        <Link className="btn btn-ghost btn-sm" href={href(page + 1)}>
          Next
        </Link>
      ) : null}
    </div>
  );
}
