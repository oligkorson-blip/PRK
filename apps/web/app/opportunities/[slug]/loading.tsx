export default function OpportunityLoading() {
  return (
    <main className="page-loading" aria-busy="true" aria-live="polite">
      <section className="page-hero">
        <div className="container">
          <div className="skeleton skeleton-kicker" />
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-lead" />
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="skeleton skeleton-card skeleton-card-tall" style={{ maxWidth: 960, height: 280 }} />
          <div className="skeleton-grid stack-7">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </div>
          <span className="sr-only">Loading opportunity…</span>
        </div>
      </section>
    </main>
  );
}
