'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

const SOURCE: Record<string, string> = {
  SITE: 'Сайт',
  CALL: 'Звонок',
  WALK_IN: 'С улицы',
  REFERRAL: 'Рекомендация',
  ADS: 'Реклама',
  DOCTOR: 'Врач',
  'Не указан': 'Не указан',
};

type Alert = { tone: 'danger' | 'warning' | 'info'; text: string };

export function OwnerHome({ data }: { data: {
  revenue: number; avgCheck: number; visits: number; noShows: number; noShowRate: number; loadPercent: number; today: number; ltv: number; branches: number;
  conversion: { accepted: number; abandoned: number; open: number; lost: number; rate: number };
  sources: { source: string; count: number }[];
  series: { day: string; amount: number }[];
} }) {
  const max = Math.max(...data.series.map((p) => p.amount), 1);
  return (
    <div>
      <div className="sd-h">
        <div>
          <h1>Клиника</h1>
          <p>Седракович Дент · {data.branches} филиала в одной базе · сегодня {data.today} записей</p>
        </div>
        <Link className="sd-btn-ghost" href="/return">Воронка планов</Link>
      </div>
      <div className="sd-metrics">
        <Metric label="Выручка месяца" amount={data.revenue} money hint={`средний чек ${formatMoney(data.avgCheck)}`} />
        <Metric label="Визиты" amount={data.visits} hint={`неявки ${data.noShows} · ${data.noShowRate}%`} />
        <Metric label="Загрузка кресел" amount={data.loadPercent} suffix="%" hint="сегодня, от 10 часов" />
        <Metric label="Конверсия планов" amount={data.conversion.rate} suffix="%" hint={`LTV ${formatMoney(data.ltv)}`} />
      </div>
      <Retention />
      <div className="sd-split">
        <section className="sd-card">
          <strong>14 дней</strong>
          <div className="sd-bars" style={{ marginTop: 12 }}>
            {data.series.map((point, index) => (
              <i key={point.day} title={`${point.day}: ${formatMoney(point.amount)}`} style={{ ['--h' as string]: `${Math.max(6, (point.amount / max) * 100)}%`, animationDelay: `${index * 35}ms` }} />
            ))}
          </div>
        </section>
        <section className="sd-card sd-stack">
          <strong>Планы</strong>
          <div className="sd-funnel">
            <div><span className="sd-muted">Принято</span><strong>{data.conversion.accepted}</strong></div>
            <div><span className="sd-muted">В разговоре</span><strong>{data.conversion.open}</strong></div>
            <div><span className="sd-muted">Брошено</span><strong>{data.conversion.abandoned}</strong></div>
          </div>
          <strong>Откуда пациенты</strong>
          {data.sources.map((row) => <div key={row.source} className="sd-row" style={{ gridTemplateColumns: '1fr auto' }}><span>{SOURCE[row.source] ?? row.source}</span><b>{row.count}</b></div>)}
        </section>
      </div>
    </div>
  );
}

