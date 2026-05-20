'use client';

import { useState } from 'react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

const REPORTS = [
  { id: 'revenue_by_method', label: 'Выручка по способам оплаты' },
  { id: 'patients_by_tag', label: 'Пациенты (сводка)' },
];

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return value.toLocaleString('ru-RU');
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    if (n > 1000) return formatMoney(value);
  }
  return String(value);
}

function ReportResultView({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <p className="text-sm text-[var(--muted)]">Нет данных</p>;
  }

  if (Array.isArray(data)) {
    if (!data.length) return <p className="text-sm text-[var(--muted)]">Пустой результат</p>;
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((item, i) => {
          if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
            const entries = Object.entries(item as Record<string, unknown>);
            return (
              <Card key={i}>
                {entries.map(([key, val]) => (
                  <div key={key} className="mb-2 last:mb-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{key}</p>
                    <p className="mt-0.5 font-semibold text-[var(--text)]">{formatValue(val)}</p>
                  </div>
                ))}
              </Card>
            );
          }
          return (
            <Card key={i}>
              <p className="font-semibold text-[var(--text)]">{formatValue(item)}</p>
            </Card>
          );
        })}
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([key, val]) => (
          <Card key={key}>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{key}</p>
            {val !== null && typeof val === 'object' && !Array.isArray(val) ? (
              <div className="mt-2 space-y-1 text-sm">
                {Object.entries(val as Record<string, unknown>).map(([k, v]) => (
                  <p key={k} className="text-[var(--text-secondary)]">
                    <span className="text-[var(--muted)]">{k}:</span> {formatValue(v)}
                  </p>
                ))}
              </div>
            ) : Array.isArray(val) ? (
              <ReportResultView data={val} />
            ) : (
              <p className="mt-1 text-lg font-semibold text-[var(--text)]">{formatValue(val)}</p>
            )}
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <p className="font-semibold text-[var(--text)]">{formatValue(data)}</p>
    </Card>
  );
}

export default function ReportsPage() {
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const run = async (type: string) => {
    setLoading(true);
    try {
      const data = await api(`/analytics/reports/${type}`);
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Protected>
      <PageHeader
        badge="Аналитика"
        title="Конструктор отчётов"
        description="Внутренние отчёты без внешних BI"
      />

      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <Button key={r.id} variant="ghost" disabled={loading} onClick={() => run(r.id)}>
            {r.label}
          </Button>
        ))}
      </div>

      {result !== null && (
        <Card className="mt-6">
          <CardHeader title="Результат" description="Данные отчёта" />
          <ReportResultView data={result} />
        </Card>
      )}
    </Protected>
  );
}
