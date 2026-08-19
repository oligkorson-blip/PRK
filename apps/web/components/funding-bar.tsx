import type { FundingSnapshot } from "@/lib/assets/funding";
import { formatEur } from "@/lib/format";

export function FundingBar({ funding }: { funding: FundingSnapshot }) {
  const soft = funding.pct == null;
  // Soft (no capacity): show an empty track — never a full bar that looks "funded".
  const width = soft ? 0 : funding.pct;

  return (
    <div className="asset-card-funding">
      <div className="funding-label-row">
        <span>Funding status</span>
        <span>{funding.label}</span>
      </div>
      <div
        className={`funding-track${soft ? " is-open-soft" : ""}`}
        role={soft ? undefined : "meter"}
        aria-label={soft ? undefined : funding.label}
        aria-valuemin={soft ? undefined : 0}
        aria-valuemax={soft ? undefined : 100}
        aria-valuenow={soft ? undefined : funding.pct ?? undefined}
        aria-valuetext={soft ? undefined : funding.label}
      >
        <span
          className={`funding-fill${soft ? " is-soft" : ""}`}
          style={{ width: `${width}%` }}
        />
      </div>
      {funding.capacityEur != null ? (
        <p className="field-hint funding-meta">
          {formatEur(funding.committedEur)} of {formatEur(funding.capacityEur)} indicative target
        </p>
      ) : null}
    </div>
  );
}
