'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useFocus } from '@/lib/focus';

type Brief = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthDate: string | null;
  debt: number;
  alerts: { tone: 'danger' | 'warning' | 'info'; text: string }[];
  next: { startsAt: string; service: string; doctor: string | null } | null;
};


export function ContextPanel() {
  const { focus } = useFocus();
  if (focus?.type === 'patient') return <PatientPanel id={focus.id} />;
  return (
    <div className="sd-stack">
      <strong>Пока пусто</strong>
      <p className="sd-muted">Откройте пациента или свободное окно в расписании.</p>
    </div>
  );
}

function PatientPanel({ id }: { id: string }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api<Brief>(`/workspace/patients/${id}/brief`)
      .then((data) => live && setBrief(data))
      .catch((err: Error) => live && setError(err.message));
    return () => { live = false; };
  }, [id]);

  if (error) return <p>{error}</p>;
  if (!brief) return <p className="sd-muted">Загрузка карты…</p>;
  const age = brief.birthDate ? years(brief.birthDate) : null;
  return (
    <div className="sd-stack">
      <div>
        <strong>{brief.lastName} {brief.firstName}</strong>
        <p className="sd-muted">{age != null ? `${age} лет` : 'возраст не указан'}{brief.phone ? ` · ${brief.phone}` : ''}</p>
      </div>
      <div className="sd-chips">
        {brief.alerts.length ? brief.alerts.map((a) => <span key={a.text} className={`sd-chip ${a.tone}`}>{a.text}</span>) : <span className="sd-chip">Без критичных алертов</span>}
      </div>
      <p>Долг <b>{formatMoney(brief.debt)}</b></p>
      <p className="sd-muted">{brief.next ? `Дальше: ${when(brief.next.startsAt)} · ${brief.next.service}` : 'Ближайшей записи нет'}</p>
      <Link className="sd-btn" href={`/patients/${brief.id}`} style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>Открыть карту</Link>
    </div>
  );
}

function when(value: string) {
  return new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function years(value: string) {
  const born = new Date(value);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
}
