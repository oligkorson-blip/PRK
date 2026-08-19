export function AdminSection({
  title,
  children
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-section">
      {title ? <h2 className="admin-section-title">{title}</h2> : null}
      {children}
    </section>
  );
}
