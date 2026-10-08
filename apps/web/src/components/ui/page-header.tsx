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
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-6">
      <div>
        {badge && <p className="ds-kicker mb-2">{badge}</p>}
        <h1 className="ds-display text-[1.75rem] leading-none text-[var(--text)] md:text-[2.15rem]">{title}</h1>
        {description && (
          <div className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{description}</div>
        )}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
