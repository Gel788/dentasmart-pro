'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp, CalendarRange, Check, Mic, Square, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useFocus } from '@/lib/focus';
import styles from './assistant.module.css';
import { chime, speak } from './voice-wake';
import { MORE_KINDS, MoreCardView, type MoreCard } from './more-cards';

type Card =
  | { kind: 'slots'; doctor: { id: string; name: string } | null; patient: { id: string; name: string } | null; serviceId: string | null; durationMin: number; service: string | null; items: { startsAt: string; endsAt: string }[] }
  | { kind: 'patients'; query: string; items: { id: string; name: string; phone: string | null }[] }
  | { kind: 'day'; date: string; items: { id: string; startsAt: string; patientId: string; patient: string; doctor: string | null; service: string | null; status: string }[] }
  | { kind: 'link'; href: string; label: string }
  | { kind: 'visits'; intent: Intent; query: string; items: VisitRow[]; slots: { startsAt: string; endsAt: string }[] }
  | { kind: 'newPatient'; lastName: string; firstName: string; middleName: string; phone: string }
  | MoreCard;
type Intent = 'cancel' | 'confirm' | 'arrived' | 'no_show' | 'move';
type VisitRow = { id: string; startsAt: string; endsAt: string; patientId: string; patient: string; doctor: string | null; service: string | null; status: string };
type Exchange = { id: number; question: string; reply?: string; cards?: Card[]; error?: boolean };

