'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type Row = { id: string; at: string; patient: string; doctor: string; missing: string };

export default function QualityPage() {
  return <Protected><Desk /></Protected>;
}

function Desk() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ unfilled: Row[] }>('/market/quality')
      .then((data) => setRows(data.unfilled))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="sd-stack">
      <div className="sd-h">
        <div>
          <h1>Карты</h1>
          <p>{rows ? (rows.length ? `${ruCount(rows.length, ['приём', 'приёма', 'приёмов'])} без диагноза или лечения` : 'Все карты заполнены') : 'Проверяем карты'}</p>
        </div>
      </div>
      {error && <p className="sd-chip danger">{error}</p>}
      {!rows && <div className="sd-skel" style={{ height: 180 }} />}
      {rows?.map((row, index) => (
        <article key={row.id} className="sd-card lead-line sd-inline">
          <div>
            <b>{row.patient}</b>
            <p className="sd-muted">{row.doctor} · нет: {row.missing} · {new Date(row.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <Link className={index === 0 ? 'sd-btn' : 'sd-btn-ghost'} href={`/visits/${row.id}`}>Заполнить</Link>
        </article>
      ))}
      <Warranty />
    </div>
  );
}

function Warranty() {
  const { user } = useAuth();
  const canWrite = user?.permissions.includes('medical.write') ?? false;
  const [items, setItems] = useState<{ id: string; title: string; status: string; patient: { firstName: string; lastName: string } }[]>([]);
  const [patients, setPatients] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [patientId, setPatientId] = useState('');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const load = () => api<{ items: { id: string; title: string; status: string; patient: { firstName: string; lastName: string } }[] }>('/market/warranty')
    .then((data) => setItems(data.items))
    .catch(() => undefined);

  useEffect(() => { void load(); }, []);

  const open = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await api('/market/warranty', { method: 'POST', body: JSON.stringify({ patientId, title, reason }) });
      setTitle('');
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Случай не открылся');
    }
  };

  if (!canWrite && items.length === 0) return null;
  return (
    <details className="sd-card">
      <summary>{items.length ? ruCount(items.length, ['гарантийный случай', 'гарантийных случая', 'гарантийных случаев']) : 'Гарантия'}</summary>
      {items.map((row) => <p key={row.id}>{row.patient.lastName} {row.patient.firstName} · {row.title} · {row.status}</p>)}
      {canWrite && (
        <form className="sd-inline" style={{ marginTop: 10 }} onSubmit={open}>
          <select className="sd-input" required value={patientId} onFocus={() => { if (!patients.length) void api<{ items: { id: string; firstName: string; lastName: string }[] }>('/patients?pageSize=80').then((res) => setPatients(res.items)); }} onChange={(event) => setPatientId(event.target.value)}>
            <option value="">Пациент</option>
            {patients.map((row) => <option key={row.id} value={row.id}>{row.lastName} {row.firstName}</option>)}
          </select>
          <input className="sd-input" required placeholder="Работа" value={title} onChange={(event) => setTitle(event.target.value)} />
          <input className="sd-input" required placeholder="Почему переделываем" value={reason} onChange={(event) => setReason(event.target.value)} />
          <button className="sd-btn-ghost" type="submit">Открыть случай</button>
        </form>
      )}
      {error && <p className="sd-chip danger">{error}</p>}
    </details>
  );
}

function ruCount(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const form = mod10 === 1 && mod100 !== 11 ? forms[0] : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1] : forms[2];
  return `${n} ${form}`;
}
