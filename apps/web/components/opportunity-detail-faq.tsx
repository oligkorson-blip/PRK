export function OpportunityDetailFaq() {
  return (
    <section id="faq" className="detail-block">
      <p className="detail-section-kicker">FAQ</p>
      <h2 className="h3">Common questions</h2>
      <div className="faq-list">
        <details className="faq-item">
          <summary className="faq-q">Is the monthly income guaranteed?</summary>
          <div className="faq-a">
            <p>No. Monthly figures are illustrative targets based on opportunity terms.</p>
          </div>
        </details>
        <details className="faq-item">
          <summary className="faq-q">Do I need an account to invest?</summary>
          <div className="faq-a">
            <p>
              Yes. Apply for access, complete eligibility and identity checks, then choose
              an investment amount when approved.
            </p>
          </div>
        </details>
        <details className="faq-item">
          <summary className="faq-q">Is choosing an investment binding?</summary>
          <div className="faq-a">
            <p>
              No. Showing interest isn&apos;t a commitment. We&apos;ll confirm your investment
              separately if approved.
            </p>
          </div>
        </details>
        <details className="faq-item">
          <summary className="faq-q">Can I exit early?</summary>
          <div className="faq-a">
            <p>
              Early exit is not guaranteed. Any transfer usually depends on finding a buyer
              and may involve a discount. See the opportunity documents for planned exit
              terms.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
