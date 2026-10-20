'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarPlus, CheckCircle2, Phone, ShieldAlert, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import styles from './today.module.css';

type Visit = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patientId: string;
  patient: string;
  phone: string | null;
  service: string;
  doctor: string | null;
  cabinet: string | null;
  alerts: string[];
  reviewDue: boolean;
  debt: number | null;
  next: 'check-in' | 'start' | 'continue' | 'pay' | null;
};
type Attention = { kind: 'confirm' | 'review' | 'pay' | 'plan' | string; title: string; detail: string; href: string };
export type Day = {
  day: string;
  now: string;
  visits: Visit[];
  counts: { total: number; done: number; waiting: number; inChair: number; noShow: number };
  attention: Attention[];
  money: { revenueToday: number; dueToday: number } | null;
  tomorrow: number;
};
type Month = { revenue: number; visits: number; noShowRate: number; avgCheck: number };

const STATUS: Record<string, string> = {
  SCHEDULED: 'записан', CONFIRMED: 'подтвердил', WAITING: 'ждёт', IN_PROGRESS: 'в кресле', COMPLETED: 'принят', NO_SHOW: 'не пришёл',
};
const ICON = { confirm: Phone, review: ShieldAlert, pay: Wallet, plan: AlertTriangle } as Record<string, typeof Phone>;
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** The working day: who comes and what to do with each of them, then what else needs a hand. */
export function Today({ owner }: { owner: boolean }) {
  const [day, setDay] = useState<Day | null>(null);
  const [month, setMonth] = useState<Month | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => api<Day>('/workspace/today').then((data) => { setDay(data); setError(''); }).catch((err: Error) => setError(err.message || 'День не загрузился')), []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => { void load(); setNow(Date.now()); }, 60_000);
    return () => window.clearInterval(refresh);
  }, [load]);

  useEffect(() => {
    if (!owner) return;
    api<Month>('/workspace/home').then(setMonth).catch(() => undefined);
  }, [owner]);

  const checkIn = async (visit: Visit) => {
    setBusy(visit.id);
    setError('');
    try {
      await api(`/flow/visits/${visit.id}/check-in`, { method: 'POST', body: '{}' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось отметить приход');
    } finally {
      setBusy(null);
    }
  };

  if (!day) {
    return error
      ? <div className={styles.failed} role="alert"><p>{error}</p><button type="button" className="sd-btn" onClick={() => void load()}>Повторить</button></div>
      : <div className={styles.page} aria-busy="true"><div className="sd-skel" style={{ height: 40, width: 220 }} /><div className="sd-skel" style={{ height: 320 }} /></div>;
  }

  const title = new Date(`${day.day}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const summary = [
    `${day.counts.total} ${plural(day.counts.total, 'пациент', 'пациента', 'пациентов')}`,
    day.counts.inChair ? `${day.counts.inChair} в кресле` : '',
    day.counts.waiting ? `${day.counts.waiting} ждёт` : '',
    day.counts.done ? `${day.counts.done} принято` : '',
    day.counts.noShow ? `${day.counts.noShow} не пришли` : '',
  ].filter(Boolean).join(' · ');
  const nowIndex = day.visits.findIndex((visit) => Date.parse(visit.startsAt) > now);

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <h1 className={styles.title}>Сегодня<small>{title}</small></h1>
        <Link className="sd-btn" href="/schedule"><CalendarPlus size={18} aria-hidden="true" /> Записать</Link>
      </header>
      <p className={styles.summary}>{day.visits.length ? summary : 'На сегодня записей нет.'}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.body}>
        <section className={styles.day} aria-labelledby="day-title">
          <h2 id="day-title" className="sr-only">Пациенты сегодня</h2>
          {day.visits.length === 0 ? (
            <div className={styles.empty}>
              <p>Свободный день. Можно записать пациентов из листа ожидания или тех, кто давно не был.</p>
              <div>
                <Link className="sd-btn-ghost" href="/patients">Пациенты</Link>
                <Link className="sd-btn-ghost" href="/schedule">Расписание</Link>
              </div>
            </div>
          ) : (
            <ol className={styles.visits}>
              {day.visits.map((visit, index) => (
                <Fragment key={visit.id}>
                  {index === nowIndex && <li className={styles.now} aria-label={`Сейчас ${clock(new Date(now).toISOString())}`}><span>{clock(new Date(now).toISOString())}</span></li>}
                  <li className={styles.visit} data-status={visit.status}>
                    <time dateTime={visit.startsAt}>{clock(visit.startsAt)}<small>{clock(visit.endsAt)}</small></time>
                    <div className={styles.what}>
                      <Link href={`/visits/${visit.id}`} className={styles.name}>{visit.patient}</Link>
                      <span className={styles.sub}>{[visit.service, visit.doctor, visit.cabinet].filter(Boolean).join(' · ')}</span>
                      {(visit.alerts.length > 0 || visit.reviewDue || (visit.debt ?? 0) > 0) && (
                        <span className={styles.flags}>
                          {visit.alerts.slice(0, 3).map((alert) => <span key={alert} data-tone="alert">{alert}</span>)}
                          {visit.reviewDue && !['COMPLETED', 'NO_SHOW'].includes(visit.status) && <span data-tone="warn">анамнез не подтверждён</span>}
                          {(visit.debt ?? 0) > 0 && <span data-tone="money">долг {formatMoney(visit.debt ?? 0)}</span>}
                        </span>
                      )}
                    </div>
                    <span className={styles.status}>{STATUS[visit.status] ?? visit.status}</span>
                    <span className={styles.act}>
                      {visit.next === 'check-in' && <button type="button" className="sd-btn-ghost" disabled={busy === visit.id} onClick={() => void checkIn(visit)}>{busy === visit.id ? '…' : 'Пришёл'}</button>}
                      {visit.next === 'start' && <Link className="sd-btn" href={`/visits/${visit.id}`}>Принять</Link>}
                      {visit.next === 'continue' && <Link className="sd-btn" href={`/visits/${visit.id}`}>К приёму</Link>}
                      {visit.next === 'pay' && <Link className="sd-btn-ghost" href={`/finance?patient=${encodeURIComponent(visit.patient.split(' ')[0])}`}>К оплате</Link>}
                      {visit.next === null && visit.status === 'COMPLETED' && <CheckCircle2 size={20} aria-label="Принят" className={styles.done} />}
                    </span>
                  </li>
                </Fragment>
              ))}
              {nowIndex === -1 && day.visits.length > 0 && <li className={styles.now}><span>{clock(new Date(now).toISOString())}</span></li>}
            </ol>
          )}
        </section>

        <aside className={styles.side}>
          <section className={styles.attention} aria-labelledby="attention-title">
            <h2 id="attention-title">Требует внимания</h2>
            {day.attention.length === 0 ? (
              <p className={styles.none}>Всё сделано. Новые задачи появятся здесь сами.</p>
            ) : (
              <ul>
                {day.attention.map((item) => {
                  const Icon = ICON[item.kind] ?? AlertTriangle;
                  return (
                    <li key={`${item.kind}-${item.href}-${item.title}`}>
                      <Link href={item.href} data-kind={item.kind}>
                        <Icon size={16} aria-hidden="true" />
                        <span><b>{item.title}</b><small>{item.detail}</small></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {day.money && (
            <section className={styles.money} aria-labelledby="money-title">
              <h2 id="money-title">Деньги сегодня</h2>
              <dl>
                <div><dt>Принято</dt><dd>{formatMoney(day.money.revenueToday)}</dd></div>
                <div><dt>Ждут оплаты у сегодняшних</dt><dd data-tone={day.money.dueToday > 0 ? 'warn' : undefined}>{formatMoney(day.money.dueToday)}</dd></div>
              </dl>
              <Link href="/finance" className={styles.link}>Касса</Link>
            </section>
          )}

          {month && (
            <section className={styles.month} aria-labelledby="month-title">
              <h2 id="month-title">Этот месяц</h2>
              <p>Выручка {formatMoney(month.revenue)} · {month.visits} {plural(month.visits, 'визит', 'визита', 'визитов')} · средний чек {formatMoney(month.avgCheck)} · неявки {month.noShowRate}%</p>
              <Link href="/analytics" className={styles.link}>Аналитика</Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const last = n % 10;
  const tens = n % 100;
  if (last === 1 && tens !== 11) return one;
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
}
