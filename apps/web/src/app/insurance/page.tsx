'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Company = { id: string; name: string };
type Policy = { id: string; number: string; letterNumber: string | null; limitAmount: string; insurer: { name: string }; patient: { firstName: string; lastName: string } };
type Bill = { id: string; number: string; patientName: string; amount: string; status: string; insurer: { name: string } };

export default function InsurancePage() {
  return <Protected><Desk /></Protected>;
}

function Desk() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [patients, setPatients] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [name, setName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [insurerId, setInsurerId] = useState('');
  const [number, setNumber] = useState('');
  const [letter, setLetter] = useState('');
  const [error, setError] = useState('');

  const load = () => api<{ insurers: Company[]; policies: Policy[]; bills: Bill[] }>('/market/insurance')
    .then((data) => { setCompanies(data.insurers); setPolicies(data.policies); setBills(data.bills); setInsurerId((current) => current || data.insurers[0]?.id || ''); })
    .catch((err: Error) => setError(err.message));

  useEffect(() => {
    load();
    api<{ items: { id: string; firstName: string; lastName: string }[] }>('/patients?pageSize=40').then((res) => setPatients(res.items)).catch(() => undefined);
  }, []);

  const addCompany = async (event: FormEvent) => {
    event.preventDefault();
    await api('/market/insurers', { method: 'POST', body: JSON.stringify({ name }) });
    setName('');
    load();
  };

  const addPolicy = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await api('/market/policies', { method: 'POST', body: JSON.stringify({ patientId, insurerId, number, letterNumber: letter, limitAmount: 50000 }) });
      setNumber('');
      setLetter('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Полис не сохранился');
    }
  };

  return (
    <div className="sd-stack">
      <div className="sd-h">
        <div>
          <h1>ДМС</h1>
          <p>Полисы и счета страховых.</p>
        </div>
      </div>
      {error && <p className="sd-chip danger">{error}</p>}
      <form className="sd-card sd-stack" onSubmit={addPolicy}>
        <strong>Новый полис</strong>
        <div className="price-fields">
          <label>Пациент
            <select className="sd-input" required value={patientId} onChange={(event) => setPatientId(event.target.value)}>
              <option value="">Выберите</option>
              {patients.map((row) => <option key={row.id} value={row.id}>{row.lastName} {row.firstName}</option>)}
            </select>
          </label>
          <label>Компания
            <select className="sd-input" required value={insurerId} onChange={(event) => setInsurerId(event.target.value)}>
              {companies.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label>Номер полиса<input className="sd-input" required value={number} onChange={(event) => setNumber(event.target.value)} /></label>
          <label>Гарантийное письмо<input className="sd-input" value={letter} onChange={(event) => setLetter(event.target.value)} /></label>
        </div>
        <button className="sd-btn" type="submit" style={{ width: 'fit-content' }}>Сохранить полис</button>
      </form>
      <details className="sd-card">
        <summary>Новая страховая</summary>
        <form className="sd-inline" style={{ marginTop: 10 }} onSubmit={addCompany}>
          <input className="sd-input" required placeholder="Название компании" value={name} onChange={(event) => setName(event.target.value)} />
          <button className="sd-btn-ghost" type="submit">Добавить</button>
        </form>
      </details>
      {policies.map((row) => (
        <article key={row.id} className="sd-card">
          <strong>{row.patient.lastName} {row.patient.firstName}</strong>
          <p>{row.insurer.name} · полис {row.number} · лимит {formatMoney(row.limitAmount)}</p>
          <p>{row.letterNumber ? `Гарантийное письмо ${row.letterNumber}` : 'Письма нет'}</p>
        </article>
      ))}
      <section className="sd-card sd-stack">
        <strong>Реестр для страховой</strong>
        {bills.map((row) => (
          <div key={row.id} className="sd-inline">
            <div>
              <b>{row.number}</b>
              <p className="sd-muted">{row.insurer.name} · {row.patientName} · {formatMoney(row.amount)} · {row.status}</p>
            </div>
            {row.status !== 'SENT' && (
              <button className="sd-btn-ghost" type="button" onClick={() => api(`/market/bills/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'SENT' }) }).then(load)}>Отправлен</button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
