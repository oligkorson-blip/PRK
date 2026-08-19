export default function OpportunitiesLoading() {
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
          <div className="skeleton-grid assets-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-card skeleton-card-tall" />
            ))}
          </div>
          <span className="sr-only">Loading opportunities…</span>
        </div>
      </section>
    </main>
  );
}
