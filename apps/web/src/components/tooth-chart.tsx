'use client';

import clsx from 'clsx';
import { TOOTH_CONDITIONS } from '@/lib/format';

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [38, 37, 36, 35, 34, 33, 32, 31];
const LOWER_RIGHT = [41, 42, 43, 44, 45, 46, 47, 48];

const COLOR: Record<string, string> = {
  HEALTHY: 'bg-emerald-600/40 border-emerald-500',
  CARIES: 'bg-amber-600/50 border-amber-500',
  FILLED: 'bg-blue-600/40 border-blue-500',
  CROWN: 'bg-purple-600/40 border-purple-500',
  MISSING: 'bg-gray-600/30 border-gray-500 opacity-40',
  IMPLANT: 'bg-cyan-600/40 border-cyan-500',
  ROOT_CANAL: 'bg-orange-600/40 border-orange-500',
  OTHER: 'bg-gray-500/40 border-gray-400',
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
}: {
  records: ToothRecord[];
  onSelect: (toothNum: number) => void;
  selected?: number;
}) {
  const map = new Map(records.filter((r) => r.formula === 'ADULT').map((r) => [r.toothNum, r]));

  const Tooth = ({ num }: { num: number }) => {
    const rec = map.get(num);
    const cond = rec?.condition ?? 'HEALTHY';
    return (
      <button
        type="button"
        title={`${num}: ${TOOTH_CONDITIONS[cond] ?? cond}`}
        onClick={() => onSelect(num)}
        className={clsx(
          'h-8 w-8 rounded border text-[10px] font-medium transition hover:scale-110',
          COLOR[cond] ?? COLOR.OTHER,
          selected === num && 'ring-2 ring-[var(--accent)]',
        )}
      >
        {num}
      </button>
    );
  };

  const Row = ({ teeth }: { teeth: number[] }) => (
    <div className="flex justify-center gap-1">
      {teeth.map((n) => (
        <Tooth key={n} num={n} />
      ))}
    </div>
  );

  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <Row teeth={UPPER_RIGHT} />
      <Row teeth={UPPER_LEFT} />
      <div className="my-2 border-t border-dashed border-[var(--border)]" />
      <Row teeth={LOWER_LEFT} />
      <Row teeth={LOWER_RIGHT} />
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[var(--muted)]">
        {Object.entries(TOOTH_CONDITIONS).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={clsx('inline-block h-2 w-2 rounded', COLOR[k]?.split(' ')[0])} />
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
