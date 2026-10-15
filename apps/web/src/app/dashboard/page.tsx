'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, CreditCard, TrendingUp, Lightbulb, CalendarX, Armchair } from 'lucide-react';
import { APPOINTMENT_STATUS, label } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Protected } from '@/components/protected';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';

interface DashboardData {
  patientsTotal: number;
  appointmentsThisMonth: number;
  revenueThisMonth: number;
  noShowThisMonth?: number;
  noShowRate?: number;
  loadPercent?: number;
  todayCount?: number;
  revenueSeries?: { date: string; amount: number }[];
  doctors?: { name: string; count: number }[];
  today?: {
    id: string;
    startsAt: string;
    status: string;
    patient: { id: string; firstName: string; lastName: string };
    doctor?: { firstName: string; lastName: string } | null;
    service?: { name: string } | null;
    cabinet?: { name: string } | null;
  }[];
  funnel: { leads: number; scheduled: number; completed: number };
  aiInsights: { type: string; payload: Record<string, unknown>; confidence?: number }[];
}

const insightLabels: Record<string, string> = {
  CHURN_RISK: 'Риск оттока',
  REVENUE_FORECAST: 'Прогноз выручки',
  STAFFING: 'Загрузка персонала',
  ADMIN_SUGGESTION: 'Рекомендация',
  VOICE_NOTE: 'Голосовая заметка',
};

