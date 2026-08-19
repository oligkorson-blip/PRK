import Link from "next/link";

export function OpportunityDetailRisks() {
  return (
    <section id="risks" className="detail-block">
      <p className="detail-section-kicker">Risks</p>
      <h2 className="h3">Risks to consider</h2>
      <ul className="risk-list">
        <li>Occupancy, pricing, and costs can reduce available income.</li>
        <li>You may receive less than the target return, delayed payments, or nothing.</li>
        <li>You may lose some or all of your capital.</li>
        <li>These investments are typically hard to sell before the end of the term.</li>
        <li>Fees and operating costs reduce what you may receive.</li>
        <li>Operator or local market changes can affect performance.</li>
        <li>Illustrative figures do not predict future results.</li>
      </ul>
      <p>
        <Link className="link-arrow" href="/legal/risk">
          Review the full risk disclosure →
        </Link>
      </p>
    </section>
  );
}
