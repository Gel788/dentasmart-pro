'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp, CalendarRange, CornerDownLeft, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useFocus } from '@/lib/focus';
import styles from './assistant.module.css';

type Card =
  | { kind: 'slots'; doctor: { id: string; name: string } | null; patient: { id: string; name: string } | null; durationMin: number; service: string | null; items: { startsAt: string; endsAt: string }[] }
  | { kind: 'patients'; query: string; items: { id: string; name: string; phone: string | null }[] }
  | { kind: 'day'; date: string; items: { id: string; startsAt: string; patientId: string; patient: string; doctor: string | null; service: string | null; status: string }[] }
  | { kind: 'link'; href: string; label: string };
type Exchange = { id: number; question: string; reply?: string; cards?: Card[]; error?: boolean };

const IDEAS = [
  { ask: 'Свободные окна завтра после 15:00', hint: 'время' },
  { ask: 'Кто записан сегодня?', hint: 'день' },
  { ask: 'Найди пациента Орлова', hint: 'пациент' },
  { ask: 'Как поставить врачу отпуск?', hint: 'вопрос' },
];
/** Visit state in the clinic's own code squares, always with its word. */
const STATUS: Record<string, { code: string; word: string }> = {
  SCHEDULED: { code: 'wait', word: 'не подтверждён' },
  CONFIRMED: { code: 'ok', word: 'подтверждён' },
  WAITING: { code: 'here', word: 'пришёл' },
  IN_PROGRESS: { code: 'chair', word: 'в кресле' },
  COMPLETED: { code: 'next', word: 'завершён' },
  NO_SHOW: { code: 'gone', word: 'не пришёл' },
};
const time = (iso: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const dayKey = (iso: string) => new Date(iso).toDateString();
const weekday = (iso: string) => new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(new Date(iso));
const month = (iso: string) => new Intl.DateTimeFormat('ru-RU', { month: 'long', day: 'numeric' }).format(new Date(iso)).replace(/^\d+\s/, '');
const dayLabel = (iso: string) => new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();

/**
 * The staff assistant. It reads like the CRM's own command line: the question is the headline, the
 * answer is the clinic's data laid out in its usual blocks, and the newest exchange sits right under
 * the field. The model only works out what was asked; booking still goes through the usual sheet.
 */
export function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setFocus } = useFocus();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [thread, setThread] = useState<Exchange[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open || enabled !== null) return;
    api<{ enabled: boolean }>('/assistant').then((data) => setEnabled(data.enabled)).catch(() => setEnabled(false));
  }, [open, enabled]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      // 1–4 run a suggestion while the field is still empty.
      if (!thread.length && !text && /^[1-4]$/.test(event.key) && document.activeElement === input.current) {
        event.preventDefault();
        void send(IDEAS[Number(event.key) - 1].ask);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (raw: string) => {
    const question = raw.trim();
    if (!question || busy || enabled === false) return;
    const id = ++seq.current;
    const history = thread.slice().reverse().filter((item) => !item.error).flatMap((item) => [
      { role: 'user' as const, content: item.question },
      ...(item.reply ? [{ role: 'assistant' as const, content: item.reply }] : []),
    ]);
    setThread((items) => [{ id, question }, ...items]);
    setText('');
    setBusy(true);
    body.current?.scrollTo({ top: 0 });
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
  const [latest, ...earlier] = thread;

  return (
    <div className={styles.back} onMouseDown={onClose}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="assistant-title" data-busy={busy || undefined} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.band} aria-hidden="true"><i /></div>
        <header className={styles.head}>
          <span className={styles.code}><span className={styles.k} data-code="chair" />{busy ? 'Ищу в базе клиники…' : 'GigaChat · данные остаются в России'}</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть помощника"><X size={20} /></button>
        </header>

        <form className={styles.ask} onSubmit={(event) => { event.preventDefault(); void send(text); }}>
          <label id="assistant-title" htmlFor="assistant-input" className={styles.title}>{thread.length ? 'Ещё вопрос' : 'Что найти?'}</label>
          <div className={styles.field}>
            <textarea
              id="assistant-input"
              ref={input}
              rows={1}
              value={text}
              disabled={enabled === false}
              placeholder="Окно у Завена в пятницу вечером"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(text); } }}
            />
            <button type="submit" disabled={busy || !text.trim() || enabled === false} aria-label="Спросить"><ArrowUp size={22} /></button>
          </div>
        </form>

        <div className={styles.body} ref={body} aria-live="polite">
          {enabled === false && <p className={styles.off}>Помощник не подключён: на сервере нет ключа Polza AI.</p>}

          {enabled !== false && !thread.length && (
            <ol className={styles.ideas}>
              {IDEAS.map((idea, index) => (
                <li key={idea.ask}>
                  <button type="button" onClick={() => void send(idea.ask)}>
                    <kbd>{index + 1}</kbd>
                    <span>{idea.ask}</span>
                    <small>{idea.hint}</small>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          )}

          {latest && <Answer item={latest} big onBook={book} onClose={onClose} />}
          {earlier.length > 0 && (
            <div className={styles.earlier}>
              <p className={styles.rule}>Раньше</p>
              {earlier.map((item) => <Answer key={item.id} item={item} onBook={book} onClose={onClose} />)}
            </div>
          )}
        </div>

        <footer className={styles.foot}>
          <span><CornerDownLeft size={14} aria-hidden="true" />спросить</span>
          <span><kbd>Esc</kbd>закрыть</span>
          <span><kbd>⌘J</kbd>открыть с любого экрана</span>
        </footer>
      </section>
    </div>
  );
}

function Answer({ item, big, onBook, onClose }: { item: Exchange; big?: boolean; onBook: (slot: { startsAt: string }, doctorId?: string, patientId?: string) => void; onClose: () => void }) {
  return (
    <article className={styles.answer} data-big={big || undefined} data-error={item.error || undefined}>
      <h3>{item.question.charAt(0).toLocaleUpperCase('ru-RU') + item.question.slice(1)}</h3>
      {item.reply === undefined ? (
        <div className={styles.wait} aria-label="Помощник думает"><i /><i /><i /></div>
      ) : (
        <>
          {item.reply && <p className={styles.reply}>{item.reply}</p>}
          {item.cards?.map((card, index) => <CardView key={index} card={card} onBook={onBook} onClose={onClose} />)}
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
      <div className={styles.pack}>
        <p className={styles.packHead}>
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
        <p className={styles.packFoot}>Нажмите время — откроется запись, вы проверите и подтвердите.</p>
      </div>
    );
  }
  if (card.kind === 'patients') {
    if (!card.items.length) return <p className={styles.empty}>Пациента «{card.query}» не нашёл.</p>;
    return (
      <ul className={styles.pack}>
        {card.items.map((row) => (
          <li key={row.id}>
            <Link href={`/patients/${row.id}`} onClick={onClose} className={styles.person}>
              <span className={styles.avatar} aria-hidden="true">{initials(row.name)}</span>
              <span><b>{row.name}</b><small>{row.phone ?? 'телефона нет'}</small></span>
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
      <div className={styles.pack}>
        <p className={styles.packHead}><b>{dayLabel(noon)}</b><span>{card.items.length} {plural(card.items.length)}</span></p>
        <ul>
          {card.items.map((row) => {
            const state = STATUS[row.status] ?? { code: 'next', word: row.status };
            return (
              <li key={row.id}>
                <Link href={`/patients/${row.patientId}`} onClick={onClose} className={styles.visit}>
                  <time>{time(row.startsAt)}</time>
                  <span><b>{row.patient}</b><small>{[row.service, row.doctor].filter(Boolean).join(' · ')}</small></span>
                  <span className={styles.state}><span className={styles.k} data-code={state.code} />{state.word}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link className={styles.packLink} href="/schedule" onClick={onClose}><CalendarRange size={16} aria-hidden="true" />Открыть расписание</Link>
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
