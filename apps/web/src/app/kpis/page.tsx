'use client';

import { useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Doctor = {
  id: string;
  name: string;
  specialty: string;
  done: number;
  scheduled: number;
  noShows: number;
  revenue: number;
  conversion: number;
  streak: number;
  goal: number;
  progress: number;
};
type Board = { goal: number; doctors: Doctor[] };

export default function KpiPage() {
  return <Protected><Board /></Protected>;
}

function Board() {
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Board>('/showcase/kpis').then(setData).catch((err: Error) => setError(err.message));
  }, []);
  if (error) return <p className="sd-chip danger">{error}</p>;
  if (!data) return <p className="sd-muted">Считаем месяц…</p>;
  return (
    <div className="wow">
      <header className="wow-head">
        <div>
          <p className="wow-kicker">Личная цель месяца · {data.goal} закрытых визитов</p>
          <h1>Врачи</h1>
          <p>Конверсия планов, серия рабочих дней и место в клинике. Без значков и конфетти.</p>
        </div>
      </header>
      <div className="wow-board">
        {data.doctors.map((doctor, index) => (
          <article key={doctor.id} className={index === 0 ? 'lead' : ''}>
            <div className="wow-rank">{index + 1}</div>
            <div className="jn-ring" style={{ ['--p' as string]: String(doctor.progress) }}><strong>{doctor.progress}%</strong></div>
            <div>
              <b>{doctor.name}</b>
              <p>{doctor.specialty}</p>
              <p className="sd-muted">{doctor.done} из {doctor.goal} визитов · явка {doctor.scheduled ? Math.round(((doctor.scheduled - doctor.noShows) / doctor.scheduled) * 100) : 0}% · серия {doctor.streak} дн.</p>
            </div>
            <div className="wow-kpi-num">
              <strong>{doctor.conversion}%</strong>
              <span>планы</span>
            </div>
            <div className="wow-kpi-num">
              <strong>{formatMoney(doctor.revenue)}</strong>
              <span>закрыто</span>
            </div>
          </article>
        ))}
        {data.doctors.length === 0 && <p className="sd-muted">Врачей в базе нет.</p>}
      </div>
    </div>
  );
}
