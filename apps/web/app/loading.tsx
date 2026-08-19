export default function Loading() {
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
          <div className="skeleton-grid">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </div>
          <span className="sr-only">Loading page…</span>
        </div>
      </section>
    </main>
  );
}
