'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import styles from './reports.module.css';

type Report = {
  period: { from: string; to: string; days: number };
  visits: { total: number; held: number; completed: number; cancelled: number; noShows: number; noShowRate: number };
  patients: { seen: number; new: number; returning: number };
  plans: { itemsDone: number };
  finance: null | { moneyIn: number; refunds: number; net: number; billed: number; invoices: number; averageBill: number; debtNow: number; byMethod: { method: string; amount: number }[] };
  series: { date: string; visits: number; completed: number; money: number | null }[];
  byDoctor: { id: string | null; name: string; visits: number; completed: number; noShows: number; chairHours: number; billed: number | null }[];
  doctors: { id: string; name: string }[];
};

const METHOD: Record<string, string> = { CASH: 'Наличные', CARD: 'Карта', ONLINE: 'Онлайн', DMS: 'ДМС', INSTALLMENT: 'Рассрочка' };
const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function presets() {
  const now = new Date();
  const today = ymd(now);
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const days30 = new Date(now); days30.setDate(now.getDate() - 29);
  return [
    { id: 'today', label: 'Сегодня', from: today, to: today },
    { id: 'week', label: 'Эта неделя', from: ymd(monday), to: today },
    { id: 'month', label: 'Этот месяц', from: ymd(monthStart), to: today },
    { id: 'last', label: 'Прошлый месяц', from: ymd(lastStart), to: ymd(lastEnd) },
    { id: '30', label: '30 дней', from: ymd(days30), to: today },
  ];
}

