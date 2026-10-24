import type { RouteStage } from '@dentasmart/shared';
import { StatusChip } from './status-chip';

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });

export function StageCard({ stage, index }: { stage: RouteStage; index: number }) {
  const current = stage.status === 'current';
  const done = stage.status === 'done';
  return (
    <article
      aria-current={current ? 'step' : undefined}
      className={`flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-5 ${current ? 'border-2 border-[var(--accent)]' : 'border border-[var(--border)]'}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
            done ? 'bg-[var(--accent)] text-white' : current ? 'border-2 border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-2 border-[var(--border-strong)] text-[var(--muted)]'
          }`}
        >
          {index + 1}
        </span>
        <h3 className="m-0 text-[17px] font-bold">{stage.title}</h3>
        {stage.teeth.length > 0 && (
          <span className="sd-mono rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[13px] text-[var(--text-secondary)]">{stage.teeth.join(' · ')}</span>
        )}
        <span
          className={`ml-auto rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
            done ? 'bg-[var(--ok-soft)] text-[var(--ok)]' : current ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'bg-[var(--surface-2)] text-[var(--text-secondary)]'
          }`}
        >
          {stage.appointment ? `${done ? 'Проведён' : current ? 'Следующий' : 'Запланирован'} · ${when(stage.appointment.startsAt)}` : 'Визит не назначен'}
        </span>
      </div>
      {stage.labWork && <p className="m-0 text-sm text-[var(--muted)]">Лаборатория: {stage.labWork}</p>}
      <div className="flex flex-wrap gap-2">
        <StatusChip label="Визит" axis={stage.readiness.visit} />
        <StatusChip label="Материалы" axis={stage.readiness.materials} />
        <StatusChip label="Лаборатория" axis={stage.readiness.lab} />
        <StatusChip label="Оплата" axis={stage.readiness.payment} />
      </div>
    </article>
  );
}
