'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { downloadReport } from '@/lib/download';
import { formatMoney } from '@/lib/format';

type Quality = {
  unfilled: { id: string; at: string; patient: string; doctor: string; missing: string }[];
  sources: { source: string; revenue: number }[];
};
type Warranty = {
  items: { id: string; title: string; status: string; reason: string; toothNum: number | null; cost: string; patient: { firstName: string; lastName: string }; doctorName: string | null }[];
  byDoctor: { doctor: string; open: number; cost: number }[];
};
type Exchange = {
  keys: { id: string; name: string; token: string }[];
  aggregators: { id: string; name: string; mode: string }[];
  onec: string;
};

const EXPORTS = [
  ['leads', 'Лиды'],
  ['sources', 'Источники'],
  ['unfilled', 'Незаполненные карты'],
  ['warranty', 'Гарантии'],
  ['lab', 'Лаборатория'],
  ['insurance', 'ДМС'],
  ['revenue', 'Выручка'],
] as const;

export default function QualityPage() {
  return <Protected><Desk /></Protected>;
}

function Desk() {
  const [quality, setQuality] = useState<Quality | null>(null);
  const [warranty, setWarranty] = useState<Warranty | null>(null);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('Переделка');
  const [patientId, setPatientId] = useState('');
  const [patients, setPatients] = useState<{ id: string; firstName: string; lastName: string }[]>([]);

  const load = () => {
    api<Quality>('/market/quality').then(setQuality).catch((err: Error) => setError(err.message));
    api<Warranty>('/market/warranty').then(setWarranty).catch(() => undefined);
    api<Exchange>('/market/exchange').then(setExchange).catch(() => setExchange(null));
    api<{ items: { id: string; firstName: string; lastName: string }[] }>('/patients?pageSize=40').then((res) => setPatients(res.items)).catch(() => undefined);
  };

  useEffect(() => { load(); }, []);

  const addCase = async (event: FormEvent) => {
    event.preventDefault();
    await api('/market/warranty', { method: 'POST', body: JSON.stringify({ patientId, title, reason: 'Гарантийный повтор', status: 'OPEN' }) });
    setTitle('Переделка');
    load();
  };

  const book = async (source: string) => {
    const result = await api<{ note: string }>(`/market/aggregators/${source}`, { method: 'POST', body: JSON.stringify({ name: 'Заявка с агрегатора', phone: '+79001230000' }) });
    setNote(result.note);
  };

  return (
    <div className="sd-stack">
      <div className="sd-h">
        <div>
          <h1>Качество и источники</h1>
          <p>Незаполненные карты, гарантийные переделки и выручка по каналу, который привёл пациента.</p>
        </div>
      </div>
      {error && <p className="sd-chip danger">{error}</p>}
      <section className="sd-card sd-stack">
        <strong>Карты без диагноза или лечения</strong>
        {quality?.unfilled.length ? quality.unfilled.map((row) => (
          <div key={row.id} className="sd-inline">
            <div>
              <b>{row.patient}</b>
              <p className="sd-muted">{row.doctor} · не заполнено: {row.missing} · {new Date(row.at).toLocaleString('ru-RU')}</p>
            </div>
            <Link className="sd-btn-ghost" href={`/visits/${row.id}`}>Открыть приём</Link>
          </div>
        )) : <p className="sd-muted">Пустых карт нет.</p>}
      </section>
      <section className="sd-grid-4">
        {quality?.sources.map((row) => (
          <article key={row.source} className="sd-card">
            <span className="sd-muted">{row.source}</span>
            <strong>{formatMoney(row.revenue)}</strong>
            <p>дошло до кассы</p>
          </article>
        ))}
      </section>
      <section className="sd-card sd-stack">
        <strong>Гарантии и переделки</strong>
        <div className="sd-inline">
          {warranty?.byDoctor.map((row) => <span key={row.doctor} className="sd-chip">{row.doctor}: {row.open} открытых</span>)}
        </div>
        {warranty?.items.map((row) => (
          <div key={row.id}>
            <b>{row.patient.lastName} {row.patient.firstName}</b> · {row.title}{row.toothNum ? `, зуб ${row.toothNum}` : ''} · {row.status}
            <p className="sd-muted">{row.reason}{row.doctorName ? ` · ${row.doctorName}` : ''}</p>
          </div>
        ))}
        <form className="sd-inline" onSubmit={addCase}>
          <select className="sd-input" required value={patientId} onChange={(event) => setPatientId(event.target.value)}>
            <option value="">Пациент</option>
            {patients.map((row) => <option key={row.id} value={row.id}>{row.lastName} {row.firstName}</option>)}
          </select>
          <input className="sd-input" value={title} onChange={(event) => setTitle(event.target.value)} />
          <button className="sd-btn" type="submit">Новый случай</button>
        </form>
      </section>
      <section className="sd-card sd-stack">
        <strong>Excel</strong>
        <p className="sd-muted">Файл CSV с разделителем «;» и русской кодировкой. Excel открывает его как таблицу.</p>
        <div className="sd-inline">
          {EXPORTS.map(([type, label]) => (
            <button key={type} className="sd-btn-ghost" type="button" onClick={() => downloadReport(type).catch((err: Error) => setError(err.message))}>{label}</button>
          ))}
        </div>
      </section>
      {exchange && (
        <section className="sd-card sd-stack">
          <strong>Открытый API, агрегаторы и 1С</strong>
          <p className="sd-muted">{exchange.onec}</p>
          {exchange.keys.map((key) => <code key={key.id}>{key.name}: {key.token}</code>)}
          <p className="sd-muted">Заголовок x-api-key. Пример: GET /api/v1/open/patients</p>
          <div className="sd-inline">
            {exchange.aggregators.map((row) => (
              <button key={row.id} className="sd-btn-ghost" type="button" onClick={() => book(row.id)}>{row.name}: {row.mode}</button>
            ))}
            <button className="sd-btn" type="button" onClick={async () => {
              const file = await api<{ note: string; documents: unknown[] }>('/market/export-1c');
              const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = '1c-sales.json';
              link.click();
              URL.revokeObjectURL(url);
              setNote(file.note);
            }}>Скачать JSON для 1С</button>
          </div>
          {note && <p>{note}</p>}
        </section>
      )}
    </div>
  );
}
