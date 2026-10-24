'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Phone, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useFocus } from '@/lib/focus';
import styles from './requests.module.css';

type Row = {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  patient: string;
  phone: string;
  startsAt: string;
  endsAt: string;
  service: string | null;
  summary: string | null;
  urgent: boolean;
  viaAssistant: boolean;
  appointmentId: string | null;
  declineReason: string | null;
  createdAt: string;
};

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Bookings asked for on the site. Each holds its slot until the clinic accepts or declines it. */
export function Requests() {
  const { bump } = useFocus();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(() => api<Row[]>('/booking-requests').then((data) => { setRows(data); setError(''); }).catch((err: Error) => setError(err.message || 'Заявки не загрузились')), []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(timer); }, [load]);

  const act = async (id: string, path: 'accept' | 'decline', body?: unknown) => {
    setBusy(id);
    setError('');
    try {
      await api(`/booking-requests/${id}/${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) });
      setDeclining(null);
      setReason('');
      bump();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy(null);
    }
  };

  const pending = (rows ?? []).filter((row) => row.status === 'PENDING');
  const decided = (rows ?? []).filter((row) => row.status !== 'PENDING');

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>Запись с сайта</h1>
          <p>Заявки из виджета на сайте. Время держится за пациентом, пока вы не ответите.</p>
        </div>
        <Link className="sd-btn-ghost" href="/widget">Виджет и код для сайта</Link>
      </header>
      {error && <p className={styles.error} role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</p>}

      <section className={styles.m} aria-labelledby="pending-title">
        <h2 id="pending-title">Ждут ответа <em>{pending.length}</em></h2>
        {rows === null ? <p className={styles.none}>Загружаем…</p> : pending.length === 0 ? (
          <p className={styles.none}>Новых заявок нет. Когда пациент запишется на сайте, заявка появится здесь и в «Требует внимания».</p>
        ) : (
          <ul className={styles.list}>
            {pending.map((row) => (
              <li key={row.id} className={styles.row} data-urgent={row.urgent || undefined}>
                <time className={styles.time}>{when(row.startsAt)}</time>
                <div className={styles.who}>
                  <b>{row.patient}</b>
                  <span><Phone size={13} aria-hidden="true" />{row.phone}{row.service ? ` · ${row.service}` : ''}</span>
                  {row.summary && <p>{row.viaAssistant && <Sparkles size={13} aria-label="Со слов пациента в чате с помощником" />}{row.summary}</p>}
                  {row.urgent && <span className={styles.urgent}><i aria-hidden="true" />Срочно: острая боль или отёк</span>}
                </div>
                <div className={styles.acts}>
                  {declining === row.id ? (
                    <form className={styles.decline} onSubmit={(event) => { event.preventDefault(); void act(row.id, 'decline', { reason }); }}>
                      <label><span className="sr-only">Причина отказа</span><input className="sd-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Причина, например «врач в отпуске»" autoFocus /></label>
                      <button className="sd-btn-ghost" type="button" onClick={() => setDeclining(null)}>Отмена</button>
                      <button className={styles.no} type="submit" disabled={busy === row.id}>Отклонить</button>
                    </form>
                  ) : (
                    <>
                      <button className={styles.yes} type="button" disabled={busy === row.id} onClick={() => void act(row.id, 'accept')}><Check size={17} aria-hidden="true" />{busy === row.id ? 'Записываем…' : 'Подтвердить'}</button>
                      <button className="sd-btn-ghost" type="button" disabled={busy === row.id} onClick={() => { setDeclining(row.id); setReason(''); }}><X size={16} aria-hidden="true" />Отклонить</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section className={styles.m} aria-labelledby="done-title">
          <h2 id="done-title">За неделю</h2>
          <ul className={styles.list}>
            {decided.map((row) => (
              <li key={row.id} className={styles.row} data-done="">
                <time className={styles.time}>{when(row.startsAt)}</time>
                <div className={styles.who}><b>{row.patient}</b><span>{row.service ?? 'без услуги'}{row.declineReason ? ` · ${row.declineReason}` : ''}</span></div>
                <span className={styles.state}><i data-state={row.status} aria-hidden="true" />{row.status === 'ACCEPTED' ? 'записан' : 'отклонена'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
