'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { canMoveVisit, isVisitClosed, type VisitStatus } from '@dentasmart/shared';
import { ACTION, clock, dayTitle, STATUS, wallMinutes, type BoardVisit } from './model';
import styles from './schedule.module.css';

// Starting and closing the visit happen on the visit screen, where the history check and the protocol live.
const FORWARD: VisitStatus[] = ['CONFIRMED', 'WAITING'];

type Props = {
  visit: BoardVisit | null;
  offset: number;
  busy: boolean;
  onStatus: (visit: BoardVisit, status: VisitStatus) => void;
  onReschedule: (visit: BoardVisit) => void;
  /** Pick the new time on the grid instead of in the form. */
  onMoveOnGrid?: (visit: BoardVisit) => void;
  onClose: () => void;
};

/** The selected visit: who, when, where, and only the status moves the server will accept. */
export function VisitPanel({ visit, offset, busy, onStatus, onReschedule, onMoveOnGrid, onClose }: Props) {
  const [confirm, setConfirm] = useState<VisitStatus | null>(null);
  if (!visit) {
    return (
      <aside className={styles.panel} aria-label="Визит">
        <h2>Визит не выбран</h2>
        <p className={styles.empty}>Нажмите на визит, чтобы увидеть детали, или на свободное время, чтобы записать пациента.</p>
      </aside>
    );
  }
  const status = STATUS[visit.status];
  const day = new Date(Date.parse(visit.startsAt) + offset * 60000).toISOString().slice(0, 10);
  const next = FORWARD.find((target) => target !== visit.status && canMoveVisit(visit.status, target) && FORWARD.indexOf(target) > FORWARD.indexOf(visit.status as VisitStatus));
  const closing = (['NO_SHOW', 'CANCELLED'] as VisitStatus[]).filter((target) => canMoveVisit(visit.status, target) && target !== visit.status);
  const movable = !isVisitClosed(visit.status) && visit.status !== 'IN_PROGRESS';

  return (
    <aside className={styles.panel} aria-label={`Визит: ${visit.patient}`}>
      <div className={styles.bar}>
        <h2 style={{ marginRight: 'auto' }}>{visit.patient}</h2>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Закрыть визит"><X size={18} aria-hidden="true" /></button>
      </div>
      <span className={styles.pill} data-tone={status.tone}><i aria-hidden="true" />{status.label}</span>
      {visit.allergies && visit.allergies.length > 0 && <p className={styles.allergy}>Аллергия: {visit.allergies.join(', ')}</p>}
      <dl>
        <dt>Когда</dt><dd>{dayTitle(day, { weekday: 'short', day: 'numeric', month: 'short' })}, {clock(wallMinutes(visit.startsAt, offset))}–{clock(wallMinutes(visit.endsAt, offset))}</dd>
        <dt>Услуга</dt><dd>{visit.service}</dd>
        <dt>Кресло</dt><dd>{visit.cabinet}</dd>
        <dt>Врач</dt><dd>{visit.doctor}</dd>
      </dl>
      <div className={styles.actions}>
        {next && (
          <button type="button" className="sd-btn" disabled={busy} onClick={() => onStatus(visit, next)}>
            {busy ? 'Сохраняем…' : ACTION[next]}
          </button>
        )}
        {!isVisitClosed(visit.status) && <Link className={next ? 'sd-btn-ghost' : 'sd-btn'} href={`/visits/${visit.id}`}>{visit.status === 'IN_PROGRESS' ? 'Вернуться к приёму' : 'Открыть приём'}</Link>}
        {visit.status === 'COMPLETED' && <Link className="sd-btn-ghost" href={`/visits/${visit.id}`}>Протокол</Link>}
        <Link className="sd-btn-ghost" href={`/patients/${visit.patientId}`}>Карта пациента</Link>
        {movable && onMoveOnGrid && <button type="button" className="sd-btn-ghost" disabled={busy} onClick={() => onMoveOnGrid(visit)}>Перенести на сетке</button>}
        {movable && <button type="button" className="sd-btn-ghost" disabled={busy} onClick={() => onReschedule(visit)}>{onMoveOnGrid ? 'Изменить запись' : 'Перенести'}</button>}
      </div>
      {closing.length > 0 && !confirm && (
        <div className={styles.actions}>
          {closing.map((target) => (
            <button key={target} type="button" className="sd-btn-ghost" disabled={busy} onClick={() => setConfirm(target)}>{ACTION[target]}</button>
          ))}
        </div>
      )}
      {confirm && (
        <div className={styles.confirm} role="alertdialog" aria-label="Подтверждение">
          <span>{confirm === 'CANCELLED' ? 'Отменить визит? Время освободится, отмену нельзя вернуть.' : 'Отметить неявку? Визит закроется, повторную запись нужно будет создать.'}</span>
          <div className={styles.actions}>
            <button type="button" className="sd-btn-ghost" onClick={() => setConfirm(null)}>Не надо</button>
            <button type="button" className="sd-btn" disabled={busy} onClick={() => { onStatus(visit, confirm); setConfirm(null); }}>{ACTION[confirm]}</button>
          </div>
        </div>
      )}
    </aside>
  );
}
