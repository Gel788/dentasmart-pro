'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, CalendarClock, Wallet } from 'lucide-react';
import { Bars, Sparkline } from '@/components/ui/sparkline';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDateOnly, formatDay, formatMoney } from '@/lib/format';
import styles from './money.module.css';

type Period = { amount: number; previous: number };
type Overview = {
  today: Period; week: Period; month: Period;
  series: { date: string; amount: number }[];
  debt: { total: number; patients: number; top: { patientId: string; name: string; phone: string | null; amount: number; since: string }[] };
  installments: { id: string; dueDate: string; amount: number; overdue: boolean; patientId: string; patient: string; months: number }[];
  doctors: { id: string | null; name: string; amount: number }[];
};

function Change({ now, before }: { now: number; before: number }) {
  if (!before && !now) return <small className={styles.flat}>без движения</small>;
  if (!before) return <small className={styles.up}><ArrowUpRight size={14} aria-hidden="true" />первые деньги за период</small>;
  const change = Math.round(((now - before) / Math.abs(before)) * 100);
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return <small className={change >= 0 ? styles.up : styles.down}><Icon size={14} aria-hidden="true" />{change >= 0 ? '+' : ''}{change}% к тому же времени прошлого периода</small>;
}

/** Money at a glance: what came in, who owes, which instalments fall due, and each doctor's take this month. */
export function MoneyDesk() {
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const allowed = !!user?.permissions.includes('finance.read');

  useEffect(() => {
    if (!allowed) return;
    api<Overview>('/finance/overview').then(setData).catch((err: Error) => setError(err.message || 'Не загрузилось'));
  }, [allowed]);

  const tiles = data ? [
    { key: 'today', label: 'Сегодня', period: data.today, values: data.series.slice(-7).map((row) => row.amount) },
    { key: 'week', label: 'Эта неделя', period: data.week, values: data.series.slice(-14).map((row) => row.amount) },
    { key: 'month', label: 'Этот месяц', period: data.month, values: data.series.map((row) => row.amount) },
  ] : [];
  const overdue = data?.installments.filter((row) => row.overdue) ?? [];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>Деньги</h1>
          <p>Выручка, долги, рассрочки и выручка по врачам. Возвраты вычтены, бонусы не считаются деньгами.</p>
        </div>
        <nav className={styles.links} aria-label="Разделы денег">
          <Link href="/finance">Касса и счета</Link>
          <Link href="/radar">Незакрытые планы</Link>
          <Link href="/employees">Зарплата</Link>
        </nav>
      </header>

      {!allowed && <p className={styles.empty}>Раздел доступен тем, у кого есть право на финансы.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {allowed && !data && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Загружаем деньги" />}

      {data && (
        <>
          <section className={styles.tiles} aria-label="Выручка">
            {tiles.map((tile) => (
              <div key={tile.key} className={styles.tile}>
                <span className={styles.tileLabel}>{tile.label}</span>
                <b>{formatMoney(tile.period.amount)}</b>
                <Change now={tile.period.amount} before={tile.period.previous} />
                <Sparkline values={tile.values} label={`${tile.label}: выручка по дням`} />
              </div>
            ))}
            <div className={styles.tile} data-tone={data.debt.total > 0 ? 'owe' : undefined}>
              <span className={styles.tileLabel}>Долги пациентов</span>
              <b>{formatMoney(data.debt.total)}</b>
              <small className={styles.flat}>{data.debt.patients ? `${data.debt.patients} ${data.debt.patients % 10 === 1 && data.debt.patients % 100 !== 11 ? 'пациент должен' : 'пациента должны'}` : 'все счета оплачены'}</small>
              <span className={styles.tileFoot}>{overdue.length ? `${overdue.length} просроченных платежей по рассрочке` : 'просрочек по рассрочкам нет'}</span>
            </div>
          </section>

          <div className={styles.grid}>
            <section className={styles.m} aria-labelledby="debt-h">
              <header className={styles.mHead}><h2 id="debt-h"><Wallet size={17} aria-hidden="true" />Кто должен</h2><Link href="/finance">Все счета</Link></header>
              {!data.debt.top.length ? <p className={styles.empty}>Долгов нет.</p> : (
                <ul className={styles.rows}>
                  {data.debt.top.map((row) => (
                    <li key={row.patientId}>
                      <Link href={`/patients/${row.patientId}?tab=money`}>
                        <span><b>{row.name}</b><small>{row.phone ?? 'телефона нет'} · счёт с {formatDateOnly(row.since)}</small></span>
                        <em className={styles.owe}>{formatMoney(row.amount)}</em>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.m} aria-labelledby="inst-h">
              <header className={styles.mHead}><h2 id="inst-h"><CalendarClock size={17} aria-hidden="true" />Рассрочки: ближайшие платежи</h2></header>
              {!data.installments.length ? <p className={styles.empty}>В ближайший месяц платежей по рассрочкам нет.</p> : (
                <ul className={styles.rows}>
                  {data.installments.map((row) => (
                    <li key={row.id} data-late={row.overdue || undefined}>
                      <Link href={`/patients/${row.patientId}?tab=money`}>
                        <span><b>{row.patient}</b><small>{row.overdue ? 'просрочен с ' : 'до '}{formatDateOnly(row.dueDate)} · рассрочка на {row.months} мес.</small></span>
                        <em className={row.overdue ? styles.owe : undefined}>{formatMoney(row.amount)}</em>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.m} aria-labelledby="doc-h">
              <header className={styles.mHead}><h2 id="doc-h">Выручка по врачам · этот месяц</h2><Link href="/reports">Отчёты</Link></header>
              {!data.doctors.length ? <p className={styles.empty}>В этом месяце оплат ещё не было.</p> : (
                <div className={styles.pad}><Bars rows={data.doctors.map((row) => ({ label: row.name, value: row.amount }))} format={(value) => formatMoney(value)} /></div>
              )}
            </section>

            <section className={styles.m} aria-labelledby="days-h">
              <header className={styles.mHead}><h2 id="days-h">30 дней по дням</h2></header>
              <div className={styles.pad}>
                <Sparkline values={data.series.map((row) => row.amount)} height={120} label="Выручка за 30 дней" />
                <div className={styles.axis}><span>{formatDay(data.series[0]?.date ?? '')}</span><span>{formatDay(data.series.at(-1)?.date ?? '')}</span></div>
                <p className={styles.best}>
                  Лучший день: <b>{(() => { const best = [...data.series].sort((a, b) => b.amount - a.amount)[0]; return best && best.amount > 0 ? `${formatDay(best.date)} — ${formatMoney(best.amount)}` : 'пока нет'; })()}</b>
                </p>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
