'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { PATIENT_SOURCE, PLAN_STATUS, formatMoney, label } from '@/lib/format';

type Patient = { id: string; firstName: string; lastName: string; phone?: string | null };

type Day = {
  noShows: { id: string; startsAt: string; reason: string | null; minutes: number; service: string; patient: Patient }[];
  lostMinutes: number;
  plans: { id: string; title: string; status: string; totalPrice: string; patient: Patient }[];
  planCounts: Record<string, number>;
  debtors: {
    id: string;
    number: string;
    due: number;
    dueDate: string | null;
    promiseNote: string | null;
    payer: string;
    patient: Patient;
  }[];
  chairs: {
    cabinetCount: number;
    booked: number;
    clinical: number;
    empty: number;
    chairs: { name: string; booked: number; clinical: number; windows: { from: string; to: string; minutes: number }[] }[];
  };
  sources: { source: string; count: number; revenue: number }[];
  withoutSource: Patient[];
  hygiene: { patient: Patient; lastVisit: string; lastHygiene: string | null }[];
  stalled: { id: string; title: string; status: string; totalPrice: string; updatedAt: string; patient: Patient }[];
};

const PLAN_ACTIONS = ['PROPOSED', 'ACCEPTED', 'COMPLETED', 'REJECTED'] as const;

