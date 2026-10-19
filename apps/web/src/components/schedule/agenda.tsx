'use client';

import { clock, dayTitle, STATUS, wallMinutes, type BoardVisit } from './model';
import styles from './schedule.module.css';

/** Visits as a list by day: what the front desk reads on the phone or prints for the morning. */
export function Agenda({ dates, visits, offset, selectedId, onSelect }: { dates: string[]; visits: BoardVisit[]; offset: number; selectedId: string | null; onSelect: (visit: BoardVisit) => void }) {
  const byDay = dates.map((date) => ({
    date,
    rows: visits.filter((visit) => new Date(Date.parse(visit.startsAt) + offset * 60000).toISOString().slice(0, 10) === date),
  }));
  if (!visits.length) return <p className={styles.empty}>На эти дни записей нет. Нажмите «Записать» или выберите свободное время в дне.</p>;
  return (
    <div className={styles.agenda}>
      {byDay.filter((day) => day.rows.length).map((day) => (
        <section key={day.date} className={styles.agendaDay} aria-label={dayTitle(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}>
          <h3><span>{dayTitle(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}</span><span>{day.rows.length}</span></h3>
          {day.rows.map((visit) => {
            const status = STATUS[visit.status];
            return (
              <button key={visit.id} type="button" className={styles.row} aria-pressed={selectedId === visit.id} onClick={() => onSelect(visit)}>
                <time>{clock(wallMinutes(visit.startsAt, offset))}–{clock(wallMinutes(visit.endsAt, offset))}</time>
                <span><b>{visit.patient}</b><small>{visit.service}</small></span>
                <small>{visit.cabinet} · {visit.doctor}</small>
                <span className={styles.pill} data-tone={status.tone}><i aria-hidden="true" />{status.label}</span>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
