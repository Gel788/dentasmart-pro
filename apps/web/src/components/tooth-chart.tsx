'use client';

import { useMemo, useState } from 'react';
import { Odontogram, type ToothDetail } from 'react-odontogram';
import 'react-odontogram/style.css';
import clsx from 'clsx';
import { Eraser } from 'lucide-react';
import { TOOTH_CONDITIONS } from '@/lib/format';

const BRUSHES = ['CARIES', 'FILLED', 'CROWN', 'ROOT_CANAL', 'IMPLANT', 'MISSING'] as const;

const SWATCH: Record<string, { fill: string; outline: string }> = {
  CARIES: { fill: '#fecaca', outline: '#dc2626' },
  FILLED: { fill: '#fde68a', outline: '#d97706' },
  CROWN: { fill: '#ddd6fe', outline: '#7c3aed' },
  ROOT_CANAL: { fill: '#fbcfe8', outline: '#db2777' },
  IMPLANT: { fill: '#99f6e4', outline: '#0d9488' },
  MISSING: { fill: '#cbd5e1', outline: '#64748b' },
  OTHER: { fill: '#e2e8f0', outline: '#475569' },
};

export interface ToothRecord {
  toothNum: number;
  formula: string;
  condition: string;
  diagnosis?: string | null;
}

export function ToothChart({
  records,
  onSelect,
  selected,
  marked,
  onPaint,
}: {
  records: ToothRecord[];
  onSelect: (toothNum: number) => void;
  selected?: number;
  marked?: number[];
  onPaint?: (toothNum: number, condition: string) => void;
}) {
  const [brush, setBrush] = useState<string | 'erase' | null>(onPaint ? 'CARIES' : null);
  const [tick, setTick] = useState(0);
  const adult = records.filter((record) => record.formula === 'ADULT');
  const byTooth = new Map(adult.map((record) => [record.toothNum, record]));

  const teethConditions = useMemo(
    () =>
      [...BRUSHES, 'OTHER' as const]
        .map((condition) => ({
          label: TOOTH_CONDITIONS[condition] ?? condition,
          fillColor: SWATCH[condition].fill,
          outlineColor: SWATCH[condition].outline,
          teeth: adult.filter((record) => record.condition === condition).map((record) => `teeth-${record.toothNum}`),
        }))
        .filter((group) => group.teeth.length > 0),
    [adult],
  );

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const record of adult) {
      if (record.condition && record.condition !== 'HEALTHY') {
        tally[record.condition] = (tally[record.condition] ?? 0) + 1;
      }
    }
    return tally;
  }, [adult]);

  const handleChange = (picked: ToothDetail[]) => {
    const num = Number(picked[0]?.notations.fdi);
    if (!Number.isFinite(num)) return;
    if (onPaint && brush) {
      const current = byTooth.get(num)?.condition ?? 'HEALTHY';
      const next = brush === 'erase' || current === brush ? 'HEALTHY' : brush;
      onPaint(num, next);
    }
    onSelect(num);
    setTick((value) => value + 1);
  };

  return (
    <div className="odontogram-wrap">
      {onPaint && (
        <div
          className="mb-4 flex flex-wrap items-center gap-1.5"
          role="toolbar"
          aria-label="Кисть формулы"
        >
          <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Кисть
          </span>
          {BRUSHES.map((condition) => {
            const swatch = SWATCH[condition];
            const active = brush === condition;
            return (
              <button
                key={condition}
                type="button"
                aria-pressed={active}
                onClick={() => setBrush(condition)}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                  active
                    ? 'border-transparent'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-muted)]',
                )}
                style={active ? { background: swatch.fill, color: swatch.outline, borderColor: swatch.outline } : undefined}
              >
                <span className="h-2.5 w-2.5 rounded-sm border" style={{ background: swatch.fill, borderColor: swatch.outline }} />
                {TOOTH_CONDITIONS[condition]}
                {(counts[condition] ?? 0) > 0 && (
                  <span className="tabular-nums opacity-80">{counts[condition]}</span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={brush === 'erase'}
            onClick={() => setBrush('erase')}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
              brush === 'erase'
                ? 'border-[var(--text)] bg-[var(--surface-muted)] text-[var(--text)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-muted)]',
            )}
          >
            <Eraser size={13} />
            Стереть
          </button>
        </div>
      )}

      <Odontogram
        key={`${tick}-${selected ?? 'none'}`}
        notation="FDI"
        layout="circle"
        singleSelect
        showLabels={false}
        defaultSelected={selected ? [`teeth-${selected}`] : []}
        teethConditions={teethConditions}
        onChange={handleChange}
        styles={{ width: '100%', maxWidth: 460 }}
        tooltip={{
          content: (tooth) => (tooth ? `Зуб ${tooth.notations.fdi}` : null),
        }}
      />

      {onPaint && (
        <p className="mt-2 text-center text-xs text-[var(--muted)]">
          Выберите кисть и нажмите зуб. Повторное нажатие той же кистью снимает отметку.
        </p>
      )}

      {!!marked?.length && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-3">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            В плане
          </span>
          {marked.map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => onSelect(num)}
              className={clsx(
                'rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors duration-150',
                selected === num
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--accent-soft)] text-[var(--accent-hover)] hover:bg-[var(--accent)] hover:text-white',
              )}
            >
              {num}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
