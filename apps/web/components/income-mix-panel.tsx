import {
  INCOME_STREAM_LABELS,
  type IncomeMixEntry,
  type IncomeStreamId
} from "@/lib/assets/income-streams";

const STREAM_COLORS: Record<IncomeStreamId, string> = {
  vehicle_parking: "var(--green-700)",
  ev_charging: "var(--lime)",
  bicycle_storage: "var(--mint-300)",
  parcel_lockers: "var(--orange)",
  car_sharing: "var(--green-500)",
  micromobility_charging: "var(--lime-soft)",
  last_mile_logistics: "var(--green-800)",
  vehicle_cleaning: "var(--mint-200)",
  fleet_parking: "var(--green-900)"
};

export function IncomeMixPanel({ mix }: { mix: IncomeMixEntry[] }) {
  if (!mix.length) return null;

  if (mix.length === 1) {
    const only = mix[0];
    return (
      <div className="income-mix-panel">
        <h3 className="income-mix-panel-title">Income mix</h3>
        <p className="income-mix-simple">
          Current model: <strong>100% {INCOME_STREAM_LABELS[only.id].toLowerCase()}</strong>
          {only.id === "vehicle_parking" ? " (parking revenue)" : ""}.
        </p>
        <p className="field-hint income-mix-disclaimer">
          Example share of expected income — not a guarantee.
        </p>
      </div>
    );
  }

  const ariaLabel = mix
    .map((entry) => `${INCOME_STREAM_LABELS[entry.id]} ${entry.pct}%`)
    .join(", ");

  return (
    <div className="income-mix-panel">
      <h3 className="income-mix-panel-title">Income mix</h3>
      <div className="income-mix-bar" role="img" aria-label={ariaLabel}>
        {mix.map((entry) => (
          <span
            key={entry.id}
            className="income-mix-segment"
            style={{ flexGrow: entry.pct, background: STREAM_COLORS[entry.id] }}
            title={`${INCOME_STREAM_LABELS[entry.id]} ${entry.pct}%`}
          />
        ))}
      </div>
      <ul className="income-mix-legend">
        {mix.map((entry) => (
          <li key={entry.id}>
            <span
              className="income-mix-swatch"
              style={{ background: STREAM_COLORS[entry.id] }}
              aria-hidden="true"
            />
            <span>{INCOME_STREAM_LABELS[entry.id]}</span>
            <span className="income-mix-pct">{entry.pct}%</span>
          </li>
        ))}
      </ul>
      <p className="field-hint income-mix-disclaimer">
        Example share of expected income — not a guarantee.
      </p>
    </div>
  );
}
