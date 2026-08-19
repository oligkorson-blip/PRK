export default function AdminLoading() {
  return (
    <div className="admin-page page-loading" aria-busy="true" aria-live="polite">
      <div className="skeleton skeleton-kicker" />
      <div className="skeleton skeleton-title" />
      <div className="dash-kpi-grid stack-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      <div className="admin-hub-grid stack-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      <span className="sr-only">Loading this admin page…</span>
    </div>
  );
}
