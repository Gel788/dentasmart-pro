'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { layoutLanes, type DayHours } from '@dentasmart/shared';
import { clock, STATUS, todayIn, wallMinutes, type BoardVisit, type Column } from './model';
import styles from './schedule.module.css';

const SNAP = 15;

type Props = {
  columns: Column[];
  visits: BoardVisit[];
  offset: number;
  hours: { opensAt: number; closesAt: number };
  /** Each column's opening hours; time outside them is shaded but still bookable. */
  dayHours?: (column: Column) => DayHours;
  selectedId: string | null;
  pendingIds: Set<string>;
  onSelect: (visit: BoardVisit) => void;
  onSlot: (column: Column, minutes: number) => void;
  onMove: (visit: BoardVisit, column: Column, minutes: number) => void;
  label: string;
};

/** Columns × time. Card height follows the visit's length; overlapping visits share their column. */
export function TimeGrid({ columns, visits, offset, hours, dayHours, selectedId, pendingIds, onSelect, onSlot, onMove, label }: Props) {
  const startHour = Math.floor(hours.opensAt / 60);
  const endHour = Math.ceil(hours.closesAt / 60);
  const first = startHour * 60;
  const span = (endHour - startHour) * 60;
  const [over, setOver] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const today = todayIn(offset);
  const nowMinutes = wallMinutes(new Date(now).toISOString(), offset);
  const placed = useMemo(
    () =>
      columns.map((column) => {
        const own = visits.filter(column.match);
        return { column, own, lanes: layoutLanes(own) };
      }),
    [columns, visits],
  );

  const minutesAt = (event: React.MouseEvent<HTMLElement> | React.DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const hourPx = rect.height / (endHour - startHour);
    const raw = first + ((event.clientY - rect.top) / hourPx) * 60;
    return Math.max(first, Math.min(first + span - SNAP, Math.floor(raw / SNAP) * SNAP));
  };

  const showNow = columns.some((column) => column.date === today) && nowMinutes >= first && nowMinutes <= first + span;
  const hourPx = 'var(--hour)';
  const at = (minutes: number) => `calc(${(minutes - first) / 60} * ${hourPx})`;

  return (
    <div className={styles.grid} role="region" aria-label={label} tabIndex={0}>
      <div className={styles.gridInner} style={{ '--cols': columns.length } as CSSProperties}>
        <div className={styles.corner} />
        {columns.map((column) => (
          <div key={column.id} className={styles.colHead} data-today={column.date === today}>
            {column.label}
            {column.sub && <small>{column.sub}</small>}
          </div>
        ))}
        <div className={styles.times}>
          {Array.from({ length: endHour - startHour }, (_, index) => (
            <div key={index} className={styles.time} aria-hidden="true">{clock((startHour + index) * 60)}</div>
          ))}
          {showNow && (
            <span className={styles.nowLabel} style={{ top: at(nowMinutes) }}>
              <span className="sr-only">Сейчас </span>{clock(nowMinutes)}
            </span>
          )}
        </div>
        {placed.map(({ column, own, lanes }) => (
          <div
            key={column.id}
            className={styles.col}
            style={{ height: `calc(${endHour - startHour} * ${hourPx})` }}
            data-over={over === column.id}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button')) return;
              onSlot(column, minutesAt(event));
            }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(column.id); }}
            onDragLeave={() => setOver((current) => (current === column.id ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setOver(null);
              const visit = visits.find((item) => item.id === event.dataTransfer.getData('text/plain'));
              if (visit) onMove(visit, column, minutesAt(event));
            }}
          >
            {dayHours && closedBands(dayHours(column), first, first + span).map((band) => (
              <div key={band.from} className={styles.closed} style={{ top: at(band.from), height: `calc(${(band.to - band.from) / 60} * ${hourPx})` }} aria-hidden="true" />
            ))}
            {own.map((visit) => {
              const start = wallMinutes(visit.startsAt, offset);
              const end = wallMinutes(visit.endsAt, offset);
              const lane = lanes.get(visit.id) ?? { lane: 0, lanes: 1 };
              const status = STATUS[visit.status];
              const width = 100 / lane.lanes;
              return (
                <button
                  key={visit.id}
                  type="button"
                  className={styles.visit}
                  data-tone={status.tone}
                  data-short={end - start < 45}
                  data-pending={pendingIds.has(visit.id)}
                  aria-pressed={selectedId === visit.id}
                  draggable={!pendingIds.has(visit.id)}
                  onDragStart={(event) => { event.dataTransfer.setData('text/plain', visit.id); event.dataTransfer.effectAllowed = 'move'; }}
                  onClick={() => onSelect(visit)}
                  aria-label={`${clock(start)}–${clock(end)}, ${visit.patient}, ${visit.service}, ${status.label}`}
                  style={{
                    top: at(start),
                    height: `max(30px, calc(${(end - start) / 60} * ${hourPx} - 3px))`,
                    left: `calc(${lane.lane * width}% + 4px)`,
                    width: `calc(${width}% - 8px)`,
                  }}
                >
                  {end - start < 45 ? (
                    <span className={styles.short}><b>{visit.patient}</b> {clock(start)} · {visit.service}</span>
                  ) : (
                    <>
                      <b>{visit.patient}</b>
                      <span>{clock(start)}–{clock(end)} · {visit.service}</span>
                      <span className={styles.meta}><i aria-hidden="true" />{status.label}</span>
                    </>
                  )}
                </button>
              );
            })}
            {showNow && column.date === today && <div className={styles.now} style={{ top: at(nowMinutes) }} aria-hidden="true" />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Stretches of the visible span outside the day's opening hours (the whole span on a day off). */
function closedBands(day: DayHours, from: number, to: number) {
  if (!day) return [{ from, to }];
  const bands: { from: number; to: number }[] = [];
  if (day.opensAt > from) bands.push({ from, to: Math.min(to, day.opensAt) });
  if (day.closesAt < to) bands.push({ from: Math.max(from, day.closesAt), to });
  if (day.breakFrom !== undefined && day.breakTo !== undefined) bands.push({ from: Math.max(from, day.breakFrom), to: Math.min(to, day.breakTo) });
  return bands.filter((band) => band.to > band.from);
}
