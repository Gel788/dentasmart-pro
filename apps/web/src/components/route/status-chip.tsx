import type { Axis } from '@dentasmart/shared';

const TONE: Record<Axis['state'], string> = {
  ready: 'bg-[var(--ok-soft)] text-[var(--ok)]',
  waiting: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  blocked: 'bg-[var(--danger-soft)] text-[var(--danger)] font-semibold',
  none: 'bg-[var(--surface-2)] text-[var(--muted)]',
};

export function StatusChip({ label, axis }: { label: string; axis: Axis }) {
  return (
    <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[13px] leading-tight ${TONE[axis.state]}`}>
      {label} · {axis.reason}
    </span>
  );
}
