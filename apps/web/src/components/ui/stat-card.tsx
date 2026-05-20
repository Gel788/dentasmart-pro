import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

const tones = {
  teal: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  blue: 'bg-[var(--blue-soft)] text-[var(--blue)]',
  amber: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  slate: 'bg-[var(--surface-muted)] text-[var(--muted)]',
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'teal',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
}) {
  return (
    <div className="ds-card flex gap-4 p-5">
      <div className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
        <Icon size={22} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)]">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p>}
      </div>
    </div>
  );
}
