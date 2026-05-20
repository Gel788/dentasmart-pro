import clsx from 'clsx';

export function Card({
  children,
  className,
  hover,
  padding = true,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: boolean;
}) {
  return (
    <div
      className={clsx(
        hover ? 'ds-card-hover' : 'ds-card',
        padding && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-[var(--muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
