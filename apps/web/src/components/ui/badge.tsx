import clsx from 'clsx';

const variants = {
  default: 'bg-[var(--surface-muted)] text-[var(--text-secondary)]',
  success: 'bg-[var(--success-soft)] text-[var(--success)]',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent-hover)]',
};

export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
      )}
    >
      {children}
    </span>
  );
}
