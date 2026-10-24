'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { api } from '@/lib/api';
import styles from './patient-tabs.module.css';

type Visit = { id: string; startsAt: string; endsAt: string; status: string; service: string | null; doctor: string | null; cabinet: string | null; diagnosis: string | null; noShowReason: string | null };

/** Visit state as on the Today screen: a code square and its word. */
const STATE: Record<string, { code: string; word: string }> = {
  SCHEDULED: { code: 'wait', word: 'не подтверждён' },
  CONFIRMED: { code: 'ok', word: 'подтверждён' },
  WAITING: { code: 'here', word: 'пришёл' },
  IN_PROGRESS: { code: 'chair', word: 'в кресле' },
  COMPLETED: { code: 'done', word: 'завершён' },
  CANCELLED: { code: 'gone', word: 'отменён' },
  NO_SHOW: { code: 'owe', word: 'не пришёл' },
};

/** Every visit of the patient, upcoming first, then the history with diagnosis. */
export function PatientVisits({ patientId, onBook }: { patientId: string; onBook: () => void }) {
  const [rows, setRows] = useState<Visit[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Visit[]>(`/workspace/patients/${patientId}/visits`).then(setRows).catch((err: Error) => setError(err.message || 'Визиты не загрузились')); }, [patientId]);
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  if (!rows) return <div className={styles.skeleton} aria-label="Загружаем визиты" />;
  const now = Date.now();
  const ahead = rows.filter((row) => Date.parse(row.startsAt) >= now - 3600_000 && !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(row.status)).reverse();
  const past = rows.filter((row) => !ahead.includes(row));
  return (
    <div className={styles.stack}>
      <section className={styles.m}>
        <h2>Предстоящие<em>{ahead.length}</em><button type="button" className={styles.headAct} onClick={onBook}><CalendarPlus size={16} aria-hidden="true" />Записать</button></h2>
        {ahead.length === 0 ? <p className={styles.none}>Нет записей вперёд.</p> : <List rows={ahead} />}
      </section>
      <section className={styles.m}>
        <h2>История<em>{past.length}</em></h2>
        {past.length === 0 ? <p className={styles.none}>Пациент ещё не был на приёме.</p> : <List rows={past} />}
      </section>
    </div>
  );
}

function List({ rows }: { rows: Visit[] }) {
  return (
    <ul className={styles.list}>
      {rows.map((row) => {
        const state = STATE[row.status] ?? { code: 'done', word: row.status };
        const at = new Date(row.startsAt);
        return (
          <li key={row.id}>
            <Link href={`/visits/${row.id}`} className={styles.row}>
              <span className={styles.when}><b>{at.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric'})}</b><small>{at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small></span>
              <span className={styles.what}>
                <b>{row.service ?? 'Приём'}</b>
                <small>{[row.doctor, row.cabinet, row.diagnosis ? `диагноз: ${row.diagnosis}` : null, row.noShowReason].filter(Boolean).join(' · ') || '—'}</small>
              </span>
              <span className={styles.state}><i data-code={state.code} />{state.word}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