const IDEAS = ['Свободные окна завтра после 15:00', 'Кто записан сегодня?', 'Перенеси Орлову на понедельник', 'Кто нам должен?', 'Выручка за неделю', 'Расскажи про Орлову', 'Прими у Орловой 5000 картой', 'Напомни завтра позвонить Волкову', 'Что заканчивается на складе?'];
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
export function Assistant({ open, onClose, wakeSignal = 0 }: { open: boolean; onClose: () => void; wakeSignal?: number }) {
  const { setFocus } = useFocus();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [thread, setThread] = useState<Exchange[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const [listening, setListening] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stopTimer = useRef<number | null>(null);
  const canListen = typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  // Voice: tap to talk, tap again to send; the speech is turned into text on Russian-hosted models.
  const speakNext = useRef(false);
  const listen = async (auto = false) => {
    if (listening) { recorder.current?.stop(); return; }
    setVoiceError('');
    speakNext.current = auto;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((item) => MediaRecorder.isTypeSupported(item));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      rec.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (stopTimer.current) window.clearTimeout(stopTimer.current);
        setListening(false);
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 2000) { speakNext.current = false; return; }
        setHearing(true);
        try {
          const form = new FormData();
          form.append('audio', blob, `voice.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
          const { text: heard } = await api<{ text: string }>('/assistant/transcribe', { method: 'POST', body: form });
          void send(heard);
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : 'Не расслышал');
        } finally {
          setHearing(false);
        }
      };
      recorder.current = rec;
      rec.start(500);
      setListening(true);
      stopTimer.current = window.setTimeout(() => rec.state === 'recording' && rec.stop(), auto ? 12_000 : 30_000);
      // Woken by voice: stop on its own once the person has spoken and fallen silent.
      if (auto) {
        const meter = new AudioContext();
        const analyser = meter.createAnalyser();
        analyser.fftSize = 1024;
        meter.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const started = Date.now();
        let spoke = false;
        let quietSince = 0;
        const tick = window.setInterval(() => {
          if (rec.state !== 'recording') { window.clearInterval(tick); void meter.close(); return; }
          analyser.getFloatTimeDomainData(samples);
          const level = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
          const now = Date.now();
          if (level > 0.02) { spoke = true; quietSince = 0; } else if (!quietSince) quietSince = now;
          if ((spoke && quietSince && now - quietSince > 1200) || (!spoke && now - started > 4000)) rec.stop();
        }, 100);
      }
    } catch {
      setVoiceError('Нет доступа к микрофону. Разрешите его в браузере.');
    }
  };
  useEffect(() => () => { recorder.current?.stream.getTracks().forEach((track) => track.stop()); }, []);

  // «Привет, ЗаЗа» opened the assistant: chime, then listen for the command straight away.
  const lastWake = useRef(0);
  useEffect(() => {
    if (!open || !wakeSignal || wakeSignal === lastWake.current) return;
    lastWake.current = wakeSignal;
    chime();
    const start = window.setTimeout(() => void listen(true), 350);
    return () => window.clearTimeout(start);
  }, [open, wakeSignal]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (speakNext.current) {
        speakNext.current = false;
        speak(data.cards.some((card) => ['slots', 'visits', 'newPatient', 'payment', 'newTask'].includes(card.kind)) ? `${data.reply} Подтвердите на экране.` : data.reply);
      }
    } catch (err) {
      if (speakNext.current) { speakNext.current = false; speak('Не получилось. Попробуйте ещё раз.'); }
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
  const state = busy || hearing ? 'thinking' : listening || text ? 'listening' : 'idle';

  return (
    <div className={styles.scene} data-state={state} data-leaving={leaving || undefined} role="dialog" aria-modal="true" aria-label="Помощник" onMouseDown={close}>
      <div className={styles.edge} aria-hidden="true" />
      <div className={styles.bloom} aria-hidden="true" />

      <div className={styles.stage} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className={styles.close} onClick={close} aria-label="Закрыть помощника"><X size={18} /></button>

        <div className={styles.feed} ref={feed} aria-live="polite">
          {voiceError && <p className={styles.voiceError} role="alert">{voiceError}</p>}
          {!thread.length && (
            <div className={styles.hello}>
              <Orb big />
              <h2>{enabled === false ? 'Помощник не подключён' : listening ? 'Слушаю…' : 'Чем помочь?'}</h2>
              <p>{enabled === false ? 'На сервере нет ключа Polza AI.' : 'Я ЗаЗа. Скажите «Привет, ЗаЗа» или нажмите микрофон — найду окно, запишу, перенесу, отвечу голосом. Данные не уходят из России.'}</p>
              {enabled !== false && (
                <div className={styles.ideas}>
                  {IDEAS.map((idea, index) => (
                    <button key={idea} type="button" style={{ animationDelay: `${120 + index * 60}ms` }} onClick={() => void send(idea)}>{idea}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {thread.map((item) => <Answer key={item.id} item={item} onBook={book} onClose={onClose} onAsk={(question) => void send(question)} />)}
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
            placeholder={listening ? 'Говорите… нажмите ■, когда закончите' : hearing ? 'Распознаю речь…' : busy ? 'Ищу…' : 'Спросите или нажмите микрофон'}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(text); } }}
          />
          {canListen && enabled !== false && (
            <button type="button" className={styles.mic} data-on={listening || undefined} disabled={busy || hearing} onClick={() => void listen(false)} aria-label={listening ? 'Закончить и отправить' : 'Сказать голосом'} title={listening ? 'Закончить' : 'Голосом'}>
              {listening ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
            </button>
          )}
          <button type="submit" className={styles.send} disabled={busy || !text.trim() || enabled === false} aria-label="Спросить"><ArrowUp size={20} /></button>
        </form>
      </div>
    </div>
  );
}

/** How the assistant is called up: a glowing pill in the menu, a floating orb on a phone. */
export function AssistantTrigger({ variant, onOpen }: { variant: 'nav' | 'fab' | 'inline' | 'top'; onOpen: () => void }) {
  if (variant === 'top') {
    return <button type="button" className={`${styles.trigger} ${styles.top}`} onClick={onOpen} title="Спросить ИИ (⌘J)"><Orb /><span>Спросить ИИ</span></button>;
  }
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

function Answer({ item, onBook, onClose, onAsk }: { item: Exchange; onBook: (slot: { startsAt: string }, doctorId?: string, patientId?: string) => void; onClose: () => void; onAsk: (question: string) => void }) {
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
              <CardView card={card} onBook={onBook} onClose={onClose} onAsk={onAsk} />
            </div>
          ))}
        </>
      )}
    </article>
  );
}

function CardView({ card, onBook, onClose, onAsk }: { card: Card; onBook: (slot: { startsAt: string }, doctorId?: string, patientId?: string) => void; onClose: () => void; onAsk: (question: string) => void }) {
  if (card.kind !== 'link' && MORE_KINDS.includes(card.kind)) return <MoreCardView card={card as MoreCard} onClose={onClose} onAsk={onAsk} />;
  if (card.kind === 'visits') return <VisitsCard card={card} onClose={onClose} />;
  if (card.kind === 'newPatient') return <NewPatientCard card={card} onClose={onClose} onAsk={onAsk} />;
  if (card.kind === 'slots') return <SlotsCard card={card} onBook={onBook} onClose={onClose} />;
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
  if (card.kind !== 'link') return null;
  return <Link className={styles.jump} href={card.href} onClick={onClose}><span>{card.label}</span><ArrowRight size={20} aria-hidden="true" /></Link>;
}

type SlotsData = Extract<Card, { kind: 'slots' }>;
type Person = { id: string; name: string };
type Service = { id: string; name: string; price: number; durationMin: number };

/** Free times; picking one opens the booking right here in the conversation. */
function SlotsCard({ card, onBook, onClose }: { card: SlotsData; onBook: (slot: { startsAt: string }, doctorId?: string, patientId?: string) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ startsAt: string; endsAt: string; patient: Person } | null>(null);
  if (!card.items.length) return <p className={styles.empty}>Свободного времени нет. Попробуйте другой день или время.</p>;
  if (booked) {
    return (
      <div className={`${styles.glass} ${styles.done}`}>
        <span className={styles.doneMark} aria-hidden="true"><Check size={26} strokeWidth={2.6} /></span>
        <div>
          <b>Записано: {booked.patient.name}</b>
          <p>{capital(dayLabel(booked.startsAt))}, {time(booked.startsAt)}–{time(booked.endsAt)}{card.doctor ? ` · ${card.doctor.name}` : ''}</p>
        </div>
        <Link href={`/patients/${booked.patient.id}`} onClick={onClose} className={styles.doneLink}>Карточка<ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    );
  }
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
              <button key={slot.startsAt} type="button" aria-pressed={picked === slot.startsAt} onClick={() => setPicked(picked === slot.startsAt ? null : slot.startsAt)} aria-label={`Выбрать ${dayLabel(slot.startsAt)}, ${time(slot.startsAt)}`}>{time(slot.startsAt)}</button>
            ))}
          </div>
        </div>
      ))}
      {picked ? (
        <BookHere key={picked} startsAt={picked} card={card} onDone={setBooked} onFullForm={() => onBook({ startsAt: picked }, card.doctor?.id, card.patient?.id)} />
      ) : (
        <p className={styles.glassFoot}>Выберите время — запишем прямо здесь.</p>
      )}
    </div>
  );
}

function BookHere({ startsAt, card, onDone, onFullForm }: { startsAt: string; card: SlotsData; onDone: (visit: { startsAt: string; endsAt: string; patient: Person }) => void; onFullForm: () => void }) {
  const { bump } = useFocus();
  const [patient, setPatient] = useState<Person | null>(card.patient);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ id: string; firstName: string; lastName: string; phone: string | null }[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState(card.serviceId ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => { api<Service[]>('/workspace/catalog').then(setServices).catch(() => setServices([])); }, []);
  useEffect(() => { if (!patient) search.current?.focus(); }, [patient]);
  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    const handle = setTimeout(() => {
      api<typeof hits>(`/workspace/search?q=${encodeURIComponent(query)}`).then(setHits).catch(() => setHits([]));
    }, 160);
    return () => clearTimeout(handle);
  }, [query]);

  const service = services.find((item) => item.id === serviceId);
  const minutes = service?.durationMin ?? card.durationMin;
  const ends = new Date(Date.parse(startsAt) + minutes * 60000).toISOString();

  const submit = async () => {
    if (!patient) return;
    setPending(true);
    setError('');
    try {
      const visit = await api<{ startsAt: string; endsAt: string }>('/assistant/book', { method: 'POST', body: JSON.stringify({ patientId: patient.id, startsAt, serviceId: serviceId || null, doctorId: card.doctor?.id ?? null }) });
      bump();
      onDone({ startsAt: visit.startsAt, endsAt: visit.endsAt, patient });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось записать');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.book}>
      <div className={styles.bookWhen}>
        <b>{capital(dayLabel(startsAt))}</b>
        <span>{time(startsAt)}–{time(ends)} · {card.doctor?.name ?? 'любой врач'}</span>
      </div>

      <div className={styles.bookField}>
        <span className={styles.bookLabel}>Пациент</span>
        {patient ? (
          <div className={styles.chosen}>
            <span className={styles.avatar} aria-hidden="true">{initials(patient.name)}</span>
            <b>{patient.name}</b>
            <button type="button" onClick={() => { setPatient(null); setQuery(''); }}>Другой</button>
          </div>
        ) : (
          <>
            <input ref={search} className={styles.bookInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Фамилия или телефон" aria-label="Найти пациента" />
            {hits.length > 0 && (
              <div className={styles.hits}>
                {hits.map((hit) => (
                  <button key={hit.id} type="button" onClick={() => setPatient({ id: hit.id, name: `${hit.lastName} ${hit.firstName}` })}>
                    <b>{hit.lastName} {hit.firstName}</b><small>{hit.phone ?? ''}</small>
                  </button>
                ))}
              </div>
            )}
            {query.trim().length >= 2 && !hits.length && <p className={styles.bookNote}>Не нашёл. Нового пациента заведите в полной форме.</p>}
          </>
        )}
      </div>

      <label className={styles.bookField}>
        <span className={styles.bookLabel}>Услуга</span>
        <select className={styles.bookInput} value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
          <option value="">Без услуги · {card.durationMin} мин</option>
          {services.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMin} мин</option>)}
        </select>
      </label>

      {error && <p className={styles.bookError} role="alert">{error}</p>}

      <div className={styles.bookActs}>
        <button type="button" className={styles.bookGo} disabled={!patient || pending} onClick={() => void submit()}>
          {pending ? 'Записываю…' : `Записать на ${time(startsAt)}`}
        </button>
        <button type="button" className={styles.bookAlt} onClick={onFullForm}>Полная форма</button>
      </div>
    </div>
  );
}

const ACTS: Record<Intent, { button: string; done: string; danger?: boolean }> = {
  confirm: { button: 'Подтвердить визит', done: 'Подтверждён' },
  arrived: { button: 'Пациент пришёл', done: 'Отмечен приход' },
  no_show: { button: 'Не пришёл', done: 'Отмечена неявка', danger: true },
  cancel: { button: 'Отменить визит', done: 'Визит отменён', danger: true },
  move: { button: 'Перенести', done: 'Перенесён' },
};

/** A command on an existing visit: the visit, what will happen, one button (two taps for anything that removes a visit). */
function VisitsCard({ card, onClose }: { card: Extract<Card, { kind: 'visits' }>; onClose: () => void }) {
  const { bump } = useFocus();
  const [chosen, setChosen] = useState<string | null>(card.items.length === 1 ? card.items[0].id : null);
  const [target, setTarget] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => { setArmed(false); setError(''); }, [chosen, target]);
  if (!card.items.length) return <p className={styles.empty}>{card.query ? `Ближайших визитов у «${card.query}» нет.` : 'Назовите фамилию пациента.'}</p>;
  const act = ACTS[card.intent];
  const visit = card.items.find((row) => row.id === chosen) ?? null;

  const run = async () => {
    if (!visit) return;
    if (act.danger && !armed) { setArmed(true); return; }
    setPending(true);
    setError('');
    try {
      if (card.intent === 'confirm') await api(`/flow/visits/${visit.id}/confirm`, { method: 'POST' });
      if (card.intent === 'arrived') await api(`/flow/visits/${visit.id}/check-in`, { method: 'POST' });
      if (card.intent === 'no_show') await api(`/flow/visits/${visit.id}/no-show`, { method: 'POST', body: JSON.stringify({ reason: 'Не пришёл' }) });
      if (card.intent === 'cancel') await api(`/appointments/${visit.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }) });
      if (card.intent === 'move' && target) {
        const length = Date.parse(visit.endsAt) - Date.parse(visit.startsAt);
        await api(`/appointments/${visit.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt: target, endsAt: new Date(Date.parse(target) + length).toISOString() }) });
      }
      bump();
      setDone({ id: visit.id, text: card.intent === 'move' && target ? `${act.done} на ${dayLabel(target)}, ${time(target)}` : act.done });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setPending(false);
    }
  };

  if (done && visit) {
    return (
      <div className={`${styles.glass} ${styles.done}`}>
        <span className={styles.doneMark} aria-hidden="true"><Check size={26} strokeWidth={2.6} /></span>
        <div><b>{done.text}</b><p>{visit.patient}{card.intent === 'move' ? '' : ` · ${capital(dayLabel(visit.startsAt))}, ${time(visit.startsAt)}`}</p></div>
        <Link href={`/patients/${visit.patientId}`} onClick={onClose} className={styles.doneLink}>Карточка<ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    );
  }

  return (
    <div className={styles.glass}>
      <p className={styles.glassHead}><b>{card.items.length > 1 ? 'Какой визит?' : 'Визит'}</b><span>{act.button}</span></p>
      <ul>
        {card.items.map((row) => {
          const state = STATUS[row.status] ?? { code: 'done', word: row.status };
          return (
            <li key={row.id}>
              <button type="button" className={styles.pick} aria-pressed={chosen === row.id} onClick={() => setChosen(row.id)}>
                <span className={styles.pickDate}><small>{weekday(row.startsAt)}</small><b>{new Date(row.startsAt).getDate()}</b></span>
                <span className={styles.rowText}><b>{time(row.startsAt)} · {row.patient}</b><small>{[row.service, row.doctor].filter(Boolean).join(' · ') || month(row.startsAt)}</small></span>
                <span className={styles.state} data-code={state.code}><i />{state.word}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {card.intent === 'move' && visit && (
        card.slots.length ? (
          <div className={styles.moveTo}>
            <span className={styles.bookLabel}>Новое время</span>
            <div className={styles.times}>
              {card.slots.map((slot) => (
                <button key={slot.startsAt} type="button" aria-pressed={target === slot.startsAt} onClick={() => setTarget(slot.startsAt)}>
                  <small className={styles.slotDay}>{weekday(slot.startsAt)} {new Date(slot.startsAt).getDate()}</small>{time(slot.startsAt)}
                </button>
              ))}
            </div>
          </div>
        ) : <p className={styles.glassFoot}>Свободного времени на этот день нет — назовите другой.</p>
      )}
      {visit && (card.intent !== 'move' || target) && (
        <div className={styles.book}>
          {error && <p className={styles.bookError} role="alert">{error}</p>}
          <div className={styles.bookActs}>
            <button type="button" className={act.danger ? styles.bookDanger : styles.bookGo} disabled={pending} onClick={() => void run()}>
              {pending ? 'Выполняю…' : armed ? `Точно? Нажмите ещё раз` : card.intent === 'move' && target ? `Перенести на ${time(target)}, ${weekday(target)} ${new Date(target).getDate()}` : act.button}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewPatientCard({ card, onClose, onAsk }: { card: Extract<Card, { kind: 'newPatient' }>; onClose: () => void; onAsk: (question: string) => void }) {
  const { bump } = useFocus();
  const [form, setForm] = useState({ lastName: card.lastName, firstName: card.firstName, middleName: card.middleName, phone: card.phone });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });

  const submit = async () => {
    setPending(true);
    setError('');
    try {
      const patient = await api<{ id: string }>('/patients', { method: 'POST', body: JSON.stringify({ lastName: form.lastName.trim(), firstName: form.firstName.trim(), middleName: form.middleName.trim() || undefined, phone: form.phone.trim() || undefined }) });
      bump();
      setCreated({ id: patient.id, name: `${form.lastName.trim()} ${form.firstName.trim()}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось создать пациента');
    } finally {
      setPending(false);
    }
  };

  if (created) {
    return (
      <div className={`${styles.glass} ${styles.done}`}>
        <span className={styles.doneMark} aria-hidden="true"><Check size={26} strokeWidth={2.6} /></span>
        <div><b>Пациент создан</b><p>{created.name}</p></div>
        <button type="button" className={styles.doneLink} onClick={() => onAsk(`Запиши ${created.name} на ближайшее свободное время`)}>Записать</button>
        <Link href={`/patients/${created.id}`} onClick={onClose} className={styles.doneLink}>Карточка<ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    );
  }

  return (
    <div className={styles.glass}>
      <p className={styles.glassHead}><b>Новый пациент</b><span>проверьте и создайте</span></p>
      <div className={styles.book}>
        <div className={styles.grid2}>
          <label className={styles.bookField}><span className={styles.bookLabel}>Фамилия</span><input className={styles.bookInput} value={form.lastName} onChange={set('lastName')} /></label>
          <label className={styles.bookField}><span className={styles.bookLabel}>Имя</span><input className={styles.bookInput} value={form.firstName} onChange={set('firstName')} /></label>
          <label className={styles.bookField}><span className={styles.bookLabel}>Отчество</span><input className={styles.bookInput} value={form.middleName} onChange={set('middleName')} /></label>
          <label className={styles.bookField}><span className={styles.bookLabel}>Телефон</span><input className={styles.bookInput} inputMode="tel" value={form.phone} onChange={set('phone')} /></label>
        </div>
        {error && <p className={styles.bookError} role="alert">{error}</p>}
        <div className={styles.bookActs}>
          <button type="button" className={styles.bookGo} disabled={pending || !form.lastName.trim() || !form.firstName.trim()} onClick={() => void submit()}>{pending ? 'Создаю…' : 'Создать пациента'}</button>
        </div>
      </div>
    </div>
  );
}

function plural(count: number) {
  const tail = count % 10;
  const teen = count % 100 >= 11 && count % 100 <= 14;
  if (tail === 1 && !teen) return 'запись';
  if (tail >= 2 && tail <= 4 && !teen) return 'записи';
  return 'записей';
}
