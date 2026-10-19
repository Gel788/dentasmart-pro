'use client';

import { addDays, todayIn, weekStart, type RangeDay } from './model';
import styles from './schedule.module.css';

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** A whole month by weeks: how full each day is, in a bar and in words. */
export function MonthView({ days, selected, offset, onPick }: { days: RangeDay[]; selected: string; offset: number; onPick: (date: string) => void }) {
  if (!days.length) return null;
  const today = todayIn(offset);
  const lead = weekStart(days[0].date);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const end = addDays(weekStart(days[days.length - 1].date), 6);
  const cells: string[] = [];
  for (let date = lead; date <= end; date = addDays(date, 1)) cells.push(date);
  return (
    <div className={styles.month} role="grid" aria-label="Месяц">
      {DOW.map((name) => <div key={name} className={styles.dow} role="columnheader">{name}</div>)}
      {cells.map((date) => {
        const day = byDate.get(date);
        if (!day) return <div key={date} className={styles.mday} data-out="true" aria-hidden="true" />;
        const percent = Math.round(day.ratio * 100);
        return (
          <button
            key={date}
            type="button"
            role="gridcell"
            className={styles.mday}
            data-today={date === today}
            aria-current={date === selected ? 'date' : undefined}
            onClick={() => onPick(date)}
          >
            <header><b>{Number(date.slice(8))}</b><span>{day.visits ? `${percent}%` : ''}</span></header>
            <div className={styles.meter} aria-hidden="true"><i style={{ width: `${percent}%` }} /></div>
            <p>{day.visits ? `${day.visits} ${plural(day.visits, 'визит', 'визита', 'визитов')}` : 'Свободно'}</p>
          </button>
        );
      })}
    </div>
  );
}

function plural(count: number, one: string, few: string, many: string) {
  const ten = count % 10;
  const hundred = count % 100;
  if (ten === 1 && hundred !== 11) return one;
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return few;
  return many;
}
