'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, CalendarRange, ChevronRight, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useFocus } from '@/lib/focus';
import styles from './assistant.module.css';

type Card =
  | { kind: 'slots'; doctor: { id: string; name: string } | null; durationMin: number; service: string | null; items: { startsAt: string; endsAt: string }[] }
  | { kind: 'patients'; query: string; items: { id: string; name: string; phone: string | null }[] }
  | { kind: 'day'; date: string; items: { id: string; startsAt: string; patientId: string; patient: string; doctor: string | null; service: string | null; status: string }[] }
  | { kind: 'link'; href: string; label: string };
type Message = { role: 'user' | 'assistant'; content: string; cards?: Card[]; error?: boolean };

const IDEAS = ['Свободные окна завтра после 15:00', 'Кто записан сегодня?', 'Найди пациента Орлова', 'Как настроить часы работы врача?'];
const STATUS: Record<string, string> = { SCHEDULED: 'не подтверждён', CONFIRMED: 'подтверждён', WAITING: 'пришёл', IN_PROGRESS: 'в кресле', COMPLETED: 'завершён', NO_SHOW: 'не пришёл' };
const time = (iso: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const dayLabel = (iso: string) => new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(iso));

/**
 * The staff assistant: a side sheet any screen can open. The model only works out what is being asked;
 * every name, time and visit in the answer comes from the clinic's own data, and booking still goes
 * through the usual sheet for a person to confirm.
 */
export function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setFocus } = useFocus();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || enabled !== null) return;
    api<{ enabled: boolean }>('/assistant').then((data) => setEnabled(data.enabled)).catch(() => setEnabled(false));
  }, [open, enabled]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, busy]);

  const send = async (raw: string) => {
    const content = raw.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setText('');
    setBusy(true);
    try {
      const history = next.filter((message) => !message.error).map(({ role, content: body }) => ({ role, content: body }));
      const data = await api<{ reply: string; cards: Card[] }>('/assistant', { method: 'POST', body: JSON.stringify({ messages: history }) });
      setMessages([...next, { role: 'assistant', content: data.reply, cards: data.cards }]);
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: err instanceof Error ? err.message : 'Помощник не ответил', error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const book = (slot: { startsAt: string }, doctorId?: string) => {
    setFocus({ type: 'slot', startsAt: slot.startsAt, doctorId, label: `${dayLabel(slot.startsAt)}, ${time(slot.startsAt)}` });
    onClose();
  };

  if (!open) return null;

  return (
    <div className={styles.back} onMouseDown={onClose}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="assistant-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.head}>
          <span className={styles.mark} aria-hidden="true"><Sparkles size={16} /></span>
          <div>
            <h2 id="assistant-title">Помощник</h2>
            <p>Ищет окна, пациентов и записи. Работает на GigaChat, данные остаются в России.</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть помощника"><X size={18} /></button>
        </header>

        <div className={styles.list} ref={list} aria-live="polite">
          {enabled === false && <p className={styles.off}>Помощник не подключён: на сервере нет ключа Polza AI.</p>}
          {enabled !== false && messages.length === 0 && (
            <div className={styles.ideas}>
              <p>Спросите своими словами, например:</p>
              {IDEAS.map((idea) => <button key={idea} type="button" onClick={() => void send(idea)}>{idea}<ChevronRight size={16} aria-hidden="true" /></button>)}
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className={message.role === 'user' ? styles.mine : message.error ? styles.fail : styles.theirs}>
              {message.content && <p>{message.content}</p>}
              {message.cards?.map((card, at) => <CardView key={at} card={card} onBook={book} onClose={onClose} />)}
            </div>
          ))}
          {busy && <div className={styles.theirs}><p className={styles.typing}>Ищу…</p></div>}
        </div>

        <form className={styles.compose} onSubmit={(event) => { event.preventDefault(); void send(text); }}>
          <label className="sr-only" htmlFor="assistant-input">Вопрос помощнику</label>
          <textarea
            id="assistant-input"
            ref={input}
            rows={1}
            value={text}
            disabled={enabled === false}
            placeholder="Например: окно у Завена в пятницу вечером"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(text); } }}
          />
          <button type="submit" disabled={busy || !text.trim() || enabled === false} aria-label="Отправить"><ArrowUp size={18} /></button>
        </form>
      </section>
    </div>
  );
}

function CardView({ card, onBook, onClose }: { card: Card; onBook: (slot: { startsAt: string }, doctorId?: string) => void; onClose: () => void }) {
  if (card.kind === 'slots') {
    if (!card.items.length) return <p className={styles.empty}>Свободного времени по этому запросу нет. Попробуйте другой день или время.</p>;
    const days = new Map<string, typeof card.items>();
    for (const slot of card.items) {
      const key = dayLabel(slot.startsAt);
      days.set(key, [...(days.get(key) ?? []), slot]);
    }
    return (
      <div className={styles.card}>
        <p className={styles.cardHead}>{card.doctor?.name ?? 'Любой врач'} · {card.service ?? `${card.durationMin} мин`}</p>
        {[...days].map(([day, slots]) => (
          <div key={day} className={styles.slotDay}>
            <b>{day}</b>
            <div className={styles.slots}>
              {slots.map((slot) => <button key={slot.startsAt} type="button" onClick={() => onBook(slot, card.doctor?.id)}>{time(slot.startsAt)}</button>)}
            </div>
          </div>
        ))}
        <p className={styles.cardNote}>Нажмите время — откроется запись, проверьте и подтвердите.</p>
      </div>
    );
  }
  if (card.kind === 'patients') {
    if (!card.items.length) return <p className={styles.empty}>Пациента «{card.query}» не нашёл.</p>;
    return (
      <ul className={styles.card}>
        {card.items.map((row) => (
          <li key={row.id}><Link href={`/patients/${row.id}`} onClick={onClose}><span>{row.name}</span><small>{row.phone ?? ''}</small><ChevronRight size={16} aria-hidden="true" /></Link></li>
        ))}
      </ul>
    );
  }
  if (card.kind === 'day') {
    const label = dayLabel(`${card.date}T12:00:00`);
    if (!card.items.length) return <p className={styles.empty}>На {label} записей нет.</p>;
    return (
      <div className={styles.card}>
        <p className={styles.cardHead}>{label} · {card.items.length} {plural(card.items.length)}</p>
        <ul>
          {card.items.map((row) => (
            <li key={row.id}>
              <Link href={`/patients/${row.patientId}`} onClick={onClose} className={styles.visit}>
                <time>{time(row.startsAt)}</time>
                <span><b>{row.patient}</b><small>{[row.service, row.doctor, STATUS[row.status]].filter(Boolean).join(' · ')}</small></span>
              </Link>
            </li>
          ))}
        </ul>
        <Link className={styles.cardLink} href="/schedule" onClick={onClose}><CalendarRange size={16} aria-hidden="true" />Открыть расписание</Link>
      </div>
    );
  }
  return <Link className={styles.cardLink} href={card.href} onClick={onClose}>Открыть: {card.label}<ChevronRight size={16} aria-hidden="true" /></Link>;
}

function plural(count: number) {
  const tail = count % 10;
  const teen = count % 100 >= 11 && count % 100 <= 14;
  if (tail === 1 && !teen) return 'запись';
  if (tail >= 2 && tail <= 4 && !teen) return 'записи';
  return 'записей';
}
