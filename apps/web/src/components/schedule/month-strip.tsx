'use client';

import type { CSSProperties } from 'react';
import { loadLevel } from '@dentasmart/shared';
import { dayTitle, todayIn, type RangeDay } from './model';
import styles from './schedule.module.css';

/** The month as a load map; each day is also the way to open it. */
export function MonthStrip({ days, selected, offset, onPick }: { days: RangeDay[]; selected: string; offset: number; onPick: (date: string) => void }) {
  const today = todayIn(offset);
  return (
    <nav className={styles.strip} aria-label="Дни месяца и загрузка кресел" style={{ '--days': days.length } as CSSProperties}>
      {days.map((day) => {
        const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay();
        const percent = Math.round(day.ratio * 100);
        return (
          <button
            key={day.date}
            type="button"
            className={styles.cell}
            data-level={loadLevel(day.ratio)}
            data-weekend={weekday === 0 || weekday === 6}
            data-today={day.date === today}
            aria-current={day.date === selected ? 'date' : undefined}
            aria-label={`${dayTitle(day.date, { day: 'numeric', month: 'long', weekday: 'long' })}: ${day.visits ? `${day.visits} визитов, кресла заняты на ${percent}%` : 'записей нет'}`}
            onClick={() => onPick(day.date)}
          >
            <b>{Number(day.date.slice(8))}</b>
            <em>{day.visits ? `${percent}%` : '—'}</em>
          </button>
        );
      })}
    </nav>
  );
}
