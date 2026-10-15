'use client';

import { useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { api, assetUrl } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Person = { id: string; firstName: string; lastName: string };
type Portal = {
  code: string;
  demoChat: boolean;
  patient: { id: string; firstName: string; lastName: string; phone: string | null; allergies: string[] };
  plan: { id: string; title: string; status: string; total: number; phases: { id: string; title: string; items: string[] }[] } | null;
  appointments: { id: string; startsAt: string; status: string; service: string; doctor: string | null }[];
  payments: { id: string; number: string; status: string; total: number; paid: number; left: number }[];
  photos: { id: string; type: string; fileUrl: string }[];
  reminders: { id: string; channel: string; message: string; status: string }[];
  messages: { id: string; direction: string; body: string }[];
  services: { id: string; name: string; price: number }[];
  slots: { startsAt: string; label: string }[];
};

const TABS = [
  ['plan', 'План'],
  ['visits', 'Визиты'],
  ['pay', 'Оплаты'],
  ['photo', 'Фото'],
  ['book', 'Запись'],
  ['chat', 'Чат'],
] as const;

export default function PortalPage() {
  return <Protected bare><Phone /></Protected>;
}

function Phone() {
  const [people, setPeople] = useState<Person[]>([]);
  const [patientId, setPatientId] = useState('seed-patient-anna');
  const [data, setData] = useState<Portal | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('plan');
  const [serviceId, setServiceId] = useState('');
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = (id: string) => api<Portal>(`/showcase/portal/${id}`).then((payload) => {
    setData(payload);
    setServiceId((current) => current || payload.services[0]?.id || '');
  }).catch((err: Error) => setError(err.message));

  useEffect(() => {
    api<Person[]>('/showcase/patients').then((rows) => {
      setPeople(rows);
      const anna = rows.find((row) => row.id === 'seed-patient-anna') ?? rows[0];
      if (anna) {
        setPatientId(anna.id);
        void load(anna.id);
      }
    }).catch((err: Error) => setError(err.message));
  }, []);

  const book = async (startsAt: string) => {
    setNotice('');
    try {
      await api(`/showcase/portal/${patientId}/book`, { method: 'POST', body: JSON.stringify({ startsAt, serviceId }) });
      setNotice('Визит поставлен в расписание клиники.');
      await load(patientId);
      setTab('visits');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не записали');
    }
  };

  const send = async () => {
    if (!text.trim()) return;
    await api(`/showcase/portal/${patientId}/chat`, { method: 'POST', body: JSON.stringify({ body: text }) });
    setText('');
    await load(patientId);
  };

  const arrive = async () => {
    if (!data) return;
    try {
      const result = await api<{ patient: string }>(`/showcase/check-in`, { method: 'POST', body: JSON.stringify({ code: data.code }) });
      setNotice(`${result.patient} отмечен на стойке.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Код не прошёл');
    }
  };

  return (
    <div className="wow-phone-wrap">
      <div className="wow-phone">
        <header>
          <div>
            <small>Седракович Дент</small>
            <strong>{data ? `${data.patient.firstName}` : 'Кабинет'}</strong>
          </div>
          <select value={patientId} onChange={(event) => { setPatientId(event.target.value); void load(event.target.value); }}>
            {people.map((person) => <option key={person.id} value={person.id}>{person.lastName} {person.firstName}</option>)}
          </select>
        </header>
        {error && <p className="sd-chip danger">{error}</p>}
        {notice && <p className="wow-note">{notice}</p>}
        <div className="wow-phone-body">
          {tab === 'plan' && data && (
            <section>
              <h2>{data.plan?.title ?? 'Плана пока нет'}</h2>
              {data.plan && <p className="wow-price">{formatMoney(data.plan.total)}</p>}
              {data.plan?.phases.map((phase) => (
                <article key={phase.id}><b>{phase.title}</b><p>{phase.items.join(' · ')}</p></article>
              ))}
              <button className="sd-btn" type="button" onClick={() => void arrive()}>Я на месте · {data.code}</button>
            </section>
          )}
          {tab === 'visits' && (
            <section>
              {data?.appointments.map((row) => (
                <article key={row.id}>
                  <b>{new Date(row.startsAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b>
                  <p>{row.service}{row.doctor ? ` · ${row.doctor}` : ''} · {row.status}</p>
                </article>
              ))}
              <h3>Напоминания</h3>
              {data?.reminders.length === 0 && <p className="sd-muted">Пока тишина.</p>}
              {data?.reminders.map((row) => <article key={row.id}><b>{row.channel}</b><p>{row.message}</p></article>)}
            </section>
          )}
          {tab === 'pay' && (
            <section>
              {data?.payments.length === 0 && <p className="sd-muted">Счетов нет.</p>}
              {data?.payments.map((row) => (
                <article key={row.id}>
                  <b>{row.number}</b>
                  <p>{formatMoney(row.paid)} из {formatMoney(row.total)} · остаток {formatMoney(row.left)}</p>
                </article>
              ))}
            </section>
          )}
          {tab === 'photo' && (
            <section className="wow-photos">
              {data?.photos.length === 0 && <p className="sd-muted">Снимков нет.</p>}
              {data?.photos.map((photo) => <img key={photo.id} src={assetUrl(photo.fileUrl)} alt={photo.type} />)}
            </section>
          )}
          {tab === 'book' && (
            <section>
              <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
                {data?.services.map((service) => <option key={service.id} value={service.id}>{service.name} · {formatMoney(service.price)}</option>)}
              </select>
              {data?.slots.map((slot) => (
                <button key={slot.startsAt} className="wow-slot" type="button" onClick={() => void book(slot.startsAt)}>{slot.label}</button>
              ))}
            </section>
          )}
          {tab === 'chat' && (
            <section>
              <span className="wow-demo">Демо-чат</span>
              <div className="wow-chat">
                {data?.messages.map((message) => <p key={message.id} className={message.direction}>{message.body}</p>)}
                {data?.messages.length === 0 && <p className="sd-muted">Напишите клинике. Ответ придёт как пометка демо, не из Telegram.</p>}
              </div>
              <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Сообщение" />
                <button className="sd-btn" type="submit">Отправить</button>
              </form>
            </section>
          )}
        </div>
        <nav>
          {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} type="button" onClick={() => setTab(id)}>{label}</button>)}
        </nav>
      </div>
    </div>
  );
}
