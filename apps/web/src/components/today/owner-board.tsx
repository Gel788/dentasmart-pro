'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Sparkline } from '@/components/ui/sparkline';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import styles from './owner-board.module.css';

type Period = { amount: number; previous: number };
type Overview = { today: Period; week: Period; month: Period; series: { date: string; amount: number }[]; debt: { total: number; patients: number }; doctors: { id: string | null; name: string; amount: number }[] };
type Report = {
  visits: { total: number; completed: number; noShows: number; noShowRate: number };
  patients: { seen: number; new: number };
  finance: { averageBill: number } | null;
  series: { date: string; visits: number; completed: number }[];
  byDoctor: { id: string | null; name: string; visits: number; completed: number; noShows: number; chairHours: number; billed: number | null }[];
};

const delta = (now: number, before: number) => (before ? Math.round(((now - before) / Math.abs(before)) * 100) : null);

/** The owner's month on the home screen: figures with their trend, then each doctor as a card. */
export function OwnerBoard({ permissions }: { permissions: string[] }) {
  const money = permissions.includes('finance.read');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    const today = new Date();
    const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const from = iso(new Date(today.getFullYear(), today.getMonth(), 1));
    api<Report>(`/reports?from=${from}&to=${iso(today)}`).then(setReport).catch(() => setReport(null));
    if (money) api<Overview>('/finance/overview').then(setOverview).catch(() => setOverview(null));
  }, [money]);

  if (!report && !overview) return null;
  const visitsSeries = report?.series.map((row) => row.visits) ?? [];
  const change = overview ? delta(overview.month.amount, overview.month.previous) : null;
  const revenueByDoctor = new Map((overview?.doctors ?? []).map((row) => [row.id ?? '', row.amount]));
  const doctors = (report?.byDoctor ?? []).filter((row) => row.visits > 0 || revenueByDoctor.get(row.id ?? ''));

  return (
    <section className={styles.board} aria-labelledby="owner-h">
      <header className={styles.head}>
        <h2 id="owner-h">Этот месяц</h2>
        <nav><Link href="/money">Деньги</Link><Link href="/reports">Отчёты</Link></nav>
      </header>
      <div className={styles.tiles}>
        {overview && (
          <article className={styles.tile}>
            <span>Выручка</span>
            <b>{formatMoney(overview.month.amount)}</b>
            {change !== null ? (
              <small data-trend={change >= 0 ? 'up' : 'down'}>{change >= 0 ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}{change >= 0 ? '+' : ''}{change}% к прошлому месяцу</small>
            ) : <small>сегодня {formatMoney(overview.today.amount)}</small>}
            <Sparkline values={overview.series.map((row) => row.amount)} label="Выручка за 30 дней" />
          </article>
        )}
        {report && (
          <article className={styles.tile}>
            <span>Визиты</span>
            <b>{report.visits.total}</b>
            <small>проведено {report.visits.completed} · пациентов {report.patients.seen}, новых {report.patients.new}</small>
            <Sparkline values={visitsSeries} color="var(--teal, #0f8f84)" label="Визиты по дням" />
          </article>
        )}
        {report?.finance && (
          <article className={styles.tile}>
            <span>Средний чек</span>
            <b>{formatMoney(report.finance.averageBill)}</b>
            <small>по выставленным счетам</small>
          </article>
        )}
        {report && (
          <article className={styles.tile} data-tone={report.visits.noShowRate > 10 ? 'warn' : undefined}>
            <span>Неявки</span>
            <b>{report.visits.noShowRate}%</b>
            <small>{report.visits.noShows} из {report.visits.total} визитов</small>
            <span className={styles.meter} aria-hidden="true"><i style={{ width: `${Math.min(100, report.visits.noShowRate * 3)}%` }} /></span>
          </article>
        )}
        {overview && (
          <article className={styles.tile} data-tone={overview.debt.total > 0 ? 'owe' : undefined}>
            <span>Долги пациентов</span>
            <b>{formatMoney(overview.debt.total)}</b>
            <small>{overview.debt.patients ? `должны ${overview.debt.patients}` : 'долгов нет'}</small>
          </article>
        )}
      </div>
      {doctors.length > 0 && (
        <div className={styles.doctors}>
          {doctors.map((row) => {
            const revenue = revenueByDoctor.get(row.id ?? '');
            return (
              <article key={row.id ?? 'none'} className={styles.doctor}>
                <header><span className={styles.avatar} aria-hidden="true">{row.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('')}</span><b>{row.name}</b></header>
                <dl>
                  <div><dt>Визиты</dt><dd>{row.visits}</dd></div>
                  <div><dt>Прошли</dt><dd>{row.completed}</dd></div>
                  <div><dt>Неявки</dt><dd data-warn={row.noShows > 0 || undefined}>{row.noShows}</dd></div>
                  <div><dt>Часов</dt><dd>{row.chairHours}</dd></div>
                  {revenue !== undefined && <div className={styles.wide}><dt>Выручка</dt><dd>{formatMoney(revenue)}</dd></div>}
                  {revenue === undefined && row.billed !== null && <div className={styles.wide}><dt>Выставлено</dt><dd>{formatMoney(row.billed)}</dd></div>}
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
