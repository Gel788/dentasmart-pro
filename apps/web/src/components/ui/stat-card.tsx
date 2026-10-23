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
    <div className="ds-card ds-stat flex items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-[var(--muted)]">{label}</p>
        <p className="ds-display mt-1.5 text-[1.85rem] leading-none text-[var(--text)]">{value}</p>
        {hint && <p className="mt-2 text-xs text-[var(--muted)]">{hint}</p>}
      </div>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" className={clsx('mt-0.5 shrink-0', tones[tone].split(' ').find((cls) => cls.startsWith('text-')))} />
    </div>
  );
}