function hours(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export default function QueuesPage() {
  const { branchId } = useBranch();
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [promises, setPromises] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    if (!branchId) return;
    api<Day>(`/queue/clinic-day?branchId=${branchId}`)
      .then((next) => {
        setDay(next);
        setReasons(Object.fromEntries(next.noShows.map((a) => [a.id, a.reason ?? ''])));
        setPromises(Object.fromEntries(next.debtors.map((d) => [d.id, d.promiseNote ?? ''])));
        setSources(Object.fromEntries(next.withoutSource.map((p) => [p.id, ''])));
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось открыть очереди'));
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (path: string, body: object) => {
    setError('');
    try {
      await api(path, { method: 'PATCH', body: JSON.stringify(body) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не сохранилось');
    }
  };

  const maxRevenue = Math.max(1, ...(day?.sources.map((s) => s.revenue) ?? [1]));

  return (
    <Protected>
      <PageHeader
        badge="День клиники"
        title="Очереди"
        description="Неявки, планы, долги, гигиена, пустые окна и источник пациента."
      />

      {error && <p className="mb-4 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p>}

      {day && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Потеряно на неявках" value={hours(day.lostMinutes)} tone="danger" />
          <Stat label="Планы ждут решения" value={String((day.planCounts.PROPOSED ?? 0) + (day.planCounts.DRAFT ?? 0))} tone="warning" />
          <Stat label="Должники" value={String(day.debtors.length)} tone="danger" />
          <Stat label="Пустые окна" value={hours(day.chairs.empty)} tone="accent" />
          <Stat label="Пора на гигиену" value={String(day.hygiene.length)} tone="warning" />
          <Stat label="Спящие планы" value={String(day.stalled.length)} tone="warning" />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Неявки" description="Причина, потерянные минуты и кому перезвонить" />
          <div className="space-y-2">
            {day?.noShows.map((a) => (
              <div key={a.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/patients/${a.patient.id}`} className="font-semibold hover:text-[var(--accent)]">
                      {a.patient.lastName} {a.patient.firstName}
                    </Link>
                    <p className="text-sm text-[var(--muted)]">
                      {new Date(a.startsAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      {a.service}
                      {' · '}
                      {a.minutes} мин
                    </p>
                    {a.patient.phone && <p className="text-sm text-[var(--blue)]">{a.patient.phone}</p>}
                  </div>
                  <Link href={`/visit/${a.id}`} className="text-sm font-medium text-[var(--accent)]">Приём</Link>
                </div>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={reasons[a.id] ?? ''}
                    placeholder="Причина"
                    aria-label="Причина неявки"
                    onChange={(e) => setReasons((prev) => ({ ...prev, [a.id]: e.target.value }))}
                  />
                  <Button size="sm" onClick={() => save(`/queue/clinic-day/no-show/${a.id}`, { reason: reasons[a.id] ?? '' })}>
                    Сохранить
                  </Button>
                </div>
              </div>
            ))}
            {day && !day.noShows.length && <p className="text-sm text-[var(--muted)]">За две недели неявок нет.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Принятие плана" description="Предложен, согласован, выполнен или отказ" />
          <div className="mb-4 flex flex-wrap gap-2">
            {Object.entries(day?.planCounts ?? {}).map(([status, count]) => (
              <Badge key={status} variant={status === 'REJECTED' ? 'danger' : status === 'ACCEPTED' ? 'success' : 'accent'}>
                {label(PLAN_STATUS, status)} · {count}
              </Badge>
            ))}
          </div>
          <div className="space-y-2">
            {day?.plans.filter((p) => p.status === 'DRAFT' || p.status === 'PROPOSED' || p.status === 'ACCEPTED').map((plan) => (
              <div key={plan.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/clinical/${plan.id}`} className="font-semibold hover:text-[var(--accent)]">{plan.title}</Link>
                    <p className="text-sm text-[var(--muted)]">
                      {plan.patient.lastName} {plan.patient.firstName} · {formatMoney(plan.totalPrice)}
                    </p>
                  </div>
                  <Badge variant="accent">{label(PLAN_STATUS, plan.status)}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {PLAN_ACTIONS.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={plan.status === status ? 'primary' : 'ghost'}
                      onClick={() => save(`/clinical/treatment-plans/${plan.id}/status`, { status })}
                    >
                      {label(PLAN_STATUS, status)}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Должники" description="Кто должен, срок и обещание оплаты" />
          <div className="space-y-2">
            {day?.debtors.map((d) => (
              <div key={d.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/patients/${d.patient.id}`} className="font-semibold hover:text-[var(--accent)]">
                      {d.patient.lastName} {d.patient.firstName}
                    </Link>
                    <p className="text-sm text-[var(--muted)]">
                      {d.number} · {d.payer}
                      {d.dueDate ? ` · до ${new Date(d.dueDate).toLocaleDateString('ru-RU')}` : ''}
                    </p>
                    {d.patient.phone && <p className="text-sm text-[var(--blue)]">{d.patient.phone}</p>}
                  </div>
                  <p className="ds-display text-xl text-[var(--danger)]">{formatMoney(d.due)}</p>
                </div>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={promises[d.id] ?? ''}
                    placeholder="Обещание: когда оплатит"
                    aria-label="Обещание оплаты"
                    onChange={(e) => setPromises((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  />
                  <Button size="sm" onClick={() => save(`/queue/clinic-day/promise/${d.id}`, { promiseNote: promises[d.id] ?? '' })}>
                    Сохранить
                  </Button>
                </div>
              </div>
            ))}
            {day && !day.debtors.length && <p className="text-sm text-[var(--muted)]">Открытых долгов нет.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Гигиена" description="Не были на профгигиене больше полугода" />
          <div className="space-y-2">
            {day?.hygiene.map((row) => (
              <div key={row.patient.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <Link href={`/patients/${row.patient.id}`} className="font-semibold hover:text-[var(--accent)]">
                  {row.patient.lastName} {row.patient.firstName}
                </Link>
                <p className="text-sm text-[var(--muted)]">
                  {row.lastHygiene
                    ? `Последняя гигиена ${new Date(row.lastHygiene).toLocaleDateString('ru-RU')}`
                    : 'Гигиены ещё не было'}
                  {row.patient.phone ? ` · ${row.patient.phone}` : ''}
                </p>
              </div>
            ))}
            {day && !day.hygiene.length && <p className="text-sm text-[var(--muted)]">Все недавние пациенты были на гигиене.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Спящие планы" description="Предложены или согласованы и не двигались 21 день" />
          <div className="space-y-2">
            {day?.stalled.map((plan) => (
              <div key={plan.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <Link href={`/clinical/${plan.id}`} className="font-semibold hover:text-[var(--accent)]">{plan.title}</Link>
                <p className="text-sm text-[var(--muted)]">
                  {plan.patient.lastName} {plan.patient.firstName} · {formatMoney(plan.totalPrice)} · с {new Date(plan.updatedAt).toLocaleDateString('ru-RU')}
                </p>
              </div>
            ))}
            {day && !day.stalled.length && <p className="text-sm text-[var(--muted)]">Зависших планов нет.</p>}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Загрузка кресел" description="Клинические часы и пустые окна, 09:00–19:00" />
            <div className="mb-4 grid grid-cols-3 gap-3 text-center">
              <Mini label="Занято" value={hours(day?.chairs.booked ?? 0)} />
              <Mini label="У кресла" value={hours(day?.chairs.clinical ?? 0)} />
              <Mini label="Пусто" value={hours(day?.chairs.empty ?? 0)} />
            </div>
            <div className="space-y-3">
              {day?.chairs.chairs.map((chair) => (
                <div key={chair.name}>
                  <p className="text-sm font-semibold">{chair.name}</p>
                  {chair.windows.length ? (
                    <p className="text-sm text-[var(--muted)]">
                      Окна: {chair.windows.map((w) => `${w.from}–${w.to}`).join(', ')}
                    </p>
                  ) : (
                    <p className="text-sm text-[var(--success)]">Свободных окон нет</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Источник пациента" description="Первый канал и выручка с него" />
            <div className="space-y-3">
              {day?.sources.filter((s) => s.source).map((s) => (
                <div key={s.source}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{label(PATIENT_SOURCE, s.source)}</span>
                    <span className="text-[var(--muted)]">{s.count} · {formatMoney(s.revenue)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--accent-soft)]">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(8, (s.revenue / maxRevenue) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {!!day?.withoutSource.length && (
              <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-4">
                <p className="text-sm font-semibold">Без источника</p>
                {day.withoutSource.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-[140px] text-sm">{p.lastName} {p.firstName}</span>
                    <Select
                      aria-label="Источник"
                      value={sources[p.id] ?? ''}
                      onChange={(e) => setSources((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    >
                      <option value="">Выберите</option>
                      {Object.entries(PATIENT_SOURCE).map(([key, name]) => (
                        <option key={key} value={key}>{name}</option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      disabled={!sources[p.id]}
                      onClick={() => save(`/queue/clinic-day/source/${p.id}`, { source: sources[p.id] })}
                    >
                      Сохранить
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </Protected>
  );
}

function Stat({ label: name, value, tone }: { label: string; value: string; tone: 'danger' | 'warning' | 'accent' }) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--accent)';
  return (
    <div className="ds-card p-5">
      <p className="ds-display text-2xl" style={{ color }}>{value}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{name}</p>
    </div>
  );
}

function Mini({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-muted)] px-2 py-3">
      <p className="text-sm font-semibold text-[var(--text)]">{value}</p>
      <p className="text-xs text-[var(--muted)]">{name}</p>
    </div>
  );
}
