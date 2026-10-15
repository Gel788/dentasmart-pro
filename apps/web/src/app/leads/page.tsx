'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';

type Lead = {
  id: string;
  name: string;
  phone: string;
  source: string;
  status: string;
  refusalReason: string | null;
  callbackAt: string | null;
  calls: { missed: boolean }[];
};

const NEXT: Record<string, { status: string; label: string }> = {
  NEW: { status: 'CALLBACK', label: 'Перезвонить' },
  CALLBACK: { status: 'BOOKED', label: 'Записать' },
  BOOKED: { status: 'VISITED', label: 'Пришёл' },
};

export default function LeadsPage() {
  return <Protected><Desk /></Protected>;
}

function Desk() {
  const [items, setItems] = useState<Lead[]>([]);
  const [conversion, setConversion] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = () => api<{ items: Lead[]; conversion: number }>('/market/leads')
    .then((data) => { setItems(data.items); setConversion(data.conversion); })
    .catch((err: Error) => setError(err.message));

  useEffect(() => {
    setFilter(sessionStorage.getItem('sd.leads.filter') || 'ALL');
    void load();
  }, []);

  useEffect(() => {
    if (filter) sessionStorage.setItem('sd.leads.filter', filter);
  }, [filter]);

  const waiting = items.filter((row) => row.status === 'CALLBACK' || row.status === 'NEW').length;
  const visible = !filter || filter === 'ALL' ? items : items.filter((row) => row.status === filter);
  const primaryId = visible.find((row) => NEXT[row.status])?.id;

  const miss = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await api('/market/calls/missed', { method: 'POST', body: JSON.stringify({ phone, name }) });
      setPhone('');
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Звонок не записался');
    }
  };

  const setStatus = async (id: string, status: string, refusalReason?: string) => {
    setError('');
    try {
      await api(`/market/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status, refusalReason }) });
      setRefusing(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Статус не сменился');
    }
  };

  return (
    <div className="sd-stack">
      <div className="sd-h">
        <div>
          <h1>Лиды</h1>
          <p>{waiting ? `${waiting} ждут звонка` : 'Очередь пуста'} · конверсия {conversion}%</p>
        </div>
      </div>
      {error && <p className="sd-chip danger">{error}</p>}
      <form className="sd-card sd-inline" onSubmit={miss}>
        <input className="sd-input" placeholder="Имя" value={name} onChange={(event) => setName(event.target.value)} />
        <input className="sd-input" required placeholder="Телефон пропущенного" value={phone} onChange={(event) => setPhone(event.target.value)} autoFocus />
        <button className={primaryId ? 'sd-btn-ghost' : 'sd-btn'} type="submit">Поставить задачу</button>
      </form>
      <div className="sd-seg">
        {[['ALL', 'Все'], ['CALLBACK', 'Перезвонить'], ['BOOKED', 'Записаны']].map(([key, label]) => (
          <button key={key} type="button" className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>
      <div className="sd-stack">
        {visible.map((row) => {
          const next = NEXT[row.status];
          return (
            <article key={row.id} className="sd-card lead-line sd-inline">
              <div>
                <strong>{row.name}</strong>
                <p className="sd-muted">{row.phone} · {row.source}{row.calls.some((call) => call.missed) ? ' · пропущен' : ''}{row.refusalReason ? ` · ${row.refusalReason}` : ''}</p>
              </div>
              {next && <button className={row.id === primaryId ? 'sd-btn' : 'sd-btn-ghost'} type="button" onClick={() => setStatus(row.id, next.status)}>{next.label}</button>}
              {row.status !== 'REFUSED' && row.status !== 'VISITED' && (
                refusing === row.id
                  ? <form className="sd-inline" onSubmit={(event) => { event.preventDefault(); void setStatus(row.id, 'REFUSED', reason || 'Не назвал'); }}>
                    <input className="sd-input" placeholder="Почему отказались" value={reason} onChange={(event) => setReason(event.target.value)} autoFocus />
                    <button className="sd-btn-ghost" type="submit">Сохранить отказ</button>
                  </form>
                  : <button className="sd-btn-ghost" type="button" onClick={() => setRefusing(row.id)}>Отказ</button>
              )}
            </article>
          );
        })}
        {visible.length === 0 && <p className="sd-muted">В этом списке пусто.</p>}
      </div>
    </div>
  );
}
