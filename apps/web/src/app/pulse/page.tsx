'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Pulse = {
  updatedAt: string;
  chairs: { id: string; name: string; status: 'free' | 'busy' | 'late'; patient: string | null; service: string | null; minutesLate: number }[];
  revenueToday: number;
  revenueMonth: number;
  ticker: { id: string; name: string; amount: number }[];
  funnel: { accepted: number; open: number; abandoned: number; rate: number };
  moneyLeft: number;
  calls: { patientId: string; name: string; phone: string | null; reason: string; amount: number }[];
};

const CHAIR: Record<Pulse['chairs'][number]['status'], string> = { free: 'свободно', busy: 'в работе', late: 'опаздывает' };

export default function PulsePage() {
  return <Protected><PulseBoard /></Protected>;
}

function PulseBoard() {
  const [data, setData] = useState<Pulse | null>(null);
  const [error, setError] = useState('');
  const [called, setCalled] = useState('');
  useEffect(() => {
    const load = () => api<Pulse>('/showcase/pulse').then(setData).catch((err: Error) => setError(err.message));
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, []);
  if (error) return <p className="sd-chip danger">{error}</p>;
  if (!data) return <p className="sd-muted">Подключаем пульс…</p>;
  const max = Math.max(data.funnel.accepted, data.funnel.open, data.funnel.abandoned, 1);
  return (
    <div className="wow wow-pulse">
      <header className="wow-head">
        <div>
          <p className="wow-kicker">Обновляется само</p>
          <h1>Пульс клиники</h1>
        </div>
        <div className="wow-ticker" aria-label="Лента оплат">
          <span>
            {data.ticker.length === 0 && 'Оплат в этом месяце пока нет'}
            {data.ticker.map((row) => `${row.name} ${formatMoney(row.amount)}`).join('   ·   ')}
          </span>
        </div>
      </header>
      <div className="wow-metrics">
        <article><span>Сегодня</span><strong className="wow-count">{formatMoney(data.revenueToday)}</strong></article>
        <article><span>Месяц</span><strong>{formatMoney(data.revenueMonth)}</strong></article>
        <article><span>Конверсия планов</span><strong>{data.funnel.rate}%</strong></article>
        <article><span>Деньги на столе</span><strong>{formatMoney(data.moneyLeft)}</strong></article>
      </div>
      <div className="wow-chairs">
        {data.chairs.map((chair) => (
          <article key={chair.id} className={`wow-chair ${chair.status}`}>
            <em>{CHAIR[chair.status]}{chair.minutesLate ? ` · ${chair.minutesLate} мин` : ''}</em>
            <strong>{chair.name}</strong>
            <p>{chair.patient ?? 'Можно записать'}</p>
            {chair.service && <small>{chair.service}</small>}
          </article>
        ))}
      </div>
      <div className="wow-split">
        <section>
          <strong>Воронка</strong>
          {([
            ['Принято', data.funnel.accepted],
            ['В разговоре', data.funnel.open],
            ['Брошено', data.funnel.abandoned],
          ] as const).map(([label, value]) => (
            <div key={label} className="wow-bar">
              <span>{label}</span>
              <i style={{ width: `${(value / max) * 100}%` }} />
              <b>{value}</b>
            </div>
          ))}
        </section>
        <section>
          <strong>Позвонить в один клик</strong>
          {called && <p className="sd-muted">{called}</p>}
          {data.calls.slice(0, 6).map((row) => (
            <div key={row.patientId} className="wow-call">
              <div>
                <b>{row.name}</b>
                <p>{row.reason} · {formatMoney(row.amount)}</p>
              </div>
              <a
                href={row.phone ? `tel:${row.phone.replace(/[^\d+]/g, '')}` : `/patients/${row.patientId}`}
                onClick={() => setCalled(row.phone ? `Набор ${row.name}` : 'Телефона нет, открыта карта')}
              >
                {row.phone ? 'Звонок' : 'Карта'}
              </a>
            </div>
          ))}
          {data.calls.length === 0 && <p className="sd-muted">Непринятых планов нет.</p>}
          <Link className="sd-btn-ghost" href="/autopilot" style={{ width: 'fit-content', marginTop: 8 }}>Автопилот</Link>
        </section>
      </div>
    </div>
  );
}
