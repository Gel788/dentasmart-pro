'use client';

import { useEffect } from 'react';

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const CHILD_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const CHILD_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

export const CONDITIONS = [
  { id: 'CARIES', label: 'Кариес', key: '1', color: '#e11d48' },
  { id: 'FILLED', label: 'Пломба', key: '2', color: '#2563eb' },
  { id: 'CROWN', label: 'Коронка', key: '3', color: '#ca8a04' },
  { id: 'ROOT_CANAL', label: 'Каналы', key: '4', color: '#7c3aed' },
  { id: 'IMPLANT', label: 'Имплант', key: '5', color: '#0f766e' },
  { id: 'MISSING', label: 'Нет зуба', key: '6', color: '#a1a1aa' },
  { id: 'TO_EXTRACT', label: 'К удалению', key: '7', color: '#9f1239' },
] as const;

const COLOR: Record<string, string> = Object.fromEntries(CONDITIONS.map((c) => [c.id, c.color]));
COLOR.HEALTHY = 'transparent';
COLOR.PLANNED = '#99f6e4';

export type ChartSurface = { toothNum: number; formula: string; surface: string; condition: string; layer: string };
export type ChartItem = { toothNum: number | null; surfaces: string[]; result: string; status: string; title: string };

export function ToothChart({
  surfaces,
  items,
  view,
  formula,
  condition,
  selected,
  onCondition,
  onPaint,
  onSelect,
  quiet,
  pulse,
}: {
  surfaces: ChartSurface[];
  items: ChartItem[];
  view: 'before' | 'plan' | 'after';
  formula: 'ADULT' | 'CHILD' | 'MIXED';
  condition: string;
  selected: number | null;
  onCondition: (id: string) => void;
  onPaint: (tooth: number, surface: string) => void;
  onSelect: (tooth: number) => void;
  quiet?: boolean;
  pulse?: number[];
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const found = CONDITIONS.find((item) => item.key === event.key);
      if (found) onCondition(found.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCondition]);

  const arches = formula === 'CHILD'
    ? [CHILD_UPPER, CHILD_LOWER]
    : formula === 'MIXED'
      ? [UPPER, CHILD_UPPER, CHILD_LOWER, LOWER]
      : [UPPER, LOWER];

  return (
    <div className="sd-stack">
      {!quiet && (
      <div className="sd-chips">
        {CONDITIONS.map((item) => (
          <button key={item.id} type="button" className={`sd-chip ${condition === item.id ? 'info' : ''}`} onClick={() => onCondition(item.id)}>
            {item.key} {item.label}
          </button>
        ))}
      </div>
      )}
      <div className="sd-toothgrid">
        {arches.map((arch) => (
          <div className="sd-arch" key={arch[0]}>
            {arch.map((tooth, index) => (
              <span key={tooth} style={{ display: 'contents' }}>
                {index === arch.length / 2 && <span className="gap" />}
                <Tooth
                  tooth={tooth}
                  selected={selected === tooth}
                  hot={pulse?.includes(tooth)}
                  quiet={quiet}
                  paint={(surface) => onPaint(tooth, surface)}
                  onSelect={() => onSelect(tooth)}
                  face={(surface) => face(tooth, surface, surfaces, items, view)}
                />
              </span>
            ))}
          </div>
        ))}
      </div>
      {!quiet && <p className="sd-muted">Клик по поверхности ставит выбранный статус. Клавиши 1–7 меняют инструмент. Вид «стало» показывает рот после выбранного варианта плана.</p>}
    </div>
  );
}

const FACETS: Record<string, string> = {
  B: 'M16 8 C16 4 36 4 36 8 L34 18 L18 18 Z',
  O: 'M20 20 H32 L30 32 H22 Z',
  L: 'M18 34 H34 L36 46 C36 52 16 52 16 46 Z',
  M: 'M14 16 L20 20 L22 32 L16 46 C10 40 10 22 14 16 Z',
  D: 'M38 16 C42 22 42 40 36 46 L30 32 L32 20 Z',
};

