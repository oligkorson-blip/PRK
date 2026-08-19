function nonempty(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

export function OpportunityDetailOperator({
  operatorLabel,
  operatorStory
}: {
  operatorLabel: string;
  operatorStory?: string | null;
}) {
  const story = nonempty(operatorStory);

  return (
    <section id="operator" className="detail-block">
      <p className="detail-section-kicker">Who runs it</p>
      <h2 className="h3">Operator and Parkwise</h2>
      <div className="detail-role-grid">
        <div className="detail-role-card">
          <h3 className="h4">Parking operator</h3>
          {story ? (
            <p>{story}</p>
          ) : (
            <p>
              Day-to-day operations sit with <strong>{operatorLabel}</strong>, including site
              management, pricing within the agreed model, and local operations.
            </p>
          )}
        </div>
        <div className="detail-role-card">
          <h3 className="h4">Parkwise</h3>
          <p>
            Parkwise presents the opportunity, runs the investor process, and keeps your
            dashboard up to date after confirmation. Parkwise does not operate the parking site
            day to day.
          </p>
        </div>
      </div>
    </section>
  );
}
