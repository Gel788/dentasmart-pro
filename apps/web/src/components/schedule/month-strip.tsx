'use client';

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { loadLevel } from '@dentasmart/shared';
import { dayTitle, monthBounds, todayIn, weekStart, type RangeDay } from './model';
import styles from './schedule.module.css';

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function shiftMonth(date: string, by: number) {
  const [y, m] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 10);
  return first;
}

const visitsWord = (n: number) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return 'записей';
  if (n % 10 === 1) return 'запись';
  if (n % 10 >= 2 && n % 10 <= 4) return 'записи';
  return 'записей';
};

/** The month day by day: weekday over the date, weeks set apart, how many visits and how full the chairs are. */
export function MonthStrip({ days, selected, offset, onPick }: { days: RangeDay[]; selected: string; offset: number; onPick: (date: string) => void }) {
  const today = todayIn(offset);
  const scroller = useRef<HTMLDivElement>(null);
  const week = weekStart(selected);
  const month = dayTitle(selected, { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '');
  const total = days.reduce((sum, day) => sum + day.visits, 0);

  // Keep the chosen day in sight when the strip is wider than the screen.
  useEffect(() => {
    const box = scroller.current;
    const cell = box?.querySelector<HTMLElement>('[aria-current="date"]');
    if (box && cell && box.scrollWidth > box.clientWidth) box.scrollLeft = cell.offsetLeft - box.clientWidth / 2 + cell.offsetWidth / 2;
  }, [selected, days]);

  const pickMonth = (by: number) => {
    const first = shiftMonth(selected, by);
    const thisMonth = monthBounds(today).first === first;
    onPick(thisMonth ? today : first);
  };

  return (
    <nav className={styles.strip} aria-label="Дни месяца">
      <div className={styles.stripHead}>
        <button type="button" className={styles.stripArrow} onClick={() => pickMonth(-1)} aria-label="Предыдущий месяц"><ChevronLeft /></button>
        <strong>{month.charAt(0).toUpperCase() + month.slice(1)}</strong>
        <button type="button" className={styles.stripArrow} onClick={() => pickMonth(1)} aria-label="Следующий месяц"><ChevronRight /></button>
        <span>{total ? `${total} ${visitsWord(total)} за месяц` : 'записей в этом месяце нет'}</span>
      </div>
      <div className={styles.stripDays} ref={scroller}>
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
              data-monday={weekday === 1}
              data-week={weekStart(day.date) === week}
              data-today={day.date === today}
              data-closed={day.hours === null || undefined}
              aria-current={day.date === selected ? 'date' : undefined}
              aria-label={`${dayTitle(day.date, { day: 'numeric', month: 'long', weekday: 'long' })}${day.hours === null ? ', выходной' : ''}: ${day.visits ? `${day.visits} ${visitsWord(day.visits)}, кресла заняты на ${percent}%` : 'записей нет'}`}
              title={day.visits ? `${day.visits} ${visitsWord(day.visits)} · занято ${percent}%` : 'Записей нет'}
              onClick={() => onPick(day.date)}
            >
              <span>{WEEKDAYS[weekday]}</span>
              <b>{Number(day.date.slice(8))}</b>
              <em>{day.visits || (day.hours === null ? 'вых' : '')}</em>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
