"use client";

import { useEffect, useState, type ReactNode } from "react";
import { formatEur, formatYieldPct } from "@/lib/format";
import {
  illustratorDownsideRows,
  optionAnnualIncome,
  optionDerivedLabels,
  optionMonthlyIncome,
  type InvestmentOption
} from "@/lib/assets/investment-options";
import { ILLUSTRATION_ASSUMPTIONS, ILLUSTRATION_DISCLAIMER } from "@/lib/copy/consumer";

export function OpportunityDetailReturns({
  children,
  options,
  selected,
  onSelectOption,
  paymentFrequencyDisplay,
  termDisplay
}: {
  children?: ReactNode;
  options: InvestmentOption[];
  selected: InvestmentOption | undefined;
  onSelectOption: (optionId: InvestmentOption["id"]) => void;
  paymentFrequencyDisplay: string;
  termDisplay: string;
}) {
  const [illustrativeAmountRaw, setIllustrativeAmountRaw] = useState(() =>
    selected ? String(selected.minTicketEur) : ""
  );

  useEffect(() => {
    if (selected) setIllustrativeAmountRaw(String(selected.minTicketEur));
  }, [selected?.id, selected?.minTicketEur]);

  const parsedAmount = Number(illustrativeAmountRaw);
  const amountIsValid =
    Boolean(selected) &&
    illustrativeAmountRaw.trim() !== "" &&
    Number.isFinite(parsedAmount) &&
    parsedAmount >= (selected?.minTicketEur ?? 0);
  const illustrativeAmount = amountIsValid ? parsedAmount : 0;

  const illusAnnual = selected
    ? optionAnnualIncome(illustrativeAmount, selected.yieldPct)
    : 0;
  const illusMonthly = optionMonthlyIncome(illusAnnual);
  const derivedLabels = optionDerivedLabels(options);

  return (
    <section id="returns" className="detail-block">
      <p className="detail-section-kicker">Numbers</p>
      <h2 className="h3">Returns and options</h2>
      <p className="detail-section-lead">
        Drivers pay to park. Where the opportunity includes them, services such as EV charging
        may add income. Pick an option to see illustrative figures — targets, not guarantees.
      </p>
      {children}

      <h3 className="h4 stack-8">Choose an option</h3>
      <div className="option-picker" role="radiogroup" aria-label="Investment options">
        {options.map((opt, index) => {
          const selectedOpt = opt.id === selected?.id;
          return (
            <div
              key={opt.id}
              role="radio"
              aria-checked={selectedOpt}
              tabIndex={selectedOpt || (!selected && index === 0) ? 0 : -1}
              className={`option-card${selectedOpt ? " is-selected" : ""}`}
              onClick={() => onSelectOption(opt.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectOption(opt.id);
                  return;
                }
                const direction =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : event.key === "Home"
                        ? -options.length
                        : event.key === "End"
                          ? options.length
                          : 0;
                if (!direction) return;
                event.preventDefault();
                const next =
                  direction === -options.length
                    ? 0
                    : direction === options.length
                      ? options.length - 1
                      : (index + direction + options.length) % options.length;
                onSelectOption(options[next]!.id);
                event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(".option-card")[next]?.focus();
              }}
            >
              <div className="option-card-head">
                <span>{opt.id === "green" ? "EV option" : opt.label}</span>
                {(derivedLabels.get(opt.id) ?? []).map((label) => (
                  <span key={label} className="badge badge-soft">
                    {label}
                  </span>
                ))}
              </div>
              <p className="option-card-from">From {formatEur(opt.minTicketEur)}</p>
              <p className="option-card-monthly">
                <b>{formatEur(opt.monthlyIncomeEur)}</b>
                <span> /month illustrative</span>
              </p>
              <dl className="option-card-metrics option-card-metrics-compact">
                <div>
                  <dt>Target return</dt>
                  <dd>{formatYieldPct(opt.yieldPct)}</dd>
                </div>
                <div>
                  <dt>Annual at minimum</dt>
                  <dd>{formatEur(opt.annualIncomeEur)}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
      <p className="field-hint">
        Payments: {paymentFrequencyDisplay}. Term: {termDisplay}. Monthly income at the
        minimum is illustrative — a target, not guaranteed.
      </p>

      {selected ? (
        <div className="income-illustrator">
          <h3 className="h4">Try a different amount</h3>
          <label htmlFor="illus-amount">Investment amount (EUR)</label>
          <div className="income-illustrator-input">
            <span aria-hidden="true">€</span>
            <input
              id="illus-amount"
              type="number"
              min={selected.minTicketEur}
              step={500}
              value={illustrativeAmountRaw}
              onChange={(e) => setIllustrativeAmountRaw(e.target.value)}
              aria-invalid={!amountIsValid}
              aria-describedby={
                amountIsValid
                  ? "illus-assumptions"
                  : "illus-amount-error illus-assumptions"
              }
            />
          </div>
          <p className="field-hint">
            Selected: {selected.id === "green" ? "EV option" : selected.label}. Minimum{" "}
            {formatEur(selected.minTicketEur)}.
          </p>
          {!amountIsValid ? (
            <p id="illus-amount-error" className="field-error" role="alert">
              Enter at least {formatEur(selected.minTicketEur)} to see an illustration.
            </p>
          ) : null}
          {amountIsValid ? (
          <div className="income-illustrator-results" aria-live="polite">
            <div>
              <span className="metric-label">Illustrative monthly</span>
              <b>{formatEur(illusMonthly)}</b>
            </div>
            <div>
              <span className="metric-label">Illustrative annual</span>
              <b>{formatEur(illusAnnual)}</b>
            </div>
            {illustratorDownsideRows(illusAnnual).map((row) => (
              <div key={row.id}>
                <span className="metric-label">{row.label}</span>
                <b>{formatEur(row.monthlyEur)} / month</b>
              </div>
            ))}
          </div>
          ) : null}
          <p id="illus-assumptions" className="field-hint">
            {ILLUSTRATION_DISCLAIMER} {ILLUSTRATION_ASSUMPTIONS}
          </p>
        </div>
      ) : null}
    </section>
  );
}
