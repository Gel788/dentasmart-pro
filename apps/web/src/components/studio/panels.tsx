'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { PatientForm, type PatientSeed } from '@/components/studio/patient-form';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useFocus } from '@/lib/focus';
import { phoneDigits, splitName } from '@/lib/phone';

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

type CatalogItem = { id: string; name: string; price: number; durationMin: number };
type Hit = { id: string; firstName: string; lastName: string; phone: string | null };

export function ContextPanel() {
  const { focus } = useFocus();
  if (focus?.type === 'slot') return <BookPanel />;
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

function BookPanel() {
  const { focus, setFocus, bump } = useFocus();
  const slot = focus?.type === 'slot' ? focus : null;
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<CatalogItem[]>('/workspace/catalog').then(setCatalog).catch(() => setCatalog([]));
    const raw = sessionStorage.getItem('sd_book_patient');
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { id: string; name: string };
      setPatientId(saved.id);
      setPatientName(saved.name);
    } catch {
      sessionStorage.removeItem('sd_book_patient');
    }
  }, []);

  useEffect(() => {
    if (!slot?.appointmentId) return;
    const day = slot.startsAt.slice(0, 10);
    api<Payload>(`/workspace/schedule?date=${day}`).then((board) => {
      const appt = board.appointments.find((item) => item.id === slot.appointmentId);
      if (!appt) return;
      setPatientId(appt.patientId);
      setPatientName(appt.patient);
      const service = catalog.find((item) => item.name === appt.service);
      if (service) setServiceId(service.id);
      const minutes = Math.round((new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()) / 60000);
      if (minutes > 0) setDuration(minutes);
    }).catch(() => undefined);
  }, [slot?.appointmentId, slot?.startsAt, catalog]);

  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    const handle = setTimeout(() => {
      api<Hit[]>(`/workspace/search?q=${encodeURIComponent(query)}`).then(setHits).catch(() => setHits([]));
    }, 160);
    return () => clearTimeout(handle);
  }, [query]);

  if (!slot) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!patientId) { setError('Выберите пациента'); return; }
    setPending(true);
    setError('');
    try {
      const body = {
        patientId,
        startsAt: slot.startsAt,
        durationMin: duration,
        doctorId: slot.doctorId,
        cabinetId: slot.cabinetId,
        serviceId: serviceId || undefined,
      };
      if (slot.appointmentId) {
        await api(`/appointments/${slot.appointmentId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/workspace/appointments', { method: 'POST', body: JSON.stringify(body) });
      }
      bump();
      setFocus({ type: 'patient', id: patientId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось записать');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
    <form className="sd-stack" onSubmit={submit}>
      <strong>{slot.appointmentId ? 'Изменить запись' : 'Новая запись'}</strong>
      <p className="sd-muted">{slot.label}<br />{when(slot.startsAt)}</p>
      <div className="sd-field">
        <label>Пациент</label>
        <input className="sd-input" value={patientName || query} placeholder="Фамилия или телефон" onChange={(e) => { setQuery(e.target.value); setPatientName(''); setPatientId(''); }} />
      </div>
      {hits.length > 0 && !patientId && (
        <div className="sd-card" style={{ padding: 4 }}>
          {hits.map((hit) => (
            <button
              type="button"
              key={hit.id}
              className="sd-cmd"
              onClick={() => { setPatientId(hit.id); setPatientName(`${hit.lastName} ${hit.firstName}`); setHits([]); }}
            >
              {hit.lastName} {hit.firstName}
            </button>
          ))}
        </div>
      )}
      <div className="sd-field">
        <label>Услуга из прайса</label>
        <select className="sd-select" value={serviceId} onChange={(e) => {
          const id = e.target.value;
          setServiceId(id);
          const service = catalog.find((item) => item.id === id);
          if (service) setDuration(service.durationMin);
        }}>
          <option value="">Без услуги</option>
          {catalog.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatMoney(item.price)}</option>)}
        </select>
      </div>
      <div className="sd-field">
        <label>Длительность, мин</label>
        <input className="sd-input" type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
      </div>
      {!patientId && (
        <button className="sd-btn-ghost" type="button" onClick={() => setCreating(true)}>
          {query.trim().length >= 2 && hits.length === 0 ? 'Нет в базе — новый пациент' : 'Новый пациент'}
        </button>
      )}
      {error && <p className="sd-chip danger">{error}</p>}
      <button className="sd-btn" disabled={pending} type="submit">{pending ? 'Записываем…' : slot.appointmentId ? 'Сохранить' : 'Записать'}</button>
      {slot.appointmentId && (
        <button className="sd-btn-ghost" type="button" onClick={() => void api(`/appointments/${slot.appointmentId}`, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }) }).then(() => { bump(); setFocus(null); }).catch((err: Error) => setError(err.message))}>Отменить запись</button>
      )}
    </form>
    <PatientForm
      open={creating}
      seed={seedFromQuery(query)}
      onClose={() => setCreating(false)}
      onSaved={(patient) => {
        setPatientId(patient.id);
        setPatientName(`${patient.lastName} ${patient.firstName}`);
        setQuery('');
        setCreating(false);
      }}
    />
    </>
  );
}

function seedFromQuery(query: string): PatientSeed {
  if (phoneDigits(query).length >= 4) return { phone: query, source: 'WALK_IN' };
  return { ...splitName(query), source: 'WALK_IN' };
}

type Payload = { appointments: { id: string; patientId: string; patient: string; service: string; startsAt: string; endsAt: string }[] };

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
