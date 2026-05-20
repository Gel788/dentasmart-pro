'use client';

import { useEffect, useState } from 'react';
import { Calendar, Users, Wallet } from 'lucide-react';
import { Protected } from '@/components/protected';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

export default function AnalyticsPage() {
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const [insights, setInsights] = useState<unknown[]>([]);

  useEffect(() => {
    api<Record<string, unknown>>('/analytics/dashboard').then(setDash);
    api<unknown[]>('/analytics/ai-insights').then(setInsights);
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
          <div className="grid gap-5 sm:grid-cols-3">
            <StatCard label="Пациенты" value={String(dash.patientsTotal)} icon={Users} />
            <StatCard label="Записи в месяце" value={String(dash.appointmentsThisMonth)} icon={Calendar} tone="blue" />
            <StatCard label="Выручка" value={formatMoney(Number(dash.revenueThisMonth))} icon={Wallet} />
          </div>

          {funnel && (
            <Card className="mt-6">
              <CardHeader title="Воронка" description="Конверсия от базы до завершённого приёма" />
              <div className="mt-4 flex gap-4 text-center text-sm">
                <div className="flex-1 rounded-lg bg-[var(--bg)] p-3">База<br /><strong>{funnel.leads}</strong></div>
                <div className="flex-1 rounded-lg bg-[var(--bg)] p-3">Записано<br /><strong>{funnel.scheduled}</strong></div>
                <div className="flex-1 rounded-lg bg-[var(--bg)] p-3">Завершено<br /><strong>{funnel.completed}</strong></div>
              </div>
            </Card>
          )}
        </>
      )}

      <Card className="mt-6">
        <CardHeader title="AI-инсайты" description="Рекомендации на основе данных клиники" />
        <ul className="space-y-2 text-sm">
          {(insights as { type: string; payload: Record<string, unknown>; confidence?: string }[]).map((ins, i) => (
            <li key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/60 px-4 py-3">
              <p className="font-medium text-[var(--accent-hover)]">{ins.type.replace(/_/g, ' ')}</p>
              <p className="mt-1 text-[var(--text-secondary)]">
                {typeof ins.payload.message === 'string'
                  ? ins.payload.message
                  : Object.entries(ins.payload).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </p>
            </li>
          ))}
          {!(insights as unknown[]).length && (
            <p className="py-8 text-center text-[var(--muted)]">Нажмите «Прогноз», чтобы сгенерировать рекомендации</p>
          )}
        </ul>
      </Card>
    </Protected>
  );
}
