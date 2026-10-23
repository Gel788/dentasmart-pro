'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, dayTitle, todayIn, weekStart, type RangeDay } from './model';
import styles from './schedule.module.css';

const visitsWord = (n: number) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return 'визитов';
  if (n % 10 === 1) return 'визит';
  if (n % 10 >= 2 && n % 10 <= 4) return 'визита';
  return 'визитов';
};

/** The chosen week as seven large days: how many visits and how full the chairs are; arrows step a week. */
export function WeekStrip({ days, selected, offset, onPick, onMonth }: { days: RangeDay[]; selected: string; offset: number; onPick: (date: string) => void; onMonth: () => void }) {
  const today = todayIn(offset);
  const from = weekStart(selected);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const month = dayTitle(selected, { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '');
  return (
    <nav className={styles.week} aria-label="Дни недели">
      <button type="button" className={styles.weekArrow} onClick={() => onPick(addDays(selected, -7))} aria-label="Предыдущая неделя"><ChevronLeft size={18} /></button>
      <div className={styles.weekDays}>
        {Array.from({ length: 7 }, (_, index) => {
          const date = addDays(from, index);
          const day = byDate.get(date);
          const percent = Math.min(100, Math.round((day?.ratio ?? 0) * 100));
          const closed = day?.hours === null;
          return (
            <button
              key={date}
              type="button"
              className={styles.wday}
              aria-current={date === selected ? 'date' : undefined}
              data-today={date === today}
              data-closed={closed || undefined}
              onClick={() => onPick(date)}
              aria-label={`${dayTitle(date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${closed ? 'выходной' : day?.visits ? `${day.visits} ${visitsWord(day.visits)}, занято ${percent}%` : 'записей нет'}`}
            >
              <span className={styles.wdayName}>{dayTitle(date, { weekday: 'short' })}{date === today && <i>сегодня</i>}</span>
              <b>{Number(date.slice(8))}</b>
              <small>{closed ? 'выходной' : day?.visits ? `${day.visits} ${visitsWord(day.visits)}` : 'свободно'}</small>
              {!closed && <span className={styles.wdayLoad} aria-hidden="true"><i style={{ width: `${percent}%` }} data-full={percent >= 80 || undefined} /></span>}
            </button>
          );
        })}
      </div>
      <button type="button" className={styles.weekArrow} onClick={() => onPick(addDays(selected, 7))} aria-label="Следующая неделя"><ChevronRight size={18} /></button>
      <button type="button" className={styles.weekMonth} onClick={onMonth}>{month.charAt(0).toUpperCase() + month.slice(1)}</button>
    </nav>
  );
}
