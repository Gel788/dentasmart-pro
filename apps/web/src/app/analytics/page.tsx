'use client';

import { useEffect, useState } from 'react';
import { Calendar, Users, Wallet } from 'lucide-react';
import { Protected } from '@/components/protected';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatMoney, label, PATIENT_SOURCE } from '@/lib/format';

export default function AnalyticsPage() {
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const [insights, setInsights] = useState<unknown[]>([]);
  const [owner, setOwner] = useState<{
    receivable: number;
    materialCost: number;
    labOverdue: number;
    hygieneDue: number;
    doctors: { name: string; amount: number }[];
    branches: { name: string; amount: number }[];
  } | null>(null);
  const [practice, setPractice] = useState<{
    visits: number;
    completed: number;
    noShow: number;
    completedRate: number;
    noShowRate: number;
    production: number;
    collections: number;
    collectionRate: number;
    aged: { d0: number; d30: number; d60: number; d90: number };
    treatments: { name: string; count: number }[];
    sources: { source: string; count: number }[];
  } | null>(null);

  useEffect(() => {
    api<Record<string, unknown>>('/analytics/dashboard').then(setDash);
    api<unknown[]>('/analytics/ai-insights').then(setInsights);
    api<NonNullable<typeof owner>>('/analytics/owner').then(setOwner);
    api<NonNullable<typeof practice>>('/analytics/practice').then(setPractice);
  }, []);

  const funnel = dash?.funnel as { leads: number; scheduled: number; completed: number } | undefined;

  return (
    <Protected>
      <PageHeader
        badge="Аналитика"
        title="Показатели клиники"
        description="Внутренняя статистика и AI-рекомендации"
        action={
          <>
            <Button onClick={async () => {
              await api('/analytics/predictions/generate', { method: 'POST' });
              api<unknown[]>('/analytics/ai-insights').then(setInsights);
            }}>Прогноз</Button>
            <Button variant="ghost" onClick={async () => {
              await api('/analytics/voice-note', { method: 'POST', body: JSON.stringify({ text: 'Голосовая заметка: пациент жалуется на чувствительность' }) });
              api<unknown[]>('/analytics/ai-insights').then(setInsights);
            }}>Голос (демо)</Button>
          </>
        }
      />

      {dash && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Пациенты" value={String(dash.patientsTotal)} icon={Users} />
            <StatCard label="Записи в месяце" value={String(dash.appointmentsThisMonth)} icon={Calendar} tone="blue" />
            <StatCard label="Выручка" value={formatMoney(Number(dash.revenueThisMonth))} icon={Wallet} />
          </div>

          {funnel && (
            <Card className="mt-6">
              <CardHeader title="Воронка" description="Конверсия от базы до завершённого приёма" />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">База</p>
                  <p className="ds-display mt-1.5 text-2xl leading-none text-[var(--text)]">{funnel.leads}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Записано</p>
                  <p className="ds-display mt-1.5 text-2xl leading-none text-[var(--text)]">{funnel.scheduled}</p>
                </div>
                <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-hover)]">Завершено</p>
                  <p className="ds-display mt-1.5 text-2xl leading-none text-[var(--accent-hover)]">{funnel.completed}</p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {owner && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Сводка владельца" description="Долг, материалы, лаборатория и гигиена" />
            <ul className="divide-y divide-[var(--border)] text-sm">
              <li className="flex items-baseline justify-between gap-3 pb-2.5">
                <span className="text-[var(--text-secondary)]">Дебиторка</span>
                <span className="font-semibold tabular-nums text-[var(--text)]">{formatMoney(owner.receivable)}</span>
              </li>
              <li className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-[var(--text-secondary)]">Себестоимость материалов за месяц</span>
                <span className="font-semibold tabular-nums text-[var(--text)]">{formatMoney(owner.materialCost)}</span>
              </li>
              <li className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-[var(--text-secondary)]">Просроченные наряды</span>
                <span className="font-semibold tabular-nums text-[var(--text)]">{owner.labOverdue}</span>
              </li>
              <li className="flex items-baseline justify-between gap-3 pt-2.5">
                <span className="text-[var(--text-secondary)]">Пора на гигиену</span>
                <span className="font-semibold tabular-nums text-[var(--text)]">{owner.hygieneDue}</span>
              </li>
            </ul>
          </Card>
          <Card>
            <CardHeader title="Филиалы и врачи" description="Оплаты этого месяца" />
            <ul className="divide-y divide-[var(--border)] text-sm">
              {owner.branches.map((branch) => (
                <li key={branch.name} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="font-medium text-[var(--text)]">{branch.name}</span>
                  <span className="font-semibold tabular-nums text-[var(--text)]">{formatMoney(branch.amount)}</span>
                </li>
              ))}
              {owner.doctors.map((doctor) => (
                <li key={doctor.name} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="text-[var(--text-secondary)]">{doctor.name}</span>
                  <span className="tabular-nums text-[var(--text-secondary)]">{formatMoney(doctor.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {practice && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="ds-card p-5">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Явка за месяц</p>
              <p className="ds-display mt-2 text-[1.7rem] leading-none text-[var(--blue)]">{practice.completedRate}%</p>
              <p className="mt-2 text-xs text-[var(--muted)]">{practice.completed} из {practice.visits} без отменённых</p>
            </div>
            <div className="ds-card p-5">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Неявки</p>
              <p className="ds-display mt-2 text-[1.7rem] leading-none text-[var(--danger)]">{practice.noShowRate}%</p>
              <p className="mt-2 text-xs text-[var(--muted)]">{practice.noShow} визитов</p>
            </div>
            <div className="ds-card p-5">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Собираемость</p>
              <p className="ds-display mt-2 text-[1.7rem] leading-none text-[var(--success)]">{practice.collectionRate}%</p>
              <p className="mt-2 text-xs text-[var(--muted)]">{formatMoney(practice.collections)} оплат / {formatMoney(practice.production)} счетов месяца</p>
            </div>
          </div>
          <Card>
            <CardHeader title="Дебиторка по возрасту" description="Неоплаченный остаток с даты счёта" />
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ['до 30 дней', practice.aged.d0],
                ['31–60', practice.aged.d30],
                ['61–90', practice.aged.d60],
                ['старше 90', practice.aged.d90],
              ].map(([name, amount]) => (
                <div key={String(name)} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">{name}</p>
                  <p className="mt-1 font-semibold tabular-nums text-[var(--text)]">{formatMoney(Number(amount))}</p>
                </div>
              ))}
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Услуги месяца" description="Записи без отменённых" />
              <ul className="divide-y divide-[var(--border)] text-sm">
                {practice.treatments.map((row) => (
                  <li key={row.name} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-[var(--text-secondary)]">{row.name}</span>
                    <span className="font-semibold tabular-nums text-[var(--text)]">{row.count}</span>
                  </li>
                ))}
                {!practice.treatments.length && <li className="py-6 text-center text-[var(--muted)]">В этом месяце записей нет</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Откуда пациенты" description="Вся активная база" />
              <ul className="divide-y divide-[var(--border)] text-sm">
                {practice.sources.map((row) => (
                  <li key={row.source || 'none'} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className={row.source ? 'text-[var(--text-secondary)]' : 'text-[var(--muted)]'}>{row.source ? label(PATIENT_SOURCE, row.source) : 'Не указан'}</span>
                    <span className="font-semibold tabular-nums text-[var(--text)]">{row.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title="AI-инсайты" description="Рекомендации на основе данных клиники" />
        <ul className="space-y-2 text-sm">
          {(insights as { type: string; payload: Record<string, unknown>; confidence?: string }[]).map((ins, i) => (
            <li key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent-hover)]">{ins.type.replace(/_/g, ' ')}</p>
              <p className="mt-1 text-[var(--text-secondary)]">
                {typeof ins.payload.message === 'string'
                  ? ins.payload.message
                  : Object.entries(ins.payload).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </p>
            </li>
          ))}
          {!(insights as unknown[]).length && (
            <li className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center text-[var(--muted)]">Нажмите «Прогноз», чтобы сгенерировать рекомендации</li>
          )}
        </ul>
      </Card>
    </Protected>
  );
}
