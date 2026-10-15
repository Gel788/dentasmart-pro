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

const STATUS: Record<string, string> = {
  NEW: 'Новый',
  CALLBACK: 'Перезвонить',
  BOOKED: 'Записан',
  VISITED: 'Был',
  REFUSED: 'Отказ',
};

export default function LeadsPage() {
  return <Protected><Desk /></Protected>;
}

function Desk() {
  const [items, setItems] = useState<Lead[]>([]);
  const [conversion, setConversion] = useState(0);
  const [bySource, setBySource] = useState<{ source: string; total: number; won: number; conversion: number }[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');

  const load = () => api<{ items: Lead[]; conversion: number; bySource: { source: string; total: number; won: number; conversion: number }[] }>('/market/leads')
    .then((data) => { setItems(data.items); setConversion(data.conversion); setBySource(data.bySource); })
    .catch((err: Error) => setError(err.message));

  useEffect(() => {
    setFilter(sessionStorage.getItem('sd.leads.filter') || 'ALL');
    void load();
  }, []);

  useEffect(() => {
    if (filter) sessionStorage.setItem('sd.leads.filter', filter);
  }, [filter]);

  const visible = !filter || filter === 'ALL' ? items : items.filter((row) => row.status === filter);

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

  const setStatus = async (id: string, status: string) => {
    setError('');
    try {
      await api(`/market/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status, refusalReason: status === 'REFUSED' ? reason || 'Не назвал' : undefined }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Статус не сменился');
    }
  };

  return (
    <div className="sd-stack">
      <div className="sd-h">
        <div>
          <h1>Лиды и звонки</h1>
          <p>Заявка живёт до первого визита. Пропущенный звонок сразу становится задачей «перезвонить».</p>
        </div>
        <div className="sd-kpi"><b>{conversion}%</b><span>конверсия администратора</span></div>
      </div>
      {error && <p className="sd-chip danger">{error}</p>}
      <div className="sd-grid-4">
        {bySource.filter((row) => row.total).map((row) => (
          <article key={row.source} className="sd-card">
            <span className="sd-muted">{row.source}</span>
            <strong>{row.won} из {row.total}</strong>
            <p>{row.conversion}% до записи</p>
          </article>
        ))}
      </div>
      <form className="sd-card sd-inline" onSubmit={miss}>
        <input className="sd-input" placeholder="Имя" value={name} onChange={(event) => setName(event.target.value)} />
        <input className="sd-input" required placeholder="Телефон пропущенного" value={phone} onChange={(event) => setPhone(event.target.value)} />
        <button className="sd-btn" type="submit">Пропущенный → задача</button>
      </form>
      <div className="sd-seg">
        {['ALL', 'CALLBACK', 'NEW', 'BOOKED', 'REFUSED'].map((key) => (
          <button key={key} type="button" className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>{key === 'ALL' ? 'Все' : STATUS[key]}</button>
        ))}
      </div>
      <label className="sd-muted">Причина отказа для кнопки «Отказ»
        <input className="sd-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Дорого, страх, подумаю" />
      </label>
      <div className="sd-stack">
        {visible.map((row) => (
          <article key={row.id} className="sd-card sd-stack">
            <div>
              <strong>{row.name}</strong>
              <p className="sd-muted">{row.phone} · {row.source}{row.calls.some((call) => call.missed) ? ' · пропущенный' : ''}</p>
              {row.callbackAt && row.status === 'CALLBACK' && <p>Перезвонить до {new Date(row.callbackAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>}
              {row.refusalReason && <p>Отказ: {row.refusalReason}</p>}
            </div>
            <div className="sd-seg" style={{ flexWrap: 'wrap', height: 'auto' }}>
              {Object.keys(STATUS).map((status) => (
                <button key={status} type="button" className={row.status === status ? 'on' : ''} onClick={() => setStatus(row.id, status)}>{STATUS[status]}</button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
