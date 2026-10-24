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
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-3" data-section={badge || undefined}>
      <div>
        <h1 className="text-[clamp(22px,1.2vw+14px,28px)] font-extrabold leading-tight tracking-[-0.02em] text-[var(--text)]">{title}</h1>
        {description && (
          <div className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{description}</div>
        )}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
