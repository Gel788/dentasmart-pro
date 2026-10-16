'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { api, assetUrl, uploadFile } from '@/lib/api';

const LAB_STATUS = ['RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'REJECTED'] as const;
const LAB_LABEL: Record<string, string> = {
  RECEIVED: 'Принято', IN_PROGRESS: 'В работе', READY: 'Готово', DELIVERED: 'Доставлено', REJECTED: 'Отклонено',
};

type Order = {
  id: string;
  title: string;
  status: string;
  shade?: string;
  patient?: { firstName: string; lastName: string } | null;
  doctor?: { firstName: string; lastName: string } | null;
  dueAt?: string | null;
  costAmount?: string | null;
  stlFileUrl?: string | null;
  labName?: string | null;
  technician?: string | null;
  fittingAt?: string | null;
};

type Person = { id: string; firstName: string; lastName: string };

export default function LabPage() {
  return <Protected><Desk /></Protected>;
}

function Desk() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [patients, setPatients] = useState<Person[]>([]);
  const [doctors, setDoctors] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [patientId, setPatientId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [labName, setLabName] = useState('');
  const [technician, setTechnician] = useState('');
  const [fittingAt, setFittingAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = () => api<Order[]>('/lab/orders').then(setOrders).catch((err: Error) => setError(err.message));
  useEffect(() => {
    void load();
    api<{ items: Person[] }>('/patients?pageSize=200').then((res) => setPatients(res.items)).catch(() => undefined);
    api<Person[]>('/employees').then(setDoctors).catch(() => undefined);
  }, []);

  const cost = orders.reduce((sum, order) => sum + Number(order.costAmount ?? 0), 0);
  const overdue = orders.filter((order) => order.dueAt && !['DELIVERED', 'REJECTED'].includes(order.status) && new Date(order.dueAt) < new Date());

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const body = {
        title,
        patientId: patientId || undefined,
        doctorId: doctorId || undefined,
        dueAt: dueAt || undefined,
        costAmount: costAmount ? Number(costAmount) : undefined,
        labName: labName || undefined,
        technician: technician || undefined,
        fittingAt: fittingAt || undefined,
      };
      if (editing) await api(`/lab/orders/${editing}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/lab/orders', { method: 'POST', body: JSON.stringify(body) });
      setTitle('');
      setCostAmount('');
      setLabName('');
      setTechnician('');
      setCreating(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Наряд не создался');
    }
  };

  const setStatus = (id: string, status: string) =>
    api(`/lab/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(load).catch((err: Error) => setError(err.message));

  return (
    <div className="sd-stack">
      <div className="sd-h">
        <div>
          <h1>Лаборатория</h1>
          <p>{orders.length ? `${ruCount(orders.length, ['наряд', 'наряда', 'нарядов'])} · себестоимость ${cost.toLocaleString('ru-RU')} ₽` : 'Заказ-нарядов пока нет'}</p>
        </div>
        {!creating && <button className="sd-btn" type="button" onClick={() => setCreating(true)}>Новый наряд</button>}
      </div>
      {error && <p className="sd-chip danger">{error}</p>}
      {!!overdue.length && <p className="sd-chip danger">Просрочено: {overdue.map((order) => order.title).join(', ')}</p>}
      {creating && <form className="sd-card sd-stack" onSubmit={create}>
        <strong>Новый наряд</strong>
        <div className="price-fields">
          <label>Работа<input className="sd-input" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Коронка E.max 16" /></label>
          <label>Пациент
            <select className="sd-input" value={patientId} onChange={(event) => setPatientId(event.target.value)}>
              <option value="">Не выбран</option>
              {patients.map((row) => <option key={row.id} value={row.id}>{row.lastName} {row.firstName}</option>)}
            </select>
          </label>
          <label>Врач
            <select className="sd-input" value={doctorId} onChange={(event) => setDoctorId(event.target.value)}>
              <option value="">Не выбран</option>
              {doctors.map((row) => <option key={row.id} value={row.id}>{row.lastName} {row.firstName}</option>)}
            </select>
          </label>
          <label>Лаборатория<input className="sd-input" value={labName} onChange={(event) => setLabName(event.target.value)} /></label>
          <label>Техник<input className="sd-input" value={technician} onChange={(event) => setTechnician(event.target.value)} /></label>
          <label>Примерка<input className="sd-input" type="date" value={fittingAt} onChange={(event) => setFittingAt(event.target.value)} /></label>
          <label>Срок<input className="sd-input" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
          <label>Себестоимость, ₽<input className="sd-input" type="number" min={0} value={costAmount} onChange={(event) => setCostAmount(event.target.value)} /></label>
        </div>
        <div className="sd-inline">
          <button className="sd-btn" type="submit">{editing ? 'Сохранить наряд' : 'Создать наряд'}</button>
          <button className="sd-btn-ghost" type="button" onClick={() => { setCreating(false); setEditing(null); }}>Отмена</button>
        </div>
      </form>}
      {orders.map((order) => (
        <article key={order.id} className="sd-card lead-line sd-inline">
          <div>
            <strong>{order.title}</strong>
            <p className="sd-muted">
              {[
                order.patient ? `${order.patient.lastName} ${order.patient.firstName}` : null,
                order.doctor ? order.doctor.lastName : null,
                order.labName,
                order.technician,
                order.shade ? `оттенок ${order.shade}` : null,
                order.fittingAt ? `примерка ${new Date(order.fittingAt).toLocaleDateString('ru-RU')}` : null,
                order.dueAt ? `срок ${new Date(order.dueAt).toLocaleDateString('ru-RU')}` : null,
                order.costAmount ? `${Number(order.costAmount).toLocaleString('ru-RU')} ₽` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button className="sd-btn-ghost" type="button" onClick={() => {
            setEditing(order.id);
            setCreating(true);
            setTitle(order.title);
            setLabName(order.labName ?? '');
            setTechnician(order.technician ?? '');
            setDueAt(order.dueAt ? order.dueAt.slice(0, 10) : '');
            setFittingAt(order.fittingAt ? order.fittingAt.slice(0, 10) : '');
            setCostAmount(order.costAmount ? String(Number(order.costAmount)) : '');
            setPatientId(patients.find((row) => row.lastName === order.patient?.lastName && row.firstName === order.patient?.firstName)?.id ?? '');
            setDoctorId(doctors.find((row) => row.lastName === order.doctor?.lastName)?.id ?? '');
          }}>Изменить</button>
          <select className="sd-input" style={{ width: 150 }} aria-label="Статус наряда" value={order.status} onChange={(event) => setStatus(order.id, event.target.value)}>
            {LAB_STATUS.map((status) => <option key={status} value={status}>{LAB_LABEL[status]}</option>)}
          </select>
          {order.stlFileUrl ? (
            <a className="sd-btn-ghost" href={assetUrl(order.stlFileUrl)} target="_blank" rel="noreferrer">Скан</a>
          ) : (
            <label className="sd-btn-ghost">
              Скан
              <input
                type="file"
                accept=".stl,.obj,.ply"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  setError('');
                  try {
                    const fileUrl = await uploadFile(file);
                    await api(`/lab/orders/${order.id}/scan`, { method: 'PATCH', body: JSON.stringify({ fileUrl }) });
                    await load();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Скан не прикрепился');
                  }
                }}
              />
            </label>
          )}
        </article>
      ))}
    </div>
  );
}

function ruCount(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const form = mod10 === 1 && mod100 !== 11 ? forms[0] : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1] : forms[2];
  return `${n} ${form}`;
}
