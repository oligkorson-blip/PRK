import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentHistoryPanel } from "@/components/payment-history-panel";
import type { DistributionRow } from "@/lib/portfolio/distributions";

function row(id: string, status: string): DistributionRow {
  return { id, amountEur: 100, type: "income", status, periodLabel: null, paidAt: null };
}

describe("PaymentHistoryPanel badge", () => {
  it("counts only paid rows as payments, not the whole ledger", () => {
    const html = renderToStaticMarkup(
      createElement(PaymentHistoryPanel, {
        rows: [row("d1", "paid"), row("d2", "paid"), row("d3", "scheduled"), row("d4", "cancelled")]
      })
    );

    expect(html).toContain("2 payments");
    expect(html).not.toContain("4 payments");
  });

  it("shows no paid payments when the ledger has only non-paid rows", () => {
    const html = renderToStaticMarkup(
      createElement(PaymentHistoryPanel, { rows: [row("d1", "scheduled"), row("d2", "failed")] })
    );

    expect(html).toContain("No payments yet");
    expect(html).not.toContain("0 payments");
  });

  it("uses the singular for exactly one payment", () => {
    const html = renderToStaticMarkup(
      createElement(PaymentHistoryPanel, { rows: [row("d1", "paid"), row("d2", "scheduled")] })
    );

    expect(html).toContain("1 payment");
    expect(html).not.toContain("1 payments");
  });

  it("shows 'No payments yet' when there are no rows at all", () => {
    const html = renderToStaticMarkup(createElement(PaymentHistoryPanel, { rows: [] }));

    expect(html).toContain("No payments yet");
  });
});
