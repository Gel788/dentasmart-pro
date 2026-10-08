'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Protected } from '@/components/protected';
import { PlanBoard, type PlanLine } from '@/components/plan-board';
import type { ToothRecord } from '@/components/tooth-chart';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatMoney, label, PLAN_STATUS } from '@/lib/format';

export default function TreatmentPlanPage() {
  const { planId } = useParams<{ planId: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [diary, setDiary] = useState('');

  const load = useCallback(() => {
    api<Record<string, unknown>>(`/clinical/treatment-plans/${planId}`).then(setPlan);
  }, [planId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!plan) {
    return (
      <Protected>
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 rounded bg-[var(--surface-muted)]" />
          <div className="ds-card h-40 bg-[var(--surface-muted)]" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="ds-card h-64 bg-[var(--surface-muted)]" />
            <div className="ds-card h-64 bg-[var(--surface-muted)]" />
          </div>
        </div>
      </Protected>
    );
  }

  const p = plan as {
    title: string;
    status: string;
    totalPrice: string;
    items: PlanLine[];
    diaryEntries: { id: string; notes: string; toothNum?: number | null; createdAt: string }[];
    patient: { id: string; firstName: string; lastName: string; toothRecords?: ToothRecord[] };
    doctor?: { firstName: string; lastName: string } | null;
    alternatives?: { id: string; title: string; status: string; totalPrice: string }[];
    parentPlan?: { id: string; title: string } | null;
  };

  const doneCount = p.items.filter((item) => (item.status || (item.isCompleted ? 'DONE' : '')) === 'DONE').length;

  const addDiary = async () => {
    if (!diary.trim()) return;
    await api(`/clinical/treatment-plans/${planId}/diary`, {
      method: 'POST',
      body: JSON.stringify({ notes: diary }),
    });
    setDiary('');
    load();
  };

  const setStatus = async (status: string) => {
    await api(`/clinical/treatment-plans/${planId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    load();
  };

  const pipeline = ['PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'] as const;

  return (
    <Protected>
      <div className="pb-8">
      <BackLink href="/clinical">Планы лечения</BackLink>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div>
          <p className="ds-kicker">План лечения</p>
          <h1 className="ds-display mt-2 text-3xl text-[var(--text)]">{p.title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            <Link href={`/patients/${p.patient.id}`} className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
              {p.patient.lastName} {p.patient.firstName}
            </Link>
            {p.doctor ? ` · ${p.doctor.lastName}` : ''}
            {' · '}
            <span className="tabular-nums">{formatMoney(p.totalPrice)}</span>
            {' · '}
            <span className="tabular-nums">{doneCount}/{p.items.length}</span> выполнено
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={async () => {
              const inv = await api<{ id: string }>(`/finance/invoices/from-plan/${planId}`, { method: 'POST' });
              window.location.href = `/finance?patientId=${p.patient.id}&invoiceId=${inv.id}`;
            }}
          >
            Выставить счёт
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const alt = await api<{ id: string }>(`/clinical/treatment-plans/${planId}/alternative`, {
                method: 'POST',
                body: JSON.stringify({ title: `${p.title} — вариант` }),
              });
              window.location.href = `/clinical/${alt.id}`;
            }}
          >
            Вариант плана
          </Button>
        </div>
      </header>

      <div className="ds-card mb-6 flex flex-wrap items-center gap-2 p-3">
        <span className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          Статус
        </span>
        {pipeline.map((status) => (
          <Button key={status} size="sm" variant={p.status === status ? 'primary' : 'ghost'} onClick={() => setStatus(status)}>
            {label(PLAN_STATUS, status)}
          </Button>
        ))}
      </div>

      {(p.parentPlan || (p.alternatives && p.alternatives.length > 0)) && (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Связанные
          </span>
          {p.parentPlan && (
            <Link
              href={`/clinical/${p.parentPlan.id}`}
              className="rounded-full border border-[var(--accent-soft)] bg-[var(--accent-soft)] px-3 py-1 font-medium text-[var(--accent-hover)] transition-colors duration-150 hover:border-[var(--accent)]"
            >
              Основной: {p.parentPlan.title}
            </Link>
          )}
          {p.alternatives?.map((alt) => (
            <Link
              key={alt.id}
              href={`/clinical/${alt.id}`}
              className="rounded-full border border-[var(--blue-soft)] bg-[var(--blue-soft)] px-3 py-1 font-medium text-[var(--blue)] transition-colors duration-150 hover:border-[var(--blue)]"
            >
              {alt.title} · <span className="tabular-nums">{formatMoney(alt.totalPrice)}</span>
            </Link>
          ))}
        </div>
      )}

      <PlanBoard
        planId={planId}
        patientId={p.patient.id}
        items={p.items}
        teeth={p.patient.toothRecords ?? []}
        onChanged={load}
        onClose={() => router.push(`/patients/${p.patient.id}`)}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Дневник лечения" description="Хронология визитов и заметок врача" />
          <ul className="max-h-72 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)]">
            {p.diaryEntries.map((d) => (
              <li key={d.id} className="bg-[var(--surface)] px-4 py-3 text-sm transition-colors duration-150 hover:bg-[var(--surface-muted)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {new Date(d.createdAt).toLocaleString('ru-RU')}
                </p>
                <p className="mt-1 text-[var(--text-secondary)]">{d.notes}</p>
              </li>
            ))}
            {!p.diaryEntries.length && (
              <li className="bg-[var(--surface)] py-6 text-center text-sm text-[var(--muted)]">Записей пока нет</li>
            )}
          </ul>
          <div className="mt-4 flex gap-2 border-t border-[var(--border)] pt-4">
            <Textarea
              className="min-h-[72px] flex-1"
              placeholder="Запись в дневник…"
              value={diary}
              onChange={(e) => setDiary(e.target.value)}
            />
          </div>
          <Button className="mt-2 w-full" onClick={addDiary} disabled={!diary.trim()}>
            Добавить запись
          </Button>
        </Card>
      </div>
      </div>
    </Protected>
  );
}
