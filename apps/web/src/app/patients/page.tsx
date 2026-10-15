'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { useFocus } from '@/lib/focus';

type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  allergies: string[];
  anxiety: string;
  pregnant: boolean;
  anticoagulant: boolean;
  tags: string[];
};

export default function PatientsPage() {
  return <Protected><List /></Protected>;
}

function List() {
  const router = useRouter();
  const { setFocus } = useFocus();
  const [query, setQuery] = useState<string | null>(null);
  const [rows, setRows] = useState<Patient[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setQuery(sessionStorage.getItem('sd.patients.q') ?? '');
  }, []);

  useEffect(() => {
    if (query === null) return;
    sessionStorage.setItem('sd.patients.q', query);
  }, [query]);

  useEffect(() => {
    if (query === null) return;
    const handle = setTimeout(() => {
      api<{ items: Patient[] }>(`/patients?search=${encodeURIComponent(query)}&pageSize=40`)
        .then((res) => setRows(res.items))
        .catch((err: Error) => setError(err.message));
    }, 160);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div>
      <div className="sd-h">
        <div>
          <h1>Пациенты</h1>
          <p>Поиск по фамилии и телефону. Карта открывается сразу.</p>
        </div>
        <input className="sd-input" style={{ maxWidth: 280 }} placeholder="Смирнова или 900" value={query ?? ''} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {error && <p>{error}</p>}
      <div className="sd-card">
        <table className="sd-table">
          <thead><tr><th>Пациент</th><th>Телефон</th><th>Алерты</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              const alerts = [
                ...row.allergies.map((item) => `аллергия ${item}`),
                row.anxiety === 'HIGH' ? 'страх' : '',
                row.pregnant ? 'беременность' : '',
                row.anticoagulant ? 'антикоагулянты' : '',
              ].filter(Boolean);
              return (
                <tr key={row.id} onClick={() => { setFocus({ type: 'patient', id: row.id }); router.push(`/patients/${row.id}`); }}>
                  <td><b>{row.lastName} {row.firstName}</b>{row.tags?.length ? <div className="sd-muted">{row.tags.join(' · ')}</div> : null}</td>
                  <td>{row.phone}</td>
                  <td>{alerts.join(', ') || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="sd-muted" style={{ padding: 12 }}>Никого не нашли.</p>}
      </div>
    </div>
  );
}
