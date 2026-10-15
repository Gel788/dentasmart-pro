'use client';

import { useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Row = { id: string; code: string | null; name: string; price: number; durationMin: number };

export default function PricePage() {
  return <Protected><Body /></Protected>;
}

function Body() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => { api<Row[]>('/workspace/catalog').then(setRows).catch(() => setRows([])); }, []);
  return (
    <div>
      <div className="sd-h">
        <div>
          <h1>Прайс</h1>
          <p>Позиции плана берут цену отсюда. Скидка считается на строке и на всём варианте.</p>
        </div>
      </div>
      <div className="sd-card">
        <table className="sd-table">
          <thead><tr><th>Код</th><th>Услуга</th><th>Минуты</th><th>Цена</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.code}</td>
                <td>{row.name}</td>
                <td>{row.durationMin}</td>
                <td>{formatMoney(row.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
