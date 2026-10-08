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
    <div className="ds-card flex items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
        <p className="ds-display mt-2 text-[1.7rem] leading-none text-[var(--text)]">{value}</p>
        {hint && <p className="mt-2 text-xs text-[var(--muted)]">{hint}</p>}
      </div>
      <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
        <Icon size={16} strokeWidth={1.75} />
      </div>
    </div>
  );
}
