'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Wallet, CreditCard, CheckCircle2, TrendingUp, Lightbulb, Sparkles } from 'lucide-react';
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
  funnel: { leads: number; scheduled: number; completed: number };
  aiInsights: { type: string; payload: Record<string, unknown>; confidence?: number }[];
}

const insightLabels: Record<string, string> = {
  CHURN_RISK: 'Риск оттока',
  REVENUE_FORECAST: 'Прогноз выручки',
  STAFFING: 'Загрузка персонала',
  ADMIN_SUGGESTION: 'Рекомендация',
};

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
        description="Ключевые показатели и рекомендации на сегодня"
      />

      <Link
        href="/reception"
        className="mb-8 flex flex-col gap-4 rounded-2xl border border-[var(--accent)]/30 bg-gradient-to-r from-[var(--accent-soft)] via-[var(--surface)] to-[var(--blue-soft)] p-6 shadow-[var(--shadow-card)] transition hover:border-[var(--accent)] sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
            <Sparkles size={14} />
            Главный экран дня
          </p>
          <h2 className="mt-1 text-xl font-bold text-[var(--text)]">Рабочий стол ресепшн</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Записи на сегодня, очередь и приём в один клик</p>
        </div>
        <Button>Открыть ресепшн</Button>
      </Link>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Пациенты" value={data?.patientsTotal ?? '—'} icon={Users} tone="teal" />
        <StatCard label="Дебиторка" value={finance ? formatMoney(finance.receivable) : '—'} icon={Wallet} tone="amber" />
        <StatCard label="Выручка сегодня" value={finance ? formatMoney(finance.revenueToday) : '—'} icon={CreditCard} tone="teal" />
        <StatCard label="Завершено приёмов" value={data?.funnel.completed ?? '—'} icon={CheckCircle2} tone="amber" />
      </div>

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
                className="rounded-xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface-muted)] to-[var(--surface)] p-4"
              >
                <p className="text-sm font-semibold text-[var(--accent)]">
                  {insightLabels[ins.type] ?? ins.type}
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {typeof ins.payload === 'object' && ins.payload !== null
                    ? Object.entries(ins.payload)
                        .slice(0, 2)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(' · ')
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
