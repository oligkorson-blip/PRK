export function AdminPageHeader({
  title,
  subtitle,
  actions
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div>
        <h1 className="admin-page-title">{title}</h1>
        {subtitle ? <div className="admin-page-subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </header>
  );
}
