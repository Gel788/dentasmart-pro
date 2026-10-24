'use client';

import { useId } from 'react';

/** A small trend line with a soft fill and a dot on the last value; no axes, the numbers sit beside it. */
export function Sparkline({ values, height = 44, color = 'var(--accent)', label }: { values: number[]; height?: number; color?: string; label?: string }) {
  const id = useId().replace(/:/g, '');
  const width = 160;
  const points = values.length ? values : [0];
  const max = Math.max(...points, 0);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const xy = points.map((value, index) => [index * step, height - 4 - ((value - min) / span) * (height - 10)] as const);
  const line = xy.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const [lastX, lastY] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="3.2" fill={color} stroke="var(--surface-solid)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Horizontal bars for a ranking (doctors by revenue and the like). */
export function Bars({ rows, format }: { rows: { label: string; value: number }[]; format: (value: number) => string }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((row) => (
        <li key={row.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
          <b style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{format(row.value)}</b>
          <span style={{ gridColumn: '1 / -1', height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <i style={{ display: 'block', height: '100%', width: `${Math.max(2, (row.value / max) * 100)}%`, borderRadius: 3, background: 'var(--accent)' }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
