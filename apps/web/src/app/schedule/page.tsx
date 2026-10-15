'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { useFocus } from '@/lib/focus';

type Appt = {
  id: string; startsAt: string; endsAt: string; status: string; cabinetId: string | null; doctorId: string | null;
  patientId: string; patient: string; doctor: string; cabinet: string; service: string;
};
type Payload = {
  date: string;
  branches: { id: string; name: string; cabinets: { id: string; name: string }[] }[];
  doctors: { id: string; name: string }[];
  appointments: Appt[];
};

const START = 8;
const END = 20;
const HOUR = 48;

export default function SchedulePage() {
  return <Protected><Board /></Protected>;
}

function Board() {
  const { setFocus, revision } = useFocus();
  const router = useRouter();
  const [mode, setMode] = useState<'chair' | 'doctor' | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [over, setOver] = useState<string | null>(null);
  const skipClick = useRef(false);

  useEffect(() => {
    const savedDate = sessionStorage.getItem('sd.schedule.date');
    const savedMode = sessionStorage.getItem('sd.schedule.mode');
    setDate(savedDate || new Date().toISOString().slice(0, 10));
    setMode(savedMode === 'doctor' ? 'doctor' : 'chair');
  }, []);

  useEffect(() => {
    if (!date || !mode) return;
    sessionStorage.setItem('sd.schedule.date', date);
    sessionStorage.setItem('sd.schedule.mode', mode);
  }, [date, mode]);

  useEffect(() => {
    if (!date) return;
    api<Payload>(`/workspace/schedule?date=${date}`).then(setData).catch((err: Error) => setError(err.message));
  }, [date, revision]);

  const columns = useMemo(() => {
    if (!data) return [];
    if (mode === 'doctor') return data.doctors.map((doctor) => ({ id: doctor.id, name: doctor.name, kind: 'doctor' as const }));
    return data.branches.flatMap((branch) => branch.cabinets.map((cabinet) => ({ id: cabinet.id, name: `${branch.name} · ${cabinet.name}`, kind: 'chair' as const })));
  }, [data, mode]);

  const shift = (days: number) => {
    if (!date) return;
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    setDate(next.toISOString().slice(0, 10));
  };

  return (
    <div className="sd-stack">
      <div className="sd-h">
        <div>
          <h1>Расписание</h1>
          <p>Перетащите визит на другое время или кресло. Клик по пустому месту — запись, по визиту — приём.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="sd-seg">
            <button type="button" className={mode !== 'doctor' ? 'on' : ''} onClick={() => setMode('chair')}>Кресла</button>
            <button type="button" className={mode === 'doctor' ? 'on' : ''} onClick={() => setMode('doctor')}>Врачи</button>
          </div>
          <button className="sd-btn-ghost" type="button" onClick={() => shift(-1)}>←</button>
          <input className="sd-input" style={{ width: 150 }} type="date" value={date ?? ''} onChange={(e) => setDate(e.target.value)} />
          <button className="sd-btn-ghost" type="button" onClick={() => shift(1)}>→</button>
        </div>
      </div>
      {error && <p>{error}</p>}
      {!data && !error && (
        <div className="sd-skel-page">
          <div className="sd-skel" style={{ height: 28, width: 220 }} />
          <div className="sd-skel" style={{ height: 420 }} />
        </div>
      )}
      {data && (
        <div className="sd-schedule">
          <div className="sd-sch-head" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(160px, 1fr))` }}>
            <div />
            {columns.map((column) => <div key={column.id}>{column.name}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${columns.length}, minmax(160px, 1fr))` }}>
            <div>
              {Array.from({ length: END - START }, (_, i) => <div key={i} className="sd-hour" style={{ height: HOUR }}>{String(START + i).padStart(2, '0')}:00</div>)}
            </div>
            {columns.map((column) => (
              <div
                key={column.id}
                className={`sd-col ${over === column.id ? 'over' : ''}`}
                style={{ height: (END - START) * HOUR }}
                onDragOver={(event) => { event.preventDefault(); setOver(column.id); }}
                onDragLeave={() => setOver((current) => current === column.id ? null : current)}
                onDrop={(event) => {
                  event.preventDefault();
                  setOver(null);
                  const id = event.dataTransfer.getData('text/plain');
                  const appt = data.appointments.find((item) => item.id === id);
                  if (!appt) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const hours = Math.max(0, Math.min(END - START - 0.5, (event.clientY - rect.top) / HOUR));
                  const snapped = Math.round(hours * 2) / 2;
                  const starts = new Date(`${date}T00:00:00`);
                  starts.setHours(START, 0, 0, 0);
                  starts.setMinutes(snapped * 60);
                  const duration = new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime();
                  const ends = new Date(starts.getTime() + duration);
                  const previous = data;
                  setData({
                    ...data,
                    appointments: data.appointments.map((item) => item.id === id ? {
                      ...item,
                      startsAt: starts.toISOString(),
                      endsAt: ends.toISOString(),
                      cabinetId: column.kind === 'chair' ? column.id : item.cabinetId,
                      doctorId: column.kind === 'doctor' ? column.id : item.doctorId,
                    } : item),
                  });
                  void api(`/appointments/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      startsAt: starts.toISOString(),
                      endsAt: ends.toISOString(),
                      ...(column.kind === 'chair' ? { cabinetId: column.id } : { doctorId: column.id }),
                    }),
                  }).catch((err: Error) => { setData(previous); setError(err.message); });
                }}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('.sd-appt')) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const minutes = Math.floor((event.clientY - rect.top) / HOUR) * 60;
                  const starts = new Date(`${date}T00:00:00`);
                  starts.setHours(START, 0, 0, 0);
                  starts.setMinutes(minutes);
                  setFocus({
                    type: 'slot',
                    startsAt: starts.toISOString(),
                    cabinetId: column.kind === 'chair' ? column.id : undefined,
                    doctorId: column.kind === 'doctor' ? column.id : data.doctors[0]?.id,
                    label: column.name,
                  });
                }}
              >
                {data.appointments.filter((appt) => mode === 'chair' ? appt.cabinetId === column.id : appt.doctorId === column.id).map((appt) => {
                  const start = new Date(appt.startsAt);
                  const end = new Date(appt.endsAt);
                  const top = ((start.getHours() + start.getMinutes() / 60) - START) * HOUR;
                  const height = Math.max(28, ((end.getTime() - start.getTime()) / 3600000) * HOUR);
                  return (
                    <button
                      key={appt.id}
                      className="sd-appt"
                      style={{ top, height }}
                      type="button"
                      draggable
                      onDragStart={(event) => { event.dataTransfer.setData('text/plain', appt.id); event.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { skipClick.current = true; }}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (skipClick.current) { skipClick.current = false; return; }
                        setFocus({ type: 'patient', id: appt.patientId });
                        router.push(`/visits/${appt.id}`);
                      }}
                    >
                      <b>{appt.patient}</b>
                      <small>{appt.service}</small>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
