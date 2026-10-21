'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp, CalendarRange, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useFocus } from '@/lib/focus';
import styles from './assistant.module.css';

type Card =
  | { kind: 'slots'; doctor: { id: string; name: string } | null; patient: { id: string; name: string } | null; durationMin: number; service: string | null; items: { startsAt: string; endsAt: string }[] }
  | { kind: 'patients'; query: string; items: { id: string; name: string; phone: string | null }[] }
  | { kind: 'day'; date: string; items: { id: string; startsAt: string; patientId: string; patient: string; doctor: string | null; service: string | null; status: string }[] }
  | { kind: 'link'; href: string; label: string };
type Exchange = { id: number; question: string; reply?: string; cards?: Card[]; error?: boolean };

const IDEAS = ['Свободные окна завтра после 15:00', 'Кто записан сегодня?', 'Найди пациента Орлова', 'Как поставить врачу отпуск?'];
const STATUS: Record<string, { code: string; word: string }> = {
  SCHEDULED: { code: 'wait', word: 'не подтверждён' },
  CONFIRMED: { code: 'ok', word: 'подтверждён' },
  WAITING: { code: 'here', word: 'пришёл' },
  IN_PROGRESS: { code: 'chair', word: 'в кресле' },
  COMPLETED: { code: 'done', word: 'завершён' },
  NO_SHOW: { code: 'gone', word: 'не пришёл' },
};
const time = (iso: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const dayKey = (iso: string) => new Date(iso).toDateString();
const weekday = (iso: string) => new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(new Date(iso));
const month = (iso: string) => new Intl.DateTimeFormat('ru-RU', { month: 'long', day: 'numeric' }).format(new Date(iso)).replace(/^\d+\s/, '');
const dayLabel = (iso: string) => new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
const capital = (text: string) => text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1);

/**
 * The staff assistant, opened over any screen: a living glow around the edge of the screen, an orb
 * that breathes while it listens and spins while it looks, and answers that type themselves out over
 * dark glass. The model only works out what was asked; every name and time comes from the clinic's
 * data, and booking still goes through the usual sheet.
 */