function Tooth({
  tooth,
  selected,
  hot,
  quiet,
  face,
  paint,
  onSelect,
}: {
  tooth: number;
  selected: boolean;
  hot?: boolean;
  quiet?: boolean;
  face: (surface: string) => { color: string; planned: boolean };
  paint: (surface: string) => void;
  onSelect: () => void;
}) {
  const upper = isUpper(tooth);
  const gid = `enamel-${tooth}`;
  const body = face('O');
  return (
    <div className={`sd-tooth${hot ? ' hot' : ''}`}>
      {upper && <div className="num">{tooth}</div>}
      <svg viewBox="0 0 52 64" className={`sd-tooth-svg ${selected ? 'on' : ''}`} role="img" aria-label={`Зуб ${tooth}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fffefb" />
            <stop offset="48%" stopColor="#f3eee6" />
            <stop offset="100%" stopColor="#cfc6b8" />
          </linearGradient>
        </defs>
        <path d="M16 10 C16 2 36 2 36 10 L40 34 C40 50 34 58 26 58 C18 58 12 50 12 34 Z" fill={`url(#${gid})`} />
        <ellipse cx="22" cy="16" rx="7" ry="5" fill="white" opacity="0.55" />
        {(['B', 'M', 'O', 'D', 'L'] as const).map((surface) => {
          const paintFace = face(surface);
          const fill = paintFace.color === 'transparent' ? 'transparent' : paintFace.color;
          return (
            <path
              key={surface}
              className="hit"
              d={FACETS[surface]}
              fill={fill}
              fillOpacity={fill === 'transparent' ? 0 : 0.88}
              stroke={paintFace.planned ? '#0f766e' : 'rgba(16,33,28,0.18)'}
              strokeDasharray={paintFace.planned ? '2 2' : undefined}
              strokeWidth="1"
              onClick={(event) => { event.stopPropagation(); onSelect(); paint(surface); }}
            >
              <title>{`Зуб ${tooth}, ${surface}`}</title>
            </path>
          );
        })}
        {body.color !== 'transparent' && <path d="M16 10 C16 2 36 2 36 10 L40 34 C40 50 34 58 26 58 C18 58 12 50 12 34 Z" fill={body.color} opacity="0.18" pointerEvents="none" />}
      </svg>
      {!upper && <div className="num">{tooth}</div>}
      {!quiet && <button type="button" className="sd-btn-ghost" style={{ height: 22, marginTop: 4, padding: '0 4px', fontSize: 10 }} onClick={() => { onSelect(); paint('TOOTH'); }}>весь</button>}
    </div>
  );
}

function isUpper(tooth: number) {
  const quadrant = Math.floor(tooth / 10);
  return quadrant === 1 || quadrant === 2 || quadrant === 5 || quadrant === 6;
}

function face(tooth: number, surface: string, surfaces: ChartSurface[], items: ChartItem[], view: 'before' | 'plan' | 'after') {
  const current = surfaces.find((row) => row.toothNum === tooth && (row.surface === surface || (surface !== 'TOOTH' && row.surface === 'TOOTH' && (row.condition === 'MISSING' || row.condition === 'IMPLANT' || row.condition === 'TO_EXTRACT'))));
  const planned = items.find((item) => item.status !== 'REJECTED' && item.status !== 'DONE' && item.toothNum === tooth && (item.surfaces.length === 0 || item.surfaces.includes(surface) || item.surfaces.includes('TOOTH')));
  if (view === 'plan' && planned) return { color: COLOR.PLANNED, planned: true };
  if (view === 'after' && planned) return { color: COLOR[planned.result] ?? COLOR.FILLED, planned: false };
  const condition = current?.condition ?? 'HEALTHY';
  return { color: COLOR[condition] ?? 'transparent', planned: false };
}
