'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarPlus, CheckCircle2, Phone, ShieldAlert, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { addDays, weekStart, type RangeDay } from '@/components/schedule/model';
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
  SCHEDULED: 'записан', CONFIRMED: 'подтвердил', WAITING: 'пришёл, ждёт', IN_PROGRESS: 'в кресле', COMPLETED: 'принят', NO_SHOW: 'не пришёл',
};
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const ICON = { confirm: Phone, review: ShieldAlert, pay: Wallet, plan: AlertTriangle } as Record<string, typeof Phone>;
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** The working day: who comes and what to do with each of them, then what else needs a hand. */
export function Today({ owner }: { owner: boolean }) {
  const [day, setDay] = useState<Day | null>(null);
  const [month, setMonth] = useState<Month | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [week, setWeek] = useState<RangeDay[] | null>(null);

  const load = useCallback(() => api<Day>('/workspace/today').then((data) => { setDay(data); setError(''); }).catch((err: Error) => setError(err.message || 'День не загрузился')), []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => { void load(); setNow(Date.now()); }, 60_000);
    return () => window.clearInterval(refresh);
  }, [load]);

  const dayKey = day?.day;
  useEffect(() => {
    if (!dayKey) return;
    const from = weekStart(dayKey);
    api<{ days: RangeDay[] }>(`/workspace/schedule/range?from=${from}&to=${addDays(from, 6)}`).then((data) => setWeek(data.days)).catch(() => setWeek(null));
  }, [dayKey]);

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

  const title = new Date(`${day.day}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/(\d+) /, '$1\u00a0');
  const summary = [
    day.counts.inChair ? `${day.counts.inChair} в кресле` : '',
    day.counts.waiting ? `${day.counts.waiting} ждёт` : '',
    day.counts.done ? `${day.counts.done} принято` : '',
    day.counts.noShow ? `${day.counts.noShow} не пришли` : '',
  ].filter(Boolean).join(' · ');
  const nowIndex = day.visits.findIndex((visit) => Date.parse(visit.startsAt) > now);
  const chair = day.visits.find((visit) => visit.status === 'IN_PROGRESS') ?? null;
  const upcoming = chair ? null : day.visits.find((visit) => Date.parse(visit.startsAt) > now && !['COMPLETED', 'NO_SHOW'].includes(visit.status)) ?? null;
  const lead = chair ?? upcoming;
  const nowLabel = clock(new Date(now).toISOString());

  const openDay = (date: string) => {
    try { sessionStorage.setItem('sd.calendar', JSON.stringify({ view: 'day', axis: 'chair', date, doctor: '' })); } catch { /* the calendar opens on today instead */ }
  };

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <h1 className={styles.title}>{title.charAt(0).toUpperCase() + title.slice(1)}<span> / {day.counts.total} {plural(day.counts.total, 'пациент', 'пациента', 'пациентов')}</span></h1>
        <Link className="sd-btn" href="/schedule"><CalendarPlus size={18} aria-hidden="true" /> Записать</Link>
      </header>
      {summary && <p className={styles.summary}>{summary}</p>}
      {error && <p className={styles.error} role="alert"><AlertTriangle size={17} aria-hidden="true" />{error}</p>}

      {week && (
        <nav className={styles.week} aria-label="Неделя">
          {week.map((item) => {
            const weekday = new Date(`${item.date}T12:00:00Z`).getUTCDay();
            return (
              <Link key={item.date} href="/schedule" onClick={() => openDay(item.date)} className={styles.weekDay} aria-current={item.date === day.day ? 'date' : undefined} data-weekend={weekday === 0 || weekday === 6}>
                <small>{WEEKDAYS[weekday]}</small>
                <b>{Number(item.date.slice(8))}</b>
                <em>{item.visits ? item.visits : '—'}</em>
              </Link>
            );
          })}
        </nav>
      )}

      <div className={styles.body}>
        <div className={styles.work}>
          {lead && (
            <section className={styles.lead} data-live={chair ? '' : undefined} aria-label={chair ? 'Сейчас в кресле' : 'Следующий пациент'}>
              <div className={styles.leadMainCol}>
                <h2 className={styles.leadName}><Link href={`/patients/${lead.patientId}`}>{lead.patient}</Link></h2>
                <p className={styles.leadSub}>
                  {[chair ? 'В кресле' : `Следующий, ${untilLabel(lead.startsAt, now)}`, lead.cabinet, `${clock(lead.startsAt)}–${clock(lead.endsAt)}`, lead.service, lead.doctor].filter(Boolean).join(' · ')}
                </p>
                {(lead.reviewDue || (lead.debt ?? 0) > 0) && (
                  <p className={styles.leadNotes}>
                    {lead.reviewDue && <span data-tone="warn">Анамнез не подтверждён</span>}
                    {(lead.debt ?? 0) > 0 && <span>Долг {formatMoney(lead.debt ?? 0)}</span>}
                  </p>
                )}
                <div className={styles.leadActs}>
                  {lead.next === 'check-in' ? (
                    <button type="button" className={styles.leadPrimary} disabled={busy === lead.id} onClick={() => void checkIn(lead)}>{busy === lead.id ? 'Отмечаем…' : 'Пациент пришёл'}</button>
                  ) : (
                    <Link className={styles.leadPrimary} href={`/visits/${lead.id}`}>{chair ? 'К приёму' : 'Открыть визит'}<ArrowRight size={18} aria-hidden="true" /></Link>
                  )}
                  <Link className={styles.leadGhost} href={`/patients/${lead.patientId}`}>Карта и формула</Link>
                  {lead.phone && <a className={`${styles.leadGhost} ${styles.leadPhone}`} href={`tel:${lead.phone}`} aria-label={`Позвонить ${lead.phone}`}><Phone size={18} aria-hidden="true" /><span>{lead.phone}</span></a>}
                </div>
              </div>
              <span className={styles.leadClock} aria-label={chair ? `Идёт ${elapsedLabel(lead.startsAt, now)}` : `Начало в ${clock(lead.startsAt)}`}>{chair ? elapsedLabel(lead.startsAt, now) : clock(lead.startsAt)}</span>
              {lead.alerts.length > 0 && (
                <div className={styles.leadAlert} role="note" title={lead.alerts.join(' · ')}>
                  <ShieldAlert size={18} aria-hidden="true" />
                  <p>{lead.alerts.join(' · ')}</p>
                </div>
              )}
            </section>
          )}

          <section className={styles.day} aria-labelledby="day-title">
            <h2 id="day-title" className={styles.sectionTitle}>Лента дня</h2>
            {day.visits.length === 0 ? (
              <div className={styles.empty}>
                <p>На сегодня записей нет. Можно записать пациентов из листа ожидания или тех, кто давно не был.</p>
                <div>
                  <Link className="sd-btn-ghost" href="/patients">Пациенты</Link>
                  <Link className="sd-btn-ghost" href="/schedule">Расписание</Link>
                </div>
              </div>
            ) : (
              <ol className={styles.visits}>
                {day.visits.map((visit, index) => (
                  <Fragment key={visit.id}>
                    {index === nowIndex && <li className={styles.now} aria-label={`Сейчас ${nowLabel}`}><span>{nowLabel}</span></li>}
                    <li className={styles.visit} data-status={visit.status} data-lead={visit.id === lead?.id ? '' : undefined}>
                      <time dateTime={visit.startsAt}>{clock(visit.startsAt)}<small>до {clock(visit.endsAt)}</small></time>
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
                {nowIndex === -1 && <li className={styles.now}><span>{nowLabel}</span></li>}
              </ol>
            )}
          </section>
        </div>

        <aside className={styles.side}>
          <section className={styles.block} aria-labelledby="attention-title">
            <h2 id="attention-title" className={styles.sectionTitle}>Требует внимания</h2>
            {day.attention.length === 0 ? (
              <p className={styles.none}>Всё сделано. Новые задачи появятся здесь сами.</p>
            ) : (
              <ul className={styles.attention}>
                {day.attention.map((item) => {
                  const Icon = ICON[item.kind] ?? AlertTriangle;
                  return (
                    <li key={`${item.kind}-${item.href}-${item.title}`}>
                      <Link href={item.href} data-kind={item.kind}>
                        <Icon size={17} aria-hidden="true" />
                        <span><b>{item.title}</b><small>{item.detail}</small></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {day.money && (
            <section className={styles.block} aria-labelledby="money-title">
              <h2 id="money-title" className={styles.sectionTitle}>Деньги сегодня</h2>
              <dl className={styles.money}>
                <div><dt>Принято</dt><dd>{formatMoney(day.money.revenueToday)}</dd></div>
                <div><dt>Ждут оплаты</dt><dd data-tone={day.money.dueToday > 0 ? 'warn' : undefined}>{formatMoney(day.money.dueToday)}</dd></div>
              </dl>
              {day.money.revenueToday + day.money.dueToday > 0 && (
                <div className={styles.moneyBar} aria-hidden="true">
                  <i style={{ flexGrow: day.money.revenueToday }} />
                  <i style={{ flexGrow: day.money.dueToday }} />
                </div>
              )}
              <Link href="/finance" className={styles.link}>Касса <ArrowRight size={15} aria-hidden="true" /></Link>
            </section>
          )}

          {month && (
            <section className={styles.block} aria-labelledby="month-title">
              <h2 id="month-title" className={styles.sectionTitle}>Этот месяц</h2>
              <dl className={styles.month}>
                <div><dt>Выручка</dt><dd>{formatMoney(month.revenue)}</dd></div>
                <div><dt>Визитов</dt><dd>{month.visits}</dd></div>
                <div><dt>Средний чек</dt><dd>{formatMoney(month.avgCheck)}</dd></div>
                <div><dt>Неявки</dt><dd>{month.noShowRate}%</dd></div>
              </dl>
              <Link href="/analytics" className={styles.link}>Аналитика <ArrowRight size={15} aria-hidden="true" /></Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function elapsedLabel(startsAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(startsAt)) / 60000));
  return minutes < 60 ? `${minutes} мин` : `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин`;
}

function untilLabel(startsAt: string, now: number) {
  const minutes = Math.max(0, Math.round((Date.parse(startsAt) - now) / 60000));
  if (minutes < 1) return 'сейчас';
  return minutes < 60 ? `через ${minutes} мин` : `через ${Math.floor(minutes / 60)} ч ${minutes % 60 ? `${minutes % 60} мин` : ''}`.trim();
}

function plural(n: number, one: string, few: string, many: string) {
  const last = n % 10;
  const tens = n % 100;
  if (last === 1 && tens !== 11) return one;
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
}