export function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setFocus } = useFocus();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [thread, setThread] = useState<Exchange[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open || enabled !== null) return;
    api<{ enabled: boolean }>('/assistant').then((data) => setEnabled(data.enabled)).catch(() => setEnabled(false));
  }, [open, enabled]);

  const close = () => {
    setLeaving(true);
    window.setTimeout(() => { setLeaving(false); onClose(); }, 220);
  };

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [thread, busy]);

  const send = async (raw: string) => {
    const question = raw.trim();
    if (!question || busy || enabled === false) return;
    const id = ++seq.current;
    const history = thread.filter((item) => !item.error).flatMap((item) => [
      { role: 'user' as const, content: item.question },
      ...(item.reply ? [{ role: 'assistant' as const, content: item.reply }] : []),
    ]);
    setThread((items) => [...items, { id, question }]);
    setText('');
    setBusy(true);
    try {
      const data = await api<{ reply: string; cards: Card[] }>('/assistant', { method: 'POST', body: JSON.stringify({ messages: [...history, { role: 'user', content: question }] }) });
      setThread((items) => items.map((item) => (item.id === id ? { ...item, reply: data.reply, cards: data.cards } : item)));
    } catch (err) {
      setThread((items) => items.map((item) => (item.id === id ? { ...item, reply: err instanceof Error ? err.message : 'Помощник не ответил', error: true } : item)));
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };

  const book = (slot: { startsAt: string }, doctorId?: string, patientId?: string) => {
    // The booking sheet picks up a patient handed over this way, as it does from the patient card.
    try {
      if (patientId) sessionStorage.setItem('sd_book_patient', JSON.stringify({ id: patientId }));
    } catch { /* private mode: the patient is chosen on the sheet */ }
    setFocus({ type: 'slot', startsAt: slot.startsAt, doctorId, label: `${dayLabel(slot.startsAt)}, ${time(slot.startsAt)}` });
    onClose();
  };

  if (!open) return null;
  const state = busy ? 'thinking' : text ? 'listening' : 'idle';

  return (
    <div className={styles.scene} data-state={state} data-leaving={leaving || undefined} role="dialog" aria-modal="true" aria-label="Помощник" onMouseDown={close}>
      <div className={styles.edge} aria-hidden="true" />
      <div className={styles.bloom} aria-hidden="true" />

      <div className={styles.stage} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className={styles.close} onClick={close} aria-label="Закрыть помощника"><X size={18} /></button>

        <div className={styles.feed} ref={feed} aria-live="polite">
          {!thread.length && (
            <div className={styles.hello}>
              <Orb big />
              <h2>{enabled === false ? 'Помощник не подключён' : 'Чем помочь?'}</h2>
              <p>{enabled === false ? 'На сервере нет ключа Polza AI.' : 'Найду окно, пациента или запись. Работаю на GigaChat — данные не уходят из России.'}</p>
              {enabled !== false && (
                <div className={styles.ideas}>
                  {IDEAS.map((idea, index) => (
                    <button key={idea} type="button" style={{ animationDelay: `${120 + index * 60}ms` }} onClick={() => void send(idea)}>{idea}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {thread.map((item) => <Answer key={item.id} item={item} onBook={book} onClose={onClose} />)}
        </div>

        <form className={styles.bar} onSubmit={(event) => { event.preventDefault(); void send(text); }}>
          <Orb />
          <label className="sr-only" htmlFor="assistant-input">Вопрос помощнику</label>
          <textarea
            id="assistant-input"
            ref={input}
            rows={1}
            value={text}
            disabled={enabled === false}
            placeholder={busy ? 'Ищу…' : 'Спросите что-нибудь'}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(text); } }}
          />
          <button type="submit" className={styles.send} disabled={busy || !text.trim() || enabled === false} aria-label="Спросить"><ArrowUp size={20} /></button>
        </form>
      </div>
    </div>
  );
}

/** How the assistant is called up: a glowing pill in the menu, a floating orb on a phone. */
export function AssistantTrigger({ variant, onOpen }: { variant: 'nav' | 'fab' | 'inline'; onOpen: () => void }) {
  if (variant === 'fab') {
    return <button type="button" className={`${styles.trigger} ${styles.fab}`} onClick={onOpen} aria-label="Спросить ИИ-помощника"><Orb /></button>;
  }
  return (
    <button type="button" className={`${styles.trigger} ${variant === 'nav' ? styles.nav : styles.inline}`} onClick={onOpen} title="Спросить ИИ (⌘J)">
      <Orb />
      <span className={styles.navLabel}>Спросить ИИ</span>
      {variant === 'nav' && <kbd className={styles.navKbd}>⌘J</kbd>}
    </button>
  );
}

function Orb({ big }: { big?: boolean }) {
  return (
    <span className={styles.orb} data-big={big || undefined} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

/** The reply appears word by word, the way a voice would say it. */
function Typed({ text }: { text: string }) {
  const words = text.split(/(\s+)/);
  return (
    <p className={styles.reply}>
      {words.map((word, index) => <span key={index} style={{ animationDelay: `${Math.min(index, 80) * 22}ms` }}>{word}</span>)}
    </p>
  );
}

function Answer({ item, onBook, onClose }: { item: Exchange; onBook: (slot: { startsAt: string }, doctorId?: string, patientId?: string) => void; onClose: () => void }) {
  return (
    <article className={styles.answer} data-error={item.error || undefined}>
      <p className={styles.question}>{capital(item.question)}</p>
      {item.reply === undefined ? (
        <div className={styles.wave} aria-label="Помощник думает"><i /><i /><i /><i /><i /></div>
      ) : (
        <>
          {item.reply && <Typed text={item.reply} />}
          {item.cards?.map((card, index) => (
            <div key={index} className={styles.rise} style={{ animationDelay: `${160 + index * 90}ms` }}>
              <CardView card={card} onBook={onBook} onClose={onClose} />
            </div>
          ))}
        </>
      )}
    </article>
  );
}

function CardView({ card, onBook, onClose }: { card: Card; onBook: (slot: { startsAt: string }, doctorId?: string, patientId?: string) => void; onClose: () => void }) {
  if (card.kind === 'slots') {
    if (!card.items.length) return <p className={styles.empty}>Свободного времени нет. Попробуйте другой день или время.</p>;
    const days: { key: string; first: string; slots: typeof card.items }[] = [];
    for (const slot of card.items) {
      const key = dayKey(slot.startsAt);
      const day = days.find((item) => item.key === key);
      if (day) day.slots.push(slot);
      else days.push({ key, first: slot.startsAt, slots: [slot] });
    }
    return (
      <div className={styles.glass}>
        <p className={styles.glassHead}>
          <b>{card.patient?.name ?? card.doctor?.name ?? 'Любой врач'}</b>
          <span>{[card.patient && (card.doctor?.name ?? 'любой врач'), card.service ?? `${card.durationMin} мин`].filter(Boolean).join(' · ')}</span>
        </p>
        {days.map((day) => (
          <div key={day.key} className={styles.day}>
            <div className={styles.date}><small>{weekday(day.first)}</small><b>{new Date(day.first).getDate()}</b><em>{month(day.first)}</em></div>
            <div className={styles.times}>
              {day.slots.map((slot) => (
                <button key={slot.startsAt} type="button" onClick={() => onBook(slot, card.doctor?.id, card.patient?.id)} aria-label={`Записать на ${dayLabel(slot.startsAt)}, ${time(slot.startsAt)}`}>{time(slot.startsAt)}</button>
              ))}
            </div>
          </div>
        ))}
        <p className={styles.glassFoot}>Нажмите время — откроется запись для проверки.</p>
      </div>
    );
  }
  if (card.kind === 'patients') {
    if (!card.items.length) return <p className={styles.empty}>Пациента «{card.query}» не нашёл.</p>;
    return (
      <ul className={styles.glass}>
        {card.items.map((row) => (
          <li key={row.id}>
            <Link href={`/patients/${row.id}`} onClick={onClose} className={styles.row}>
              <span className={styles.avatar} aria-hidden="true">{initials(row.name)}</span>
              <span className={styles.rowText}><b>{row.name}</b><small>{row.phone ?? 'телефона нет'}</small></span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  if (card.kind === 'day') {
    const noon = `${card.date}T12:00:00`;
    if (!card.items.length) return <p className={styles.empty}>На {dayLabel(noon)} записей нет.</p>;
    return (
      <div className={styles.glass}>
        <p className={styles.glassHead}><b>{capital(dayLabel(noon))}</b><span>{card.items.length} {plural(card.items.length)}</span></p>
        <ul>
          {card.items.map((row) => {
            const state = STATUS[row.status] ?? { code: 'done', word: row.status };
            return (
              <li key={row.id}>
                <Link href={`/patients/${row.patientId}`} onClick={onClose} className={styles.row}>
                  <time>{time(row.startsAt)}</time>
                  <span className={styles.rowText}><b>{row.patient}</b><small>{[row.service, row.doctor].filter(Boolean).join(' · ')}</small></span>
                  <span className={styles.state} data-code={state.code}><i />{state.word}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link className={styles.glassLink} href="/schedule" onClick={onClose}><CalendarRange size={16} aria-hidden="true" />Открыть расписание</Link>
      </div>
    );
  }
  return <Link className={styles.jump} href={card.href} onClick={onClose}><span>{card.label}</span><ArrowRight size={20} aria-hidden="true" /></Link>;
}

function plural(count: number) {
  const tail = count % 10;
  const teen = count % 100 >= 11 && count % 100 <= 14;
  if (tail === 1 && !teen) return 'запись';
  if (tail >= 2 && tail <= 4 && !teen) return 'записи';
  return 'записей';
}
