import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)]/40 px-6 py-14 text-center">
      <Icon className="mb-3 text-[var(--muted)] opacity-40" size={36} strokeWidth={1.5} />
      <p className="font-medium text-[var(--text)]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
