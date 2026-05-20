export function PageHeader({
  title,
  description,
  action,
  badge,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  badge?: string;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {badge && (
          <span className="mb-2 inline-block rounded-full bg-[var(--accent-soft)] px-3 py-0.5 text-xs font-medium text-[var(--accent-hover)]">
            {badge}
          </span>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] md:text-3xl">{title}</h1>
        {description && (
          <div className="mt-1.5 max-w-2xl text-sm text-[var(--muted)]">{description}</div>
        )}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