/** The clinic over a period: visits, patients, money and each doctor, every figure defined below it. */
export function Reports() {
  const { user } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const ranges = useMemo(presets, []);
  const from = params.get('from') ?? ranges[2].from;
  const to = params.get('to') ?? ranges[2].to;
  const doctorId = params.get('doctor') ?? '';
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const money = !!user?.permissions.includes('finance.read');

  const go = (next: { from?: string; to?: string; doctor?: string }) => {
    const query = new URLSearchParams({ from: next.from ?? from, to: next.to ?? to, ...((next.doctor ?? doctorId) ? { doctor: next.doctor ?? doctorId } : {}) });
    router.replace(`/reports?${query}`);
  };

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    api<Report>(`/reports?from=${from}&to=${to}${doctorId ? `&doctorId=${doctorId}` : ''}`)
      .then((report) => { if (live) setData(report); })
      .catch((err: Error) => { if (live) setError(err.message || 'Отчёт не собрался'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [from, to, doctorId]);

  const peak = Math.max(1, ...(data?.series ?? []).map((day) => day.visits));
  const peakMoney = Math.max(1, ...(data?.series ?? []).map((day) => day.money ?? 0));
  const active = ranges.find((range) => range.from === from && range.to === to)?.id;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>Отчёты</h1>
          <p>Визиты, пациенты{money ? ', деньги' : ''} и врачи за период. Цифры считаются из записей, счетов и оплат CRM.</p>
        </div>
      </header>

      <section className={styles.filters} aria-label="Период и врач">
        <div className={styles.ranges} role="group" aria-label="Период">
          {ranges.map((range) => <button key={range.id} type="button" aria-pressed={active === range.id} onClick={() => go({ from: range.from, to: range.to })}>{range.label}</button>)}
        </div>
        <label><span>С</span><input type="date" value={from} max={to} onChange={(event) => event.target.value && go({ from: event.target.value })} /></label>
        <label><span>По</span><input type="date" value={to} min={from} onChange={(event) => event.target.value && go({ to: event.target.value })} /></label>
        <label>
          <span>Врач</span>
          <select value={doctorId} onChange={(event) => go({ doctor: event.target.value })}>
            <option value="">Все врачи</option>
            {(data?.doctors ?? []).map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
          </select>
        </label>
      </section>

      {error && <p className={styles.error} role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</p>}
      {!data && loading && <div className={styles.skeleton} aria-label="Загружаем отчёт" />}

      {data && (
        <div className={styles.body} data-loading={loading || undefined}>
          <section className={styles.tiles} aria-label="Главные показатели">
            <Tile label="Визиты" value={String(data.visits.held)} note={`${data.visits.completed} завершено · ${data.visits.cancelled} отменено`} href={`/schedule`} />
            <Tile label="Неявки" value={`${data.visits.noShowRate}%`} note={`${data.visits.noShows} из ${data.visits.held} неотменённых`} tone={data.visits.noShowRate >= 10 ? 'owe' : undefined} />
            <Tile label="Пациенты" value={String(data.patients.seen)} note={`${data.patients.new} новых · ${data.patients.returning} повторных`} href="/patients" />
            {data.finance ? (
              <>
                <Tile label="Поступило денег" value={formatMoney(data.finance.net)} note={`${formatMoney(data.finance.moneyIn)} оплат − ${formatMoney(data.finance.refunds)} возвратов`} tone="paid" href="/money" />
                <Tile label="Средний счёт" value={formatMoney(data.finance.averageBill)} note={`${data.finance.invoices} счетов на ${formatMoney(data.finance.billed)}`} />
                <Tile label="Долг пациентов сейчас" value={formatMoney(data.finance.debtNow)} note="по открытым счетам на сегодня" tone={data.finance.debtNow > 0 ? 'owe' : undefined} href="/radar" />
              </>
            ) : (
              <Tile label="Выполнено по планам" value={String(data.plans.itemsDone)} note="позиций планов лечения закрыто" />
            )}
          </section>

          {data.series.length > 1 && (
            <section className={styles.m} aria-labelledby="by-day">
              <h2 id="by-day">По дням<em>{data.finance ? 'столбик — визиты, полоса — деньги' : 'визиты по дням'}</em></h2>
              <div className={styles.chart} style={{ ['--n' as string]: data.series.length }}>
                {data.series.map((day) => (
                  <div key={day.date} className={styles.col} title={`${new Date(`${day.date}T12:00:00`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}: ${day.visits} визитов${day.money !== null ? `, ${formatMoney(day.money)}` : ''}`}>
                    <div className={styles.bars}>
                      <i className={styles.visits} style={{ height: `${(day.visits / peak) * 100}%` }} />
                      {day.money !== null && <i className={styles.money} style={{ height: `${(Math.max(0, day.money) / peakMoney) * 100}%` }} />}
                    </div>
                    <small>{new Date(`${day.date}T12:00:00`).getDate()}</small>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className={styles.split}>
            <section className={styles.m} aria-labelledby="doctors">
              <h2 id="doctors">Врачи<em>загрузка за период</em></h2>
              {data.byDoctor.length === 0 ? <p className={styles.none}>За период визитов нет.</p> : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Врач</th><th>Визиты</th><th>Завершено</th><th>Неявки</th><th>Часов в кресле</th>{data.finance && <th>Выставлено</th>}</tr></thead>
                    <tbody>
                      {data.byDoctor.map((row) => (
                        <tr key={row.id ?? 'none'}>
                          <td>{row.id ? <button type="button" className={styles.link} onClick={() => go({ doctor: row.id! })}>{row.name}</button> : row.name}</td>
                          <td>{row.visits}</td><td>{row.completed}</td><td>{row.noShows}</td><td>{row.chairHours}</td>
                          {data.finance && <td>{formatMoney(row.billed ?? 0)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {data.finance && (
              <section className={styles.m} aria-labelledby="methods">
                <h2 id="methods">Способы оплаты<em>за вычетом возвратов</em></h2>
                {data.finance.byMethod.length === 0 ? <p className={styles.none}>Оплат за период нет.</p> : (
                  <ul className={styles.methods}>
                    {data.finance.byMethod.map((row) => (
                      <li key={row.method}><span>{METHOD[row.method] ?? row.method}</span><b>{formatMoney(row.amount)}</b><i style={{ width: `${data.finance!.net > 0 ? Math.max(2, (row.amount / data.finance!.net) * 100) : 0}%` }} /></li>
                    ))}
                  </ul>
                )}
                <div className={styles.exports}>
                  <button type="button" className="sd-btn-ghost" onClick={() => exportCsv(data)}><Download size={16} aria-hidden="true" />Выгрузить отчёт, CSV</button>
                </div>
              </section>
            )}
          </div>

          <section className={styles.defs} aria-label="Как считаются показатели">
            <p><b>Визиты</b> — записи с началом в выбранном периоде, кроме отменённых. <b>Неявки</b> — доля «не пришёл» среди неотменённых визитов. <b>Новые пациенты</b> — у кого это первый неотменённый визит в клинике.</p>
            {data.finance && <p><b>Поступило денег</b> — оплаты наличными, картой, онлайн и по ДМС за период минус возвраты; бонусы не входят. <b>Средний счёт</b> — сумма выставленных за период счетов после скидок, делённая на их число. <b>Долг</b> — остаток по всем открытым счетам на сегодня, без учёта периода.</p>}
            <p>Также: <Link href="/kpis">показатели врачей</Link>, <Link href="/return">возврат пациентов</Link>, <Link href="/radar">радар денег</Link>.</p>
          </section>
        </div>
      )}
    </div>
  );
}

/** The period's figures as a CSV that opens in Excel: totals, then one line per doctor. */
function exportCsv(data: Report) {
  const rows: (string | number)[][] = [
    ['Период', `${data.period.from} — ${data.period.to}`],
    ['Визиты (без отменённых)', data.visits.held], ['Завершено', data.visits.completed], ['Отменено', data.visits.cancelled], ['Неявки', data.visits.noShows],
    ['Пациентов', data.patients.seen], ['Новых', data.patients.new],
    ...(data.finance ? [['Поступило денег, ₽', data.finance.net], ['Возвраты, ₽', data.finance.refunds], ['Выставлено счетов, ₽', data.finance.billed], ['Средний счёт, ₽', data.finance.averageBill], ['Долг сейчас, ₽', data.finance.debtNow]] as (string | number)[][] : []),
    [],
    ['Врач', 'Визиты', 'Завершено', 'Неявки', 'Часов в кресле', ...(data.finance ? ['Выставлено, ₽'] : [])],
    ...data.byDoctor.map((row) => [row.name, row.visits, row.completed, row.noShows, row.chairHours, ...(data.finance ? [row.billed ?? 0] : [])]),
  ];
  const text = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `otchet-${data.period.from}-${data.period.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function Tile({ label, value, note, href, tone }: { label: string; value: string; note: string; href?: string; tone?: 'paid' | 'owe' }) {
  const body = (
    <>
      <span className={styles.tileLabel}>{tone && <i data-code={tone} />}{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </>
  );
  return href ? <Link className={styles.tile} href={href}>{body}</Link> : <div className={styles.tile}>{body}</div>;
}
