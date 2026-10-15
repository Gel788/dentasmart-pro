'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Desk = {
  curator: { id: string; name: string } | null;
  source: string | null;
  ortho: { classAngle: string | null; notes: string; monthlyFee: string | null; contractSigned: boolean } | null;
  calls: { id: string; phone: string; missed: boolean; createdAt: string; transcript: string | null }[];
  allocations: { id: string; amount: number; procedure: string; toothNum: number | null; paidAt: string }[];
  threads: { id: string; channel: string; subject: string | null }[];
  consents: { id: string; status: string; documentUrl: string | null }[];
  employees: { id: string; firstName: string; lastName: string }[];
  leads: { id: string; status: string; source: string }[];
};

export function MarketStrip({ patientId }: { patientId: string }) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [curatorId, setCuratorId] = useState('');
  const [channel, setChannel] = useState('MAX');
  const [text, setText] = useState('Напоминание о визите');
  const [code, setCode] = useState('');
  const [consentId, setConsentId] = useState('');
  const [hint, setHint] = useState('');
  const [angle, setAngle] = useState('I');
  const [notes, setNotes] = useState('');
  const [fee, setFee] = useState('12000');
  const [open, setOpen] = useState(false);

  const load = () => api<Desk>(`/market/patients/${patientId}`).then((data) => {
    setDesk(data);
    setCuratorId(data.curator?.id ?? '');
    if (data.ortho) {
      setAngle(data.ortho.classAngle || 'I');
      setNotes(data.ortho.notes);
      setFee(data.ortho.monthlyFee ? String(Number(data.ortho.monthlyFee)) : '');
    }
  }).catch(() => setDesk(null));

  useEffect(() => { void load(); }, [patientId]);

  if (!desk) return null;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api<{ demo: boolean }>(`/market/patients/${patientId}/message`, { method: 'POST', body: JSON.stringify({ channel, body: text }) });
    setHint(result.demo ? 'Сообщение записано в карту. Во внешний MAX или VK ничего не ушло.' : 'Сообщение записано в карту.');
    load();
  };

  const sign = async () => {
    const result = await api<{ id: string; code: string; hint: string }>(`/market/patients/${patientId}/esign`, { method: 'POST', body: JSON.stringify({}) });
    setConsentId(result.id);
    setCode(result.code);
    setHint(result.hint);
  };

  const summary = [
    desk.curator?.name ? `куратор ${desk.curator.name}` : 'куратор не назначен',
    desk.calls.length ? ruCount(desk.calls.length, ['звонок', 'звонка', 'звонков']) : 'звонков нет',
    desk.allocations.length ? 'оплата разложена по работам' : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className={open ? 'sd-card sd-stack' : ''}>
      <button className="sd-strip" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <strong>Сопровождение</strong>
        <span>{summary}</span>
        <em>{open ? 'Скрыть' : 'Открыть'}</em>
      </button>
      {open && <>
      <div className="sd-inline">
        <label>Куратор
          <select className="sd-input" value={curatorId} onChange={(event) => {
            setCuratorId(event.target.value);
            void api(`/market/patients/${patientId}/curator`, { method: 'POST', body: JSON.stringify({ curatorId: event.target.value || null }) });
          }}>
            <option value="">Не назначен</option>
            {desk.employees.map((row) => <option key={row.id} value={row.id}>{row.lastName} {row.firstName}</option>)}
          </select>
        </label>
      </div>
      <div>
        <b>Звонки</b>
        {desk.calls.length === 0 && <p className="sd-muted">Звонков по этой карте нет.</p>}
        {desk.calls.map((call) => (
          <p key={call.id}>{call.missed ? 'Пропущенный' : 'Звонок'} · {call.phone} · {new Date(call.createdAt).toLocaleString('ru-RU')}{call.transcript ? ` · ${call.transcript}` : ''}</p>
        ))}
        {desk.leads.map((lead) => <span key={lead.id} className="sd-chip">{lead.source}: {lead.status}</span>)}
      </div>
      <div>
        <b>Оплата по процедурам</b>
        {desk.allocations.length === 0 && <p className="sd-muted">Оплаты ещё не разложены по работам.</p>}
        {desk.allocations.map((row) => (
          <p key={row.id}>{formatMoney(row.amount)} → {row.procedure}{row.toothNum ? `, зуб ${row.toothNum}` : ''}</p>
        ))}
      </div>
      <form className="sd-stack" onSubmit={(event) => { event.preventDefault(); void api(`/market/patients/${patientId}/ortho`, { method: 'POST', body: JSON.stringify({ classAngle: angle, notes, monthlyFee: Number(fee) || 0, contractSigned: true }) }).then(() => setHint('Ортодонтическая карта сохранена')); }}>
        <b>Ортодонтическая карта</b>
        <div className="sd-inline">
          <select className="sd-input" value={angle} onChange={(event) => setAngle(event.target.value)}>
            <option>I</option><option>II</option><option>III</option>
          </select>
          <input className="sd-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Прикус, план" />
          <input className="sd-input" value={fee} onChange={(event) => setFee(event.target.value)} placeholder="Платёж в месяц" />
          <button className="sd-btn-ghost" type="submit">Сохранить</button>
        </div>
      </form>
      <form className="sd-inline" onSubmit={send}>
        <select className="sd-input" value={channel} onChange={(event) => setChannel(event.target.value)}>
          <option value="MAX">MAX</option>
          <option value="VK">VK</option>
          <option value="TELEGRAM">Telegram</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
        <input className="sd-input" value={text} onChange={(event) => setText(event.target.value)} />
        <button className="sd-btn-ghost" type="submit">В карту</button>
        <button className="sd-btn-ghost" type="button" onClick={sign}>Подписать ИДС кодом</button>
      </form>
      {consentId && (
        <form className="sd-inline" onSubmit={(event) => { event.preventDefault(); void api(`/market/esign/${consentId}/confirm`, { method: 'POST', body: JSON.stringify({ code }) }).then(() => setHint('ИДС подписан кодом из SMS (демо).')); }}>
          <input className="sd-input" value={code} onChange={(event) => setCode(event.target.value)} />
          <button className="sd-btn" type="submit">Подтвердить код</button>
        </form>
      )}
      {desk.threads.map((thread) => <p key={thread.id} className="sd-muted">{thread.channel}{thread.subject ? ` · ${thread.subject}` : ''}</p>)}
      {desk.consents.filter((row) => row.status === 'SIGNED').map((row) => <p key={row.id}>Подписано: {row.documentUrl}</p>)}
      {hint && <p>{hint}</p>}
      </>}
    </section>
  );
}

function ruCount(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const form = mod10 === 1 && mod100 !== 11 ? forms[0] : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1] : forms[2];
  return `${n} ${form}`;
}
