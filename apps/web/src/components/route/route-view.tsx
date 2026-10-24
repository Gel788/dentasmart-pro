'use client';

import { useEffect, useState } from 'react';
import type { Axis, RoutePayload, RouteStage } from '@dentasmart/shared';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { StageCard } from './stage-card';

const AXES: { key: keyof RouteStage['readiness']; label: string }[] = [
  { key: 'visit', label: 'Визит' },
  { key: 'materials', label: 'Материалы' },
  { key: 'lab', label: 'Лаборатория' },
  { key: 'payment', label: 'Оплата' },
];

type Step = { stage: RouteStage; label: string; axis: Axis };

/** A blocker on any stage still ahead comes first; otherwise whatever the current stage is waiting for. */
function nextStep(stages: RouteStage[], current: RouteStage | undefined): Step | null {
  const open = stages
    .filter((stage) => stage.status !== 'done')
    .flatMap((stage) => AXES.map(({ key, label }) => ({ stage, label, axis: stage.readiness[key] })));
  return (
    open.find((step) => step.axis.state === 'blocked') ??
    open.find((step) => step.stage === current && step.axis.state === 'waiting') ??
    null
  );
}

export function RouteView({ patientId, onOpenPlan }: { patientId: string; onOpenPlan: () => void }) {
  const [data, setData] = useState<RoutePayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api<RoutePayload>(`/route/patients/${patientId}`).then(setData).catch((err: Error) => setError(err.message));
  }, [patientId]);

  if (error) return <p className="text-[var(--danger)]">Маршрут не загрузился: {error}. Обновите страницу.</p>;
  if (!data) return <p className="text-[var(--muted)]">Загружаем маршрут…</p>;
  if (!data.route || !data.route.stages.length) {
    return (
      <section aria-label="Маршрут лечения" className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="m-0 text-lg font-bold">Маршрута пока нет</h2>
        <p className="m-0 max-w-[60ch] text-[var(--muted)]">
          Он появится, когда пациент подпишет план: визиты встанут в расписание, материалы уйдут в резерв, лаборатория получит заказ.
        </p>
        <button type="button" className="sd-btn" onClick={onOpenPlan}>Открыть план</button>
      </section>
    );
  }

  const { route } = data;
  const current = route.stages[route.currentIndex];
  const step = nextStep(route.stages, current);
  const left = route.price - route.paid;
  const paidShare = route.price ? Math.round((route.paid / route.price) * 100) : 0;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section aria-label="Маршрут лечения" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
        <p className="m-0 text-[var(--muted)]">
          {data.title}
          {data.signedAt ? ` · подписан ${new Date(data.signedAt).toLocaleDateString('ru-RU')}` : ''} · этапов: {route.stages.length} · {formatMoney(route.price)}
        </p>
        {route.stages.map((stage, index) => <StageCard key={stage.id} stage={stage} index={index} />)}
      </section>
      <aside aria-label="Сводка маршрута" className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
        <section className="flex flex-col gap-2 rounded-2xl bg-[var(--text)] p-5 text-[var(--bg)]">
          <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Следующий шаг</span>
          {step ? (
            <>
              <p className="m-0 text-lg font-semibold leading-snug">{step.stage.title}: {step.label.toLowerCase()}</p>
              <p className="m-0 text-sm opacity-80">{step.axis.reason}</p>
            </>
          ) : current ? (
            <p className="m-0 text-lg font-semibold leading-snug">{current.title}: всё готово к визиту</p>
          ) : (
            <p className="m-0 text-lg font-semibold leading-snug">Все этапы проведены. Пора на контрольный осмотр.</p>
          )}
        </section>
        <section className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="m-0 text-base font-bold">Деньги по плану</h2>
          <div className="sd-display text-2xl font-semibold tabular-nums">{formatMoney(left)}</div>
          <div className="text-sm text-[var(--muted)]">осталось из {formatMoney(route.price)}</div>
          <div className="h-2 overflow-hidden rounded bg-[var(--surface-2)]" role="img" aria-label={`Оплачено ${paidShare} процентов`}>
            <div className="h-full bg-[var(--accent)]" style={{ width: `${paidShare}%` }} />
          </div>
        </section>
      </aside>
    </div>
  );
}
