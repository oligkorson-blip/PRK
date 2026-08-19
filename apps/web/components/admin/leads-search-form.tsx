import { LEAD_STATUS_OPTIONS } from "@/lib/leads/labels";

export function LeadsSearchForm({
  q,
  status,
  action = "/admin/leads"
}: {
  q: string;
  status: string;
  /** Where the GET form submits; defaults to the global leads page. */
  action?: string;
}) {
  return (
    <form method="get" action={action} className="staff-action-row">
      <label className="form-field grow">
        <span>Search leads</span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Name or email"
        />
      </label>
      <label className="form-field">
        <span>Stage</span>
        <select name="status" defaultValue={status}>
          <option value="">All stages</option>
          {LEAD_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-ghost btn-sm">
        Search
      </button>
    </form>
  );
}
