'use client';

import { Fragment, useCallback, useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Globe, CalendarPlus, CheckCircle2, Phone, ShieldAlert, Wallet } from 'lucide-react';
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
  offsetMinutes?: number;
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
const ICON = { confirm: Phone, review: ShieldAlert, pay: Wallet, plan: AlertTriangle, request: Globe } as Record<string, typeof Phone>;
/** Wall-clock time in the clinic's zone, whatever zone the device is in. */
const clockAt = (iso: string, offset: number) => {
  const date = new Date(Date.parse(iso) + offset * 60000);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
};

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

  const off = day.offsetMinutes ?? 180;
  const clock = (iso: string) => clockAt(iso, off);
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
  const lanes = cabinetLanes(day.visits);
  const span = dayHours(day.visits, off);
  const at = (iso: string) => ((wallHour(iso, off) - span.from) / (span.to - span.from)) * 100;
  const nowAt = Math.min(100, Math.max(0, ((wallHour(new Date(now).toISOString(), off) - span.from) / (span.to - span.from)) * 100));

  return (
    <div className={styles.page}>
      {error && <p className={styles.error} role="alert"><AlertTriangle size={17} aria-hidden="true" />{error}</p>}
      <div className={styles.grid}>
        <section className={`${styles.m} ${styles.dateM}`} aria-label="Сегодня">
          <div className={styles.date}>
            <div>
              <h1>{title.charAt(0).toUpperCase() + title.slice(1)}</h1>
              <p>{[`${day.counts.total} ${plural(day.counts.total, 'пациент', 'пациента', 'пациентов')}`, summary].filter(Boolean).join(' · ')}</p>
            </div>
            <Link className={styles.book} href="/schedule"><CalendarPlus size={17} aria-hidden="true" />Записать</Link>
          </div>
        </section>

        {week && (
          <section className={`${styles.m} ${styles.weekM}`} aria-label="Неделя">
            <h3>Неделя <em>{new Date(`${day.day}T12:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '')}</em></h3>
            <nav className={styles.week}>
              {week.map((item) => {
                const weekday = new Date(`${item.date}T12:00:00Z`).getUTCDay();
                return (
                  <Link key={item.date} href="/schedule" onClick={() => openDay(item.date)} aria-current={item.date === day.day ? 'date' : undefined} data-weekend={weekday === 0 || weekday === 6}>
                    <small>{WEEKDAYS[weekday]}</small>
                    <b>{Number(item.date.slice(8))}</b>
                    <em>{item.visits || '—'}</em>
                  </Link>
                );
              })}
            </nav>
          </section>
        )}

        {day.money && (
          <section className={`${styles.m} ${styles.moneyM}`} aria-labelledby="money-title">
            <h3 id="money-title">Деньги дня <Link href="/finance">Касса</Link></h3>
            <dl className={styles.kpi}>
              <div><dt>Оплачено</dt><dd>{formatMoney(day.money.revenueToday)}</dd></div>
              <div><dt>Ждём оплаты</dt><dd>{formatMoney(day.money.dueToday)}</dd></div>
            </dl>
          </section>
        )}

        {lead && (
          <article className={`${styles.m} ${styles.pack}`} data-live={chair ? '' : undefined} aria-label={chair ? 'Сейчас в кресле' : 'Следующий пациент'}>
            <div className={styles.band} />
            <div className={styles.face}>
              <h2><Link href={`/patients/${lead.patientId}`}>{lead.patient}</Link></h2>
              <span className={styles.faceSub}>{[lead.cabinet, lead.service, lead.doctor].filter(Boolean).join(' · ') || 'Услуга не указана'}</span>
              <div className={styles.dose} data-over={chair && overrun(lead, now) > 0 ? '' : undefined}>
                {chair ? elapsedLabel(lead.startsAt, now) : clock(lead.startsAt)}
                <small>
                  <i className={styles.k} data-code={chair ? (overrun(lead, now) > 0 ? 'here' : 'chair') : 'next'} />
                  {chair
                    ? overrun(lead, now) > 0
                      ? `в кресле, сверх плана на ${minutesLabel(overrun(lead, now))}`
                      : `в кресле из ${minutesLabel(planned(lead))}`
                    : `следующий, ${untilLabel(lead.startsAt, now)}`}
                  {' · '}{clock(lead.startsAt)}–{clock(lead.endsAt)}
                </small>
              </div>
            </div>
            <dl className={styles.facts}>
              {alertLines(lead.alerts).map((line, index) => (
                <Fragment key={line}><dt>{index === 0 ? 'Внимание' : ''}</dt><dd className={styles.alertDd}>{line}</dd></Fragment>
              ))}
              <dt>Анамнез</dt><dd>{lead.reviewDue ? <span className={styles.warnText}>не подтверждён, нужен до начала</span> : 'подтверждён'}</dd>
              <dt>Долг</dt><dd>{formatMoney(lead.debt ?? 0)}</dd>
              {lead.phone && <><dt>Телефон</dt><dd><a href={`tel:${lead.phone}`}>{lead.phone}</a></dd></>}
            </dl>
            <div className={styles.acts}>
              {lead.next === 'check-in' ? (
                <button type="button" className={styles.primary} disabled={busy === lead.id} onClick={() => void checkIn(lead)}>{busy === lead.id ? 'Отмечаем…' : 'Пациент пришёл'}</button>
              ) : (
                <Link className={styles.primary} href={`/visits/${lead.id}`}>{chair ? 'К приёму' : 'Открыть визит'}<ArrowRight size={17} aria-hidden="true" /></Link>
              )}
              <Link className={styles.ghost} href={`/patients/${lead.patientId}`}>Карта и формула</Link>
            </div>
          </article>
        )}

        <section className={`${styles.m} ${styles.visitsM}`} aria-labelledby="day-title">
          <h3 id="day-title">Записи <em>{day.visits.length} · {day.counts.done} {plural(day.counts.done, 'принят', 'принято', 'принято')}</em></h3>
          {day.visits.length === 0 ? (
            <div className={styles.empty}>
              <p>На сегодня записей нет. Можно записать пациентов из листа ожидания или тех, кто давно не был.</p>
              <div><Link className="sd-btn-ghost" href="/patients">Пациенты</Link><Link className="sd-btn-ghost" href="/schedule">Расписание</Link></div>
            </div>
          ) : (
            <>
              <ol className={styles.rows}>
                {day.visits.map((visit, index) => (
                  <Fragment key={visit.id}>
                    {index === nowIndex && <li className={styles.now} aria-label={`Сейчас ${nowLabel}`}><span>{nowLabel}</span></li>}
                    <li className={styles.row} data-status={visit.status} data-lead={visit.id === lead?.id ? '' : undefined}>
                      <time dateTime={visit.startsAt}>{clock(visit.startsAt)}</time>
                      <div className={styles.who}>
                        <Link href={`/visits/${visit.id}`}>{visit.patient}</Link>
                        <span>{[visit.service, visit.doctor].filter(Boolean).join(' · ')}</span>
                        {visit.alerts.length > 0 && <span className={styles.rowAlert}>{rowAlert(visit.alerts)}</span>}
                      </div>
                      <span className={styles.cab}>{visit.cabinet ?? ''}</span>
                      <span className={styles.st}><i className={styles.k} data-code={codeOf(visit)} />{stateWord(visit)}</span>
                      <span className={styles.act}>
                        {visit.next === 'check-in' && <button type="button" disabled={busy === visit.id} onClick={() => void checkIn(visit)}>{busy === visit.id ? '…' : 'Пришёл'}</button>}
                        {visit.next === 'start' && <Link href={`/visits/${visit.id}`} data-main="">Принять</Link>}
                        {visit.next === 'continue' && <Link href={`/visits/${visit.id}`} data-main="">К приёму</Link>}
                        {visit.next === 'pay' && <Link href={`/finance?patient=${encodeURIComponent(visit.patient.split(' ')[0])}`}>К оплате</Link>}
                        {visit.next === null && visit.status === 'COMPLETED' && <CheckCircle2 size={18} aria-label="Принят" />}
                      </span>
                    </li>
                  </Fragment>
                ))}
                {nowIndex === -1 && <li className={styles.now}><span>{nowLabel}</span></li>}
              </ol>
              <p className={styles.legend} aria-hidden="true">
                <span><i className={styles.k} data-code="chair" />в кресле</span><span><i className={styles.k} data-code="here" />пришёл</span><span><i className={styles.k} data-code="paid" />принят</span><span><i className={styles.k} data-code="owe" />долг</span><span><i className={styles.k} data-code="ok" />подтвердил</span><span><i className={styles.k} data-code="wait" />не подтвердил</span>
              </p>
            </>
          )}
        </section>

        {lanes.length > 0 && (
          <section className={`${styles.m} ${styles.lanesM}`} aria-label="Загрузка кабинетов">
            <h3>Кабинеты <em>{String(span.from).padStart(2, '0')}:00–{String(span.to).padStart(2, '0')}:00 · сейчас {nowLabel}</em></h3>
            <div className={styles.lanes} style={{ '--hours': span.to - span.from } as CSSProperties}>
              {lanes.map((lane) => (
                <Fragment key={lane.name}>
                  <span className={styles.laneName}>{lane.name}</span>
                  <div className={styles.lane}>
                    {lane.visits.map((visit) => (
                      <Link key={visit.id} href={`/visits/${visit.id}`} className={styles.block} data-code={codeOf(visit)} style={{ left: `${at(visit.startsAt)}%`, width: `${Math.max(2, at(visit.endsAt) - at(visit.startsAt))}%` }} title={`${clock(visit.startsAt)}–${clock(visit.endsAt)} ${visit.patient}`}>
                        <span>{visit.patient.split(' ')[0]}</span>
                      </Link>
                    ))}
                    <i className={styles.nowLine} style={{ left: `${nowAt}%` }} aria-hidden="true" />
                  </div>
                </Fragment>
              ))}
              <div className={styles.hours} aria-hidden="true">
                {Array.from({ length: Math.floor((span.to - span.from) / 2) + 1 }, (_, index) => <span key={index} style={{ left: `${((index * 2) / (span.to - span.from)) * 100}%` }}>{String(span.from + index * 2).padStart(2, '0')}</span>)}
              </div>
            </div>
          </section>
        )}

        <section className={`${styles.m} ${styles.attnM}`} aria-labelledby="attention-title">
          <h3 id="attention-title">Требует внимания <em>{day.attention.length || ''}</em></h3>
          {day.attention.length === 0 ? (
            <p className={styles.none}>Всё сделано. Новые задачи появятся здесь сами.</p>
          ) : (
            <ul className={styles.list}>
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

        <section className={`${styles.m} ${styles.sideM}`} aria-label="Завтра и месяц">
          <h3>Завтра</h3>
          <ul className={styles.list}>
            <li><Link href="/schedule"><CalendarPlus size={16} aria-hidden="true" /><span><b>{day.tomorrow} {plural(day.tomorrow, 'пациент', 'пациента', 'пациентов')}</b><small>открыть расписание</small></span></Link></li>
          </ul>
          {month && (
            <>
              <h3>Этот месяц <Link href="/analytics">Аналитика</Link></h3>
              <dl className={styles.kpi}>
                <div><dt>Выручка</dt><dd>{formatMoney(month.revenue)}</dd></div>
                <div><dt>Визитов</dt><dd>{month.visits}</dd></div>
                <div><dt>Средний чек</dt><dd>{formatMoney(month.avgCheck)}</dd></div>
                <div><dt>Неявки</dt><dd>{month.noShowRate}%</dd></div>
              </dl>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function codeOf(visit: Visit) {
  if (visit.status === 'IN_PROGRESS') return 'chair';
  if (visit.status === 'WAITING') return 'here';
  if (visit.status === 'COMPLETED') return (visit.debt ?? 0) > 0 ? 'owe' : 'paid';
  if (visit.status === 'NO_SHOW') return 'gone';
  if (visit.status === 'CONFIRMED') return 'ok';
  return 'wait';
}

function stateWord(visit: Visit) {
  if (visit.status === 'COMPLETED' && (visit.debt ?? 0) > 0) return `долг ${formatMoney(visit.debt ?? 0)}`;
  return STATUS[visit.status] ?? visit.status;
}

/** Hour of the clinic's day, with minutes as a fraction. */
function wallHour(iso: string, offset: number) {
  const date = new Date(Date.parse(iso) + offset * 60000);
  return date.getUTCHours() + date.getUTCMinutes() / 60;
}

function dayHours(visits: Visit[], offset: number) {
  const starts = visits.map((visit) => Math.floor(wallHour(visit.startsAt, offset)));
  const ends = visits.map((visit) => Math.ceil(wallHour(visit.endsAt, offset)));
  const from = Math.min(9, ...starts);
  const to = Math.max(19, ...ends);
  return { from: from % 2 ? from - 1 : from, to: Math.min(24, to % 2 ? to + 1 : to) };
}

function cabinetLanes(visits: Visit[]) {
  const map = new Map<string, Visit[]>();
  for (const visit of visits) {
    const name = visit.cabinet ?? 'Без кабинета';
    map.set(name, [...(map.get(name) ?? []), visit]);
  }
  return [...map.entries()].map(([name, list]) => ({ name, visits: list })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** A row shows the first warning and how many more; the full list opens with the visit. */
function rowAlert(alerts: string[]) {
  const lines = alertLines(alerts);
  return lines.length > 1 ? `${lines[0]} · ещё ${lines.length - 1}` : lines[0];
}

/** Allergies read as one line, every other warning keeps a line of its own; nothing is cut. */
function alertLines(alerts: string[]) {
  const allergies = alerts.filter((alert) => /^аллергия:/i.test(alert)).map((alert) => alert.replace(/^аллергия:\s*/i, '').toLowerCase());
  const other = alerts.filter((alert) => !/^аллергия:/i.test(alert));
  return [...(allergies.length ? [`Аллергия: ${allergies.join(', ')}`] : []), ...other];
}

const planned = (visit: Visit) => Math.max(0, Math.round((Date.parse(visit.endsAt) - Date.parse(visit.startsAt)) / 60000));
const overrun = (visit: Visit, now: number) => Math.max(0, Math.floor((now - Date.parse(visit.endsAt)) / 60000));
function minutesLabel(minutes: number) {
  return minutes < 60 ? `${minutes} мин` : `${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ''}`;
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
