'use client';

import { useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';

type QueueItem = {
  id: string;
  name: string;
  phone: string | null;
  rule: string;
  channel: string;
  message: string;
  status: string;
};
type Board = {
  demo: boolean;
  rules: { id: string; title: string; text: string; count: number }[];
  queue: QueueItem[];
  stats: { queued: number; sentToday: number; sentMonth: number };
};

const RULE: Record<string, string> = { hygiene: 'Гигиена', abandoned: 'План', birthday: 'День рождения' };

export default function AutopilotPage() {
  return <Protected><Autopilot /></Protected>;
}

function Autopilot() {
  const [data, setData] = useState<Board | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = () => api<Board>('/showcase/retention').then((board) => {
    setData(board);
    setPicked(Object.fromEntries(board.queue.map((row) => [row.id, true])));
  }).catch((err: Error) => setError(err.message));

  useEffect(() => { void load(); }, []);

  const send = async () => {
    const ids = Object.entries(picked).filter(([, on]) => on).map(([id]) => id);
    setNotice('');
    try {
      const result = await api<{ sent: number }>('/showcase/retention/send', { method: 'POST', body: JSON.stringify({ ids }) });
      setNotice(`Демо-отправка: ${result.sent} сообщений отмечены как отправленные в Telegram или WhatsApp.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не отправилось');
    }
  };

  if (error && !data) return <p className="sd-chip danger">{error}</p>;
  if (!data) return <p className="sd-muted">Собираем правила…</p>;
  return (
    <div className="wow">
      <header className="wow-head">
        <div>
          <span className="wow-demo">Демо-канал</span>
          <h1>Автопилот возврата</h1>
          <p>Правила смотрят в живую базу. Кнопка не пишет в настоящий мессенджер: сообщение ставится в журнал как отправленное.</p>
        </div>
        <button className="sd-btn" type="button" onClick={() => void send()}>Отправить выбранные</button>
      </header>
      {notice && <p className="wow-note">{notice}</p>}
      <div className="wow-metrics">
        <article><span>В очереди</span><strong>{data.stats.queued}</strong></article>
        <article><span>Отправлено сегодня</span><strong>{data.stats.sentToday}</strong></article>
        <article><span>За месяц</span><strong>{data.stats.sentMonth}</strong></article>
      </div>
      <div className="wow-rules">
        {data.rules.map((rule) => (
          <article key={rule.id}>
            <b>{rule.count}</b>
            <strong>{rule.title}</strong>
            <p>{rule.text}</p>
          </article>
        ))}
      </div>
      <div className="wow-queue">
        {data.queue.map((row) => (
          <label key={row.id}>
            <input type="checkbox" checked={picked[row.id] ?? false} onChange={(event) => setPicked({ ...picked, [row.id]: event.target.checked })} />
            <span>
              <b>{row.name}</b>
              <small>{RULE[row.rule] ?? row.rule} · {row.channel}{row.phone ? ` · ${row.phone}` : ''}</small>
              <p>{row.message}</p>
            </span>
          </label>
        ))}
        {data.queue.length === 0 && <p className="sd-muted">Очередь пустая: гигиена, дни рождения и тихие планы не совпали с правилами.</p>}
      </div>
    </div>
  );
}
