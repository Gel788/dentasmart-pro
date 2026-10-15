'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Card = {
  id: string;
  startsAt: string;
  patient: string;
  service: string;
  price: number;
  cabinet: string;
  doctor: string | null;
  status: string;
  risks: { tone: string; text: string }[];
};
type Brief = {
  role: string;
  forecast: number;
  revenueMonth: number;
  risks: number;
  patients: Card[];
  slots: { cabinet: string; startsAt: string }[];
};

export default function BriefingPage() {
  return <Protected><Briefing /></Protected>;
}

function Briefing() {
  const [data, setData] = useState<Brief | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Brief>('/showcase/briefing').then(setData).catch((err: Error) => setError(err.message));
  }, []);
  if (error) return <p className="sd-chip danger">{error}</p>;
  if (!data) return <p className="sd-muted">Собираем утро…</p>;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Доброе утро' : hour < 17 ? 'Добрый день' : 'Добрый вечер';
  return (
    <div className="wow">
      <header className="wow-head">
        <div>
          <p className="wow-kicker">{data.role === 'doctor' ? 'Ваши кресла' : 'Клиника целиком'}</p>
          <h1>{hello}</h1>
          <p>Сегодня {data.patients.length} визитов, {data.risks} пометок, прогноз {formatMoney(data.forecast)}.</p>
        </div>
        <Link className="sd-btn" href="/pulse">Пульс клиники</Link>
      </header>
      <div className="wow-metrics">
        <article style={{ animationDelay: '40ms' }}><span>Прогноз дня</span><strong>{formatMoney(data.forecast)}</strong></article>
        <article style={{ animationDelay: '90ms' }}><span>Выручка месяца</span><strong>{formatMoney(data.revenueMonth)}</strong></article>
        <article style={{ animationDelay: '140ms' }}><span>Риски</span><strong>{data.risks}</strong></article>
        <article style={{ animationDelay: '190ms' }}><span>Пустые окна</span><strong>{data.slots.length}</strong></article>
      </div>
      <div className="wow-grid">
        {data.patients.map((card, index) => (
          <Link key={card.id} href={`/visits/${card.id}`} className="wow-person" style={{ animationDelay: `${220 + index * 40}ms` }}>
            <time>{new Date(card.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>
            <b>{card.patient}</b>
            <p>{card.service} · {card.cabinet}{card.doctor ? ` · ${card.doctor}` : ''}</p>
            <div className="sd-chips">
              {card.risks.length === 0 && <span className="sd-chip">без пометок</span>}
              {card.risks.map((risk) => <span key={risk.text} className={`sd-chip ${risk.tone}`}>{risk.text}</span>)}
            </div>
          </Link>
        ))}
      </div>
      <section className="wow-slots">
        <strong>Куда поставить ещё</strong>
        <div>
          {data.slots.map((slot) => (
            <span key={`${slot.cabinet}-${slot.startsAt}`}>
              {slot.cabinet} · {new Date(slot.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
