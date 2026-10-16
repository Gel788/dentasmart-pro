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
  const [failed, setFailed] = useState(false);

  const load = () => api<Desk>(`/market/patients/${patientId}`).then((data) => {
    setDesk(data);
    setCuratorId(data.curator?.id ?? '');
    if (data.ortho) {
      setAngle(data.ortho.classAngle || 'I');
      setNotes(data.ortho.notes);
      setFee(data.ortho.monthlyFee ? String(Number(data.ortho.monthlyFee)) : '');
    }
  }).catch(() => { setDesk(null); setFailed(true); });

  useEffect(() => { void load(); }, [patientId]);

  if (!desk) return <p className="sd-muted">{failed ? 'Сопровождение недоступно' : 'Загружаем сопровождение…'}</p>;

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
    <section className="sd-stack">
      <div className="sd-h">
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Сопровождение</h2>
          <p>{summary}</p>
        </div>
      </div>
      <div className="care-grid">
        <div className="sd-card sd-stack">
          <b>Куратор и звонки</b>
          <label className="sd-field">Куратор
            <select className="sd-input" value={curatorId} onChange={(event) => {
              setCuratorId(event.target.value);
              void api(`/market/patients/${patientId}/curator`, { method: 'POST', body: JSON.stringify({ curatorId: event.target.value || null }) });
            }}>
              <option value="">Не назначен</option>
              {desk.employees.map((row) => <option key={row.id} value={row.id}>{row.lastName} {row.firstName}</option>)}
            </select>
          </label>
          {desk.calls.length === 0 && <p className="sd-muted">Звонков по этой карте нет.</p>}
          {desk.calls.map((call) => (
            <p key={call.id}>{call.missed ? 'Пропущенный' : 'Звонок'} · {call.phone} · {new Date(call.createdAt).toLocaleString('ru-RU')}{call.transcript ? ` · ${call.transcript}` : ''}</p>
          ))}
          <div>{desk.leads.map((lead) => <span key={lead.id} className="sd-chip">{lead.source}: {lead.status}</span>)}</div>
        </div>
        <div className="sd-card sd-stack">
          <b>Оплата по процедурам</b>
          {desk.allocations.length === 0 && <p className="sd-muted">Оплаты ещё не разложены по работам.</p>}
          {desk.allocations.map((row) => (
            <p key={row.id}>{formatMoney(row.amount)} → {row.procedure}{row.toothNum ? `, зуб ${row.toothNum}` : ''}</p>
          ))}
        </div>
        <form className="sd-card sd-stack" onSubmit={(event) => { event.preventDefault(); void api(`/market/patients/${patientId}/ortho`, { method: 'POST', body: JSON.stringify({ classAngle: angle, notes, monthlyFee: Number(fee) || 0, contractSigned: true }) }).then(() => setHint('Ортодонтическая карта сохранена')); }}>
          <b>Ортодонтическая карта</b>
          <label className="sd-field">Класс прикуса
            <select className="sd-input" value={angle} onChange={(event) => setAngle(event.target.value)}>
              <option>I</option><option>II</option><option>III</option>
            </select>
          </label>
          <label className="sd-field">Заметки
            <input className="sd-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Прикус, план" />
          </label>
          <label className="sd-field">Платёж в месяц, ₽
            <input className="sd-input" inputMode="numeric" value={fee} onChange={(event) => setFee(event.target.value)} />
          </label>
          <button className="sd-btn-ghost" type="submit">Сохранить карту</button>
        </form>
        <form className="sd-card sd-stack" onSubmit={send}>
          <b>Напоминание</b>
          <label className="sd-field">Канал
            <select className="sd-input" value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="MAX">MAX</option>
              <option value="VK">VK</option>
              <option value="TELEGRAM">Telegram</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select>
          </label>
          <label className="sd-field">Текст сообщения
            <input className="sd-input" value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <div className="sd-inline">
            <button className="sd-btn-ghost" type="submit">В карту</button>
            <button className="sd-btn-ghost" type="button" onClick={sign}>Подписать ИДС кодом</button>
          </div>
        </form>
        {consentId && (
          <form className="sd-card sd-stack" onSubmit={(event) => { event.preventDefault(); void api(`/market/esign/${consentId}/confirm`, { method: 'POST', body: JSON.stringify({ code }) }).then(() => setHint('ИДС подписан кодом из SMS (демо).')); }}>
            <label className="sd-field">Код из SMS
              <input className="sd-input" value={code} onChange={(event) => setCode(event.target.value)} />
            </label>
            <button className="sd-btn" type="submit">Подтвердить код</button>
          </form>
        )}
      </div>
      {desk.threads.map((thread) => <p key={thread.id} className="sd-muted">{thread.channel}{thread.subject ? ` · ${thread.subject}` : ''}</p>)}
      {desk.consents.filter((row) => row.status === 'SIGNED').map((row) => <p key={row.id}>Подписано: {row.documentUrl}</p>)}
      {hint && <p>{hint}</p>}
    </section>
  );
}

function ruCount(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const form = mod10 === 1 && mod100 !== 11 ? forms[0] : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1] : forms[2];
  return `${n} ${form}`;
}