export function DoctorHome({ data }: { data: {
  visits: { id: string; startsAt: string; status: string; service: string; patientId: string; patient: string; alerts: Alert[]; prepare: string[] }[];
  incomplete: { patientId: string; patient: string; missing: string }[];
  progress: { done: number; total: number; percent: number };
} }) {
  return (
    <div>
      <div className="sd-h">
        <div>
          <h1>Мой день</h1>
          <p>Планы выполнены на {data.progress.percent}% · {data.progress.done} из {data.progress.total} позиций</p>
        </div>
        <div className="sd-ring" style={{ ['--p' as string]: String(data.progress.percent) }}><strong>{data.progress.percent}%</strong></div>
      </div>
      <div className="sd-split">
        <section className="sd-card">
          {data.visits.length === 0 && <Empty title="День свободен" text="Записей нет. Откройте расписание и поставьте первый визит." />}
          {data.visits.map((visit) => (
            <Link key={visit.id} href={`/visits/${visit.id}`} className="sd-row sd-linkish">
              <span className="sd-time">{time(visit.startsAt)}</span>
              <span>
                <b>{visit.patient}</b>
                <div className="sd-muted">{visit.service}</div>
                <div className="sd-chips">{visit.alerts.map((alert) => <span key={alert.text} className={`sd-chip ${alert.tone}`}>{alert.text}</span>)}</div>
                {visit.prepare.length > 0 && <div className="sd-muted">Готовить: {visit.prepare.join('; ')}</div>}
              </span>
              <span className="sd-muted">{visit.status === 'IN_PROGRESS' ? 'в кресле' : ''}</span>
            </Link>
          ))}
        </section>
        <section className="sd-card">
          <strong>Недозаполнено</strong>
          {data.incomplete.length === 0 && <p className="sd-muted">Согласия на сегодняшних пациентов подписаны.</p>}
          {data.incomplete.map((row) => (
            <Link key={row.patientId} href={`/patients/${row.patientId}`} className="sd-row sd-linkish" style={{ gridTemplateColumns: '1fr' }}>
              <span><b>{row.patient}</b><div className="sd-muted">{row.missing}</div></span>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}

export function DeskHome({ data }: { data: {
  visits: { id: string; startsAt: string; patientId: string; patient: string; doctor: string; cabinet: string; service: string; alerts: Alert[] }[];
  debts: { patientId: string; name: string; phone: string | null; amount: number }[];
  waitlist: { id: string; patientId: string; patient: string; phone: string | null; service: string }[];
} }) {
  return (
    <div>
      <div className="sd-h">
        <div>
          <h1>Стойка</h1>
          <p>Сегодняшнее расписание, долги и лист ожидания</p>
        </div>
        <Link className="sd-btn" href="/schedule">Расписание кресел</Link>
      </div>
      <CallCard />
      <div className="sd-split">
        <section className="sd-card">
          {data.visits.map((visit) => (
            <Link key={visit.id} href={`/visits/${visit.id}`} className="sd-row sd-linkish">
              <span className="sd-time">{time(visit.startsAt)}</span>
              <span>
                <b>{visit.patient}</b>
                <div className="sd-muted">{visit.service} · {visit.doctor} · {visit.cabinet}</div>
                <div className="sd-chips">{visit.alerts.map((alert) => <span key={alert.text} className={`sd-chip ${alert.tone}`}>{alert.text}</span>)}</div>
              </span>
              <span />
            </Link>
          ))}
        </section>
        <div className="sd-stack">
          <section className="sd-card">
            <strong>Долги</strong>
            {data.debts.length === 0 && <p className="sd-muted">Открытых счетов нет.</p>}
            {data.debts.map((debt) => (
              <Link key={debt.patientId} href={`/patients/${debt.patientId}`} className="sd-row sd-linkish" style={{ gridTemplateColumns: '1fr auto' }}>
                <span>{debt.name}<div className="sd-muted">{debt.phone}</div></span>
                <b>{formatMoney(debt.amount)}</b>
              </Link>
            ))}
          </section>
          <section className="sd-card">
            <strong>Лист ожидания</strong>
            {data.waitlist.map((row) => (
              <Link key={row.id} href={`/patients/${row.patientId}`} className="sd-row sd-linkish" style={{ gridTemplateColumns: '1fr' }}>
                <span>{row.patient}<div className="sd-muted">{row.service} · {row.phone}</div></span>
              </Link>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function Retention() {
  const [data, setData] = useState<{
    doctors: { id: string; name: string; visits: number; noShows: number; conversion: number }[];
    followUps: { id: string; patientId: string; patient: string; phone: string | null; dueAt: string; reason: string }[];
    recall: { patientId: string; patient: string; phone: string | null; lastVisit: string | null }[];
    birthdays: { patientId: string; patient: string }[];
  } | null>(null);
  useEffect(() => { api<NonNullable<typeof data>>('/flow/retention').then(setData).catch(() => setData(null)); }, []);
  if (!data) return null;
  return (
    <div className="sd-split" style={{ marginBottom: 12 }}>
      <section className="sd-card">
        <strong>Врачи за месяц</strong>
        <table className="sd-table">
          <thead><tr><th>Врач</th><th>Визиты</th><th>Неявки</th><th>Планы</th></tr></thead>
          <tbody>
            {data.doctors.map((doctor) => (
              <tr key={doctor.id}><td>{doctor.name}</td><td>{doctor.visits}</td><td>{doctor.noShows}</td><td>{doctor.conversion}%</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="sd-card">
        <strong>Удержание</strong>
        {data.followUps.map((item) => (
          <div key={item.id} className="sd-row" style={{ gridTemplateColumns: '1fr auto' }}>
            <span><Link href={`/patients/${item.patientId}`}>{item.patient}</Link><div className="sd-muted">{item.reason}</div></span>
            <button className="sd-btn-ghost" type="button" onClick={() => book(item.patientId, item.patient)}>Записать</button>
          </div>
        ))}
        {data.recall.map((item) => <div key={item.patientId} className="sd-muted">Гигиена: {item.patient}{item.phone ? ` · ${item.phone}` : ''}</div>)}
        {data.birthdays.map((item) => <div key={item.patientId} className="sd-muted">День рождения: {item.patient}</div>)}
        {data.followUps.length === 0 && data.recall.length === 0 && <p className="sd-muted">Открытых задач нет.</p>}
      </section>
    </div>
  );
}

function CallCard() {
  const [phone, setPhone] = useState('');
  const [hits, setHits] = useState<{ id: string; firstName: string; lastName: string; phone: string | null }[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const search = async () => {
    setHits(await api(`/flow/caller?phone=${encodeURIComponent(phone)}`));
  };
  return (
    <section className="sd-card sd-stack" style={{ marginBottom: 12 }}>
      <strong>Звонок</strong>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="sd-input" style={{ maxWidth: 220 }} placeholder="Номер" value={phone} onChange={(event) => setPhone(event.target.value)} />
        <button className="sd-btn" type="button" onClick={() => void search()}>Найти</button>
      </div>
      {hits.map((hit) => (
        <div key={hit.id} className="sd-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
          <span>{hit.lastName} {hit.firstName}<div className="sd-muted">{hit.phone}</div></span>
          <Link className="sd-btn-ghost" href={`/patients/${hit.id}`} style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>Карта</Link>
          <button className="sd-btn-ghost" type="button" onClick={() => book(hit.id, `${hit.lastName} ${hit.firstName}`)}>Записать</button>
        </div>
      ))}
      {phone && hits.length === 0 && (
        <form className="sd-split" onSubmit={async (event) => {
          event.preventDefault();
          const created = await api<{ id: string; lastName: string; firstName: string }>('/patients', { method: 'POST', body: JSON.stringify({ firstName, lastName, phone }) });
          book(created.id, `${created.lastName} ${created.firstName}`);
        }}>
          <input className="sd-input" placeholder="Имя" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
          <input className="sd-input" placeholder="Фамилия" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
          <button className="sd-btn" type="submit">Новый пациент и запись</button>
        </form>
      )}
    </section>
  );
}

function book(id: string, name: string) {
  sessionStorage.setItem('sd_book_patient', JSON.stringify({ id, name }));
  window.location.href = '/schedule';
}

function Metric({ label, amount, suffix = '', money, hint }: { label: string; amount: number; suffix?: string; money?: boolean; hint: string }) {
  const value = useCount(amount);
  const shown = money ? formatMoney(Math.round(value)) : `${Math.round(value)}${suffix}`;
  return (
    <div className="sd-metric">
      <span>{label}</span>
      <strong>{shown}</strong>
      <em>{hint}</em>
    </div>
  );
}

function useCount(value: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 800);
      setN(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return n;
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="sd-empty">
      <span className="sd-empty-mark" />
      <b>{title}</b>
      <p className="sd-muted" style={{ margin: 0 }}>{text}</p>
    </div>
  );
}

function time(value: string) {
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
