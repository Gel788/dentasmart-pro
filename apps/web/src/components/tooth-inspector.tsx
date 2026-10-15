'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ToothChart, type ToothRecord } from '@/components/tooth-chart';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { TOOTH_CONDITIONS, formatDate, label } from '@/lib/format';

const SURFACES = [
  { code: 'B', label: 'B · вестибулярная' },
  { code: 'M', label: 'M · медиальная' },
  { code: 'O', label: 'O · жевательная' },
  { code: 'D', label: 'D · дистальная' },
  { code: 'L', label: 'L · язычная / нёбная' },
] as const;

type SurfaceRow = { toothNum: number; surface: string; condition: string; layer: string; diagnosis?: string | null };
type EventRow = { id: string; toothNum: number; surfaces: string[]; condition: string; layer: string; note?: string | null; source: string; createdAt: string };
type PlanItem = { title: string; toothNum?: number | null; surfaces?: string[]; status?: string; phase?: number; price: string };
type Plan = { id: string; title: string; status: string; items: PlanItem[] };

const SOURCE: Record<string, string> = {
  EXAM: 'Осмотр',
  PLAN_DONE: 'Выполнено по плану',
};

export function ToothInspector({
  patientId,
  records,
  surfaces,
  events,
  plans,
  onChanged,
}: {
  patientId: string;
  records: ToothRecord[];
  surfaces: SurfaceRow[];
  events: EventRow[];
  plans: Plan[];
  onChanged: () => void;
}) {
  const [tooth, setTooth] = useState<number>();
  const [picked, setPicked] = useState<string[]>(['O']);
  const [condition, setCondition] = useState('CARIES');
  const [diagnosis, setDiagnosis] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const record = records.find((item) => item.toothNum === tooth && item.formula !== 'CHILD');
  const toothSurfaces = surfaces.filter((item) => item.toothNum === tooth);

  useEffect(() => {
    setDiagnosis(record?.diagnosis ?? '');
    setCondition(record?.condition && record.condition !== 'HEALTHY' ? record.condition : 'CARIES');
  }, [tooth, record?.condition, record?.diagnosis]);

  const planned = useMemo(
    () =>
      plans.flatMap((plan) =>
        plan.items
          .filter((item) => item.toothNum === tooth && item.status !== 'REJECTED' && item.status !== 'DONE')
          .map((item) => ({ ...item, planId: plan.id, planTitle: plan.title })),
      ),
    [plans, tooth],
  );
  const done = useMemo(
    () =>
      plans.flatMap((plan) =>
        plan.items.filter((item) => item.toothNum === tooth && (item.status === 'DONE' || item.status === undefined)).filter((item) => item.status === 'DONE'),
      ),
    [plans, tooth],
  );
  const history = events.filter((event) => event.toothNum === tooth);

  const paint = async (num: number, next: string) => {
    setTooth(num);
    await save(num, next, next === 'HEALTHY' ? [] : ['TOOTH'], next === 'CARIES' ? 'PATHOLOGY' : 'EXISTING');
  };

  const save = async (num: number, next: string, surfaceCodes: string[], layer?: string) => {
    setBusy(true);
    setError('');
    try {
      await api(`/clinical/patients/${patientId}/teeth`, {
        method: 'POST',
        body: JSON.stringify({
          toothNum: num,
          formula: 'ADULT',
          condition: next,
          diagnosis,
          surfaces: surfaceCodes.filter((code) => code !== 'TOOTH'),
          layer,
        }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не сохранилось');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <section className="ds-card p-5">
        <p className="ds-kicker">Формула FDI</p>
        <h2 className="mt-1 text-lg font-semibold text-[var(--text)]">Что уже во рту и что нашли</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Кариес — находка осмотра. Пломба, коронка, имплант и отсутствие — уже существующее. План не закрашивает зуб, пока работу не выполнят.
        </p>
        <div className="mt-4">
          <ToothChart records={records} selected={tooth} onSelect={setTooth} onPaint={paint} marked={planned.map((item) => item.toothNum).filter((n): n is number => typeof n === 'number')} />
        </div>
      </section>

      <section className="ds-card p-5">
        {!tooth ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
            <p className="font-medium text-[var(--text)]">Выберите зуб</p>
            <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Справа появятся поверхности, диагноз, план и история изменений.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="ds-kicker">Зуб {tooth}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Сводка: {label(TOOTH_CONDITIONS, record?.condition ?? 'HEALTHY')}
                  {record?.layer === 'EXISTING' ? ' · уже во рту' : record?.condition && record.condition !== 'HEALTHY' ? ' · находка' : ''}
                </p>
              </div>
              <button type="button" className="text-sm text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setTooth(undefined)}>
                Сбросить
              </button>
            </div>

            <div>
              <Label>Поверхности</Label>
              <div className="grid grid-cols-3 gap-2">
                <span />
                <SurfaceChip code="B" active={picked.includes('B')} state={toothSurfaces.find((row) => row.surface === 'B')} onClick={() => toggle(picked, 'B', setPicked)} />
                <span />
                <SurfaceChip code="M" active={picked.includes('M')} state={toothSurfaces.find((row) => row.surface === 'M')} onClick={() => toggle(picked, 'M', setPicked)} />
                <SurfaceChip code="O" active={picked.includes('O')} state={toothSurfaces.find((row) => row.surface === 'O')} onClick={() => toggle(picked, 'O', setPicked)} />
                <SurfaceChip code="D" active={picked.includes('D')} state={toothSurfaces.find((row) => row.surface === 'D')} onClick={() => toggle(picked, 'D', setPicked)} />
                <span />
                <SurfaceChip code="L" active={picked.includes('L')} state={toothSurfaces.find((row) => row.surface === 'L')} onClick={() => toggle(picked, 'L', setPicked)} />
                <span />
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">{SURFACES.map((item) => item.label).join(' · ')}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Состояние выбранных поверхностей</Label>
                <Select value={condition} onChange={(e) => setCondition(e.target.value)}>
                  {Object.entries(TOOTH_CONDITIONS).map(([key, name]) => (
                    <option key={key} value={key}>{name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Диагноз, МКБ</Label>
                <Input value={diagnosis} placeholder="K02.1" onChange={(e) => setDiagnosis(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !picked.length} onClick={() => save(tooth, condition, picked, condition === 'CARIES' || condition === 'OTHER' ? 'PATHOLOGY' : 'EXISTING')}>
                Записать поверхности
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => save(tooth, 'MISSING', [], 'EXISTING')}>Отсутствует</Button>
              <Button variant="ghost" disabled={busy} onClick={() => save(tooth, 'HEALTHY', picked.length ? picked : [], 'PATHOLOGY')}>Очистить</Button>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">В плане</p>
              {planned.length ? (
                <ul className="mt-2 space-y-2">
                  {planned.map((item) => (
                    <li key={`${item.planId}-${item.title}-${item.phase}`}>
                      <Link href={`/clinical/${item.planId}`} className="block rounded-xl border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]">
                        <span className="font-medium text-[var(--text)]">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          {item.planTitle} · этап {item.phase ?? 1}
                          {item.surfaces?.length ? ` · ${item.surfaces.join('')}` : ''}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[var(--muted)]">Открытых строк плана на этом зубе нет.</p>
              )}
              {done.length > 0 && (
                <p className="mt-2 text-xs text-[var(--success)]">Выполнено по плану: {done.map((item) => item.title).join(', ')}</p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">История зуба</p>
              {history.length ? (
                <ol className="mt-2 space-y-2">
                  {history.map((event) => (
                    <li key={event.id} className="border-l-2 border-[var(--accent)] pl-3">
                      <p className="text-sm text-[var(--text)]">
                        {label(TOOTH_CONDITIONS, event.condition)}
                        {event.surfaces.length ? ` · ${event.surfaces.join('')}` : ' · весь зуб'}
                        <span className="text-[var(--muted)]"> · {event.layer === 'EXISTING' ? 'есть' : 'находка'}</span>
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {formatDate(event.createdAt)} · {SOURCE[event.source] ?? event.source}
                        {event.note ? ` · ${event.note}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-[var(--muted)]">Записей по зубу ещё нет.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function toggle(current: string[], code: string, set: (next: string[]) => void) {
  set(current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
}

function SurfaceChip({
  code,
  active,
  state,
  onClick,
}: {
  code: string;
  active: boolean;
  state?: { condition: string; layer: string };
  onClick: () => void;
}) {
  const marked = state && state.condition !== 'HEALTHY';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-2 py-3 text-center text-xs font-semibold ${
        active ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hover)]' : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text)]'
      }`}
    >
      <span className="block text-sm">{code}</span>
      <span className="mt-1 block font-normal text-[10px] text-[var(--muted)]">
        {marked ? label(TOOTH_CONDITIONS, state.condition) : '—'}
      </span>
    </button>
  );
}
