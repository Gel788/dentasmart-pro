'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Payload = {
  rows: { familyKey: string; planId: string; title: string; patientId: string; patient: string; phone: string | null; days: number; total: number }[];
  funnel: { accepted: number; abandoned: number; open: number; lost: number; rate: number };
};

export default function ReturnPage() {
  return <Protected><Body /></Protected>;
}

function Body() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Payload>('/workspace/plans/abandoned').then(setData).catch((err: Error) => setError(err.message));
  }, []);
  if (error) return <p>{error}</p>;
  if (!data) return <p className="sd-muted">Считаем воронку…</p>;
  return (
    <div className="sd-stack">
      <div className="sd-h">
        <div>
          <h1>Возврат</h1>
          <p>{data.rows.length ? `${data.rows.length} планов ждут разговора` : 'Брошенных планов нет'}</p>
        </div>
      </div>
      <div className="sd-funnel">
        <div><span className="sd-muted">Принято</span><strong>{data.funnel.accepted}</strong></div>
        <div><span className="sd-muted">В разговоре</span><strong>{data.funnel.open}</strong></div>
        <div><span className="sd-muted">Брошено</span><strong>{data.funnel.abandoned}</strong></div>
        <div><span className="sd-muted">Конверсия</span><strong>{data.funnel.rate}%</strong></div>
      </div>
      <div className="sd-card">
        <table className="sd-table">
          <thead><tr><th>Пациент</th><th>План</th><th>Дней</th><th>Сумма</th><th></th></tr></thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={row.familyKey}>
                <td><Link href={`/patients/${row.patientId}`}>{row.patient}</Link><div className="sd-muted">{row.phone}</div></td>
                <td>{row.title}</td>
                <td>{row.days}</td>
                <td>{formatMoney(row.total)}</td>
                <td><Link className={index === 0 ? 'sd-btn' : 'sd-btn-ghost'} href={`/present/${row.familyKey}`}>Открыть</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && <p className="sd-muted" style={{ padding: 12 }}>Брошенных планов нет.</p>}
      </div>
    </div>
  );
}