function insightText(type: string, payload: Record<string, unknown>) {
  if (type === 'VOICE_NOTE' && payload.transcript) return String(payload.transcript);
  if (type === 'CHURN_RISK' && payload.recommendation) return String(payload.recommendation);
  if (type === 'REVENUE_FORECAST') {
    const parts = [
      payload.month ? String(payload.month) : '',
      payload.forecast != null ? formatMoney(Number(payload.forecast)) : '',
    ].filter(Boolean);
    return parts.join(' · ') || '—';
  }
  const text = Object.values(payload)
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .slice(0, 2)
    .map(String)
    .join(' · ');
  return text || '—';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [finance, setFinance] = useState<{ receivable: number; revenueToday: number; openInvoices: number } | null>(null);

  useEffect(() => {
    api<DashboardData>('/analytics/dashboard').then(setData).catch(console.error);
    api<{ receivable: number; revenueToday: number; openInvoices: number }>('/finance/summary').then(setFinance).catch(console.error);
  }, []);

  const funnel = data?.funnel;
  const maxFunnel = funnel ? Math.max(funnel.leads, funnel.scheduled, funnel.completed, 1) : 1;

  return (
    <Protected>
      <PageHeader
        badge="Обзор клиники"
        title={`Здравствуйте, ${user?.employee?.firstName ?? 'коллега'}`}
        description={
          finance
            ? `Дебиторка ${formatMoney(finance.receivable)} · открытых счетов ${finance.openInvoices}`
            : 'Выручка, визиты, неявки и загрузка кресел'
        }
      />

      <Link
        href="/reception"
        className="ds-card-hover mb-8 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-xs font-medium text-[var(--muted)]">Главный экран дня</p>
          <h2 className="mt-1 text-xl font-bold text-[var(--text)]">Рабочий стол ресепшн</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Записи на сегодня, очередь и приём в один клик</p>
        </div>
        <Button>Открыть ресепшн</Button>
      </Link>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Выручка месяца" value={data ? formatMoney(data.revenueThisMonth) : '—'} hint={finance ? `сегодня ${formatMoney(finance.revenueToday)}` : undefined} icon={CreditCard} tone="teal" />
        <StatCard label="Визиты месяца" value={data?.appointmentsThisMonth ?? '—'} hint={data ? `завершено ${data.funnel.completed}` : undefined} icon={Users} tone="blue" />
        <StatCard label="Неявки" value={data?.noShowThisMonth ?? '—'} hint={data?.noShowRate != null ? `${data.noShowRate}% от визитов` : undefined} icon={CalendarX} tone="amber" />
        <StatCard label="Загрузка кресел сегодня" value={data?.loadPercent != null ? `${data.loadPercent}%` : '—'} hint={data?.todayCount != null ? `${data.todayCount} записей` : undefined} icon={Armchair} tone="teal" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader title="Выручка за 14 дней" description="Оплаты, которые уже прошли по кассе" />
          <RevenueBars series={data?.revenueSeries ?? []} />
        </Card>
        <Card>
          <CardHeader title="Нагрузка врачей" description="Визиты этого месяца, без отмен" />
          <div className="space-y-3">
            {(data?.doctors ?? []).map((doctor) => (
              <div key={doctor.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{doctor.name}</span>
                  <span className="tabular-nums text-[var(--muted)]">{doctor.count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, (doctor.count / Math.max(data?.doctors?.[0]?.count ?? 1, 1)) * 100)}%` }} />
                </div>
              </div>
            ))}
            {!data?.doctors?.length && <p className="text-sm text-[var(--muted)]">Пока нет визитов за месяц.</p>}
          </div>
        </Card>
      </div>

      {!!data?.today?.length && (
        <Card className="mt-6">
          <CardHeader title="Сегодня в расписании" description="Живая лента филиала" action={<Link href="/schedule" className="text-sm font-medium text-[var(--accent)]">Всё расписание</Link>} />
          <div className="divide-y divide-[var(--border)]">
            {data.today.slice(0, 8).map((visit) => (
              <div key={visit.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="w-14 tabular-nums font-semibold text-[var(--text)]">
                  {new Date(visit.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <Link href={`/patients/${visit.patient.id}`} className="font-medium hover:text-[var(--accent)]">
                  {visit.patient.lastName} {visit.patient.firstName}
                </Link>
                <span className="text-[var(--muted)]">{visit.service?.name ?? 'Приём'}</span>
                <span className="text-[var(--muted)]">{visit.doctor ? `${visit.doctor.lastName}` : ''}</span>
                <span className="ml-auto text-xs text-[var(--text-secondary)]">{label(APPOINTMENT_STATUS, visit.status)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {funnel && (
          <Card>
            <CardHeader title="Воронка записи" description="От базы пациентов до завершённого приёма" />
            <div className="space-y-4">
              {[
                { label: 'База пациентов', value: funnel.leads, color: 'bg-[var(--blue)]' },
                { label: 'Записано', value: funnel.scheduled, color: 'bg-[var(--accent)]' },
                { label: 'Завершено', value: funnel.completed, color: 'bg-[var(--success)]' },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">{row.label}</span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                    <div
                      className={`h-full rounded-full ${row.color} transition-all duration-700`}
                      style={{ width: `${(row.value / maxFunnel) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Быстрый старт"
            description="Частые действия ресепшн и администратора"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { href: '/reception', label: 'Ресепшн сегодня' },
              { href: '/patients', label: 'Новый пациент' },
              { href: '/schedule', label: 'Запись на приём' },
              { href: '/finance', label: 'Касса и оплаты' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent-hover)]"
              >
                <TrendingUp size={16} className="text-[var(--accent)]" />
                {link.label}
              </a>
            ))}
          </div>
        </Card>
      </div>

      {data?.aiInsights && data.aiInsights.length > 0 && (
        <Card className="mt-8">
          <CardHeader
            title="AI-инсайты"
            description="Внутренние рекомендации на основе данных клиники"
            action={<Lightbulb size={20} className="text-[var(--warning)]" />}
          />
          <div className="grid gap-3 md:grid-cols-2">
            {data.aiInsights.slice(0, 4).map((ins, i) => (
              <div
                key={i}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4"
              >
                <p className="text-sm font-semibold text-[var(--text)]">
                  {insightLabels[ins.type] ?? 'Заметка'}
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {typeof ins.payload === 'object' && ins.payload !== null
                    ? insightText(ins.type, ins.payload)
                    : '—'}
                </p>
                {ins.confidence != null && (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Уверенность: {Math.round(Number(ins.confidence) * 100)}%
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </Protected>
  );
}

function RevenueBars({ series }: { series: { date: string; amount: number }[] }) {
  const max = Math.max(...series.map((point) => point.amount), 1);
  if (!series.length) return <p className="text-sm text-[var(--muted)]">Оплат за две недели ещё нет.</p>;
  return (
    <div className="flex h-36 items-end gap-1.5">
      {series.map((point) => (
        <div key={point.date} className="flex h-full flex-1 flex-col justify-end">
          <div
            className="rounded-t-md bg-[var(--accent)]"
            style={{ height: `${Math.max(4, (point.amount / max) * 100)}%` }}
            title={`${point.date}: ${formatMoney(point.amount)}`}
          />
          <span className="mt-1 text-center text-[10px] text-[var(--muted)]">{point.date.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}
