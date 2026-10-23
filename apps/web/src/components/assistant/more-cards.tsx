'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Check, ListChecks, Package, Phone, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useFocus } from '@/lib/focus';
import styles from './assistant.module.css';

export type MoreCard =
  | { kind: 'report'; from: string; to: string; doctor: string | null; visits: { total: number; completed: number; noShows: number; cancelled: number }; patients: { seen: number; new: number }; money: { moneyIn: number; net: number; averageBill: number; debtNow: number } | null }
  | { kind: 'debtors'; total: number; items: { patientId: string; name: string; phone: string | null; amount: number }[] }
  | { kind: 'patientInfo'; id: string; name: string; phone: string | null; age: number | null; allergies: string[] | null; debt: number | null; nextVisit: { id: string; startsAt: string; doctor: string | null; service: string | null } | null; lastVisit: { startsAt: string; service: string | null } | null; todayVisitId: string | null; plan: { title: string; total: number; left: number } | null; tasks: number }
  | { kind: 'payment'; patient: { id: string; name: string } | null; amount: number; method: 'CASH' | 'CARD' | 'ONLINE'; debt: number | null; candidates: { id: string; name: string; phone: string | null }[] }
  | { kind: 'tasks'; items: { id: string; title: string; dueAt: string | null; overdue: boolean; patient: { id: string; name: string } | null }[] }
  | { kind: 'newTask'; title: string; dueAt: string | null; patient: { id: string; name: string } | null; assignee: { id: string; name: string } | null }
  | { kind: 'stock'; query: string; items: { id: string; name: string; unit: string; quantity: number; minStock: number; low: boolean }[] };

export const MORE_KINDS = ['report', 'debtors', 'patientInfo', 'payment', 'tasks', 'newTask', 'stock'];

const rub = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₽`;
const when = (iso: string) => new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const day = (iso: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
const METHODS: { id: 'CARD' | 'CASH' | 'ONLINE'; label: string }[] = [
  { id: 'CARD', label: 'Картой' },
  { id: 'CASH', label: 'Наличными' },
  { id: 'ONLINE', label: 'Переводом' },
];

/** What the assistant found or is about to do outside the schedule: figures, debts, a patient, money, tasks, stock. */
export function MoreCardView({ card, onClose, onAsk }: { card: MoreCard; onClose: () => void; onAsk: (question: string) => void }) {
  if (card.kind === 'report') return <ReportCard card={card} />;
  if (card.kind === 'debtors') return <DebtorsCard card={card} onClose={onClose} onAsk={onAsk} />;
  if (card.kind === 'patientInfo') return <PatientCard card={card} onClose={onClose} onAsk={onAsk} />;
  if (card.kind === 'payment') return <PaymentCard card={card} onAsk={onAsk} />;
  if (card.kind === 'tasks') return <TasksCard card={card} onClose={onClose} />;
  if (card.kind === 'newTask') return <NewTaskCard card={card} />;
  return <StockCard card={card} onClose={onClose} />;
}

function ReportCard({ card }: { card: Extract<MoreCard, { kind: 'report' }> }) {
  const tiles = [
    { label: 'Визитов', value: String(card.visits.total), sub: `проведено ${card.visits.completed}` },
    { label: 'Пациентов', value: String(card.patients.seen), sub: `новых ${card.patients.new}` },
    ...(card.money ? [
      { label: 'Пришло денег', value: rub(card.money.moneyIn), sub: card.money.net !== card.money.moneyIn ? `за вычетом возвратов ${rub(card.money.net)}` : 'без возвратов' },
      { label: 'Средний чек', value: rub(card.money.averageBill), sub: `долг сейчас ${rub(card.money.debtNow)}` },
    ] : []),
    { label: 'Неявки', value: String(card.visits.noShows), sub: `отмен ${card.visits.cancelled}`, warn: card.visits.noShows > 0 },
  ];
  return (
    <div className={styles.glass}>
      <div className={styles.tiles}>
        {tiles.map((tile) => (
          <div key={tile.label} className={styles.tile} data-warn={tile.warn || undefined}>
            <span>{tile.label}</span>
            <b>{tile.value}</b>
            <small>{tile.sub}</small>
          </div>
        ))}
      </div>
      <Link className={styles.glassLink} href="/reports"><ArrowRight size={16} aria-hidden="true" />Подробный отчёт</Link>
    </div>
  );
}

function DebtorsCard({ card, onClose, onAsk }: { card: Extract<MoreCard, { kind: 'debtors' }>; onClose: () => void; onAsk: (question: string) => void }) {
  if (!card.items.length) return null;
  return (
    <div className={styles.glass}>
      <p className={styles.glassHead}><b>Долги пациентов</b><span>всего {rub(card.total)}</span></p>
      <ul>
        {card.items.map((row) => (
          <li key={row.patientId} className={styles.rowLine}>
            <Link href={`/patients/${row.patientId}?tab=money`} onClick={onClose} className={styles.row}>
              <span className={styles.rowText}><b>{row.name}</b><small>{row.phone ?? 'телефона нет'}</small></span>
              <span className={styles.amount}>{rub(row.amount)}</span>
            </Link>
            <button type="button" className={styles.rowAct} onClick={() => onAsk(`Прими оплату у ${row.name} ${Math.round(row.amount)} рублей картой`)}>Принять</button>
          </li>
        ))}
      </ul>
      <Link className={styles.glassLink} href="/money" onClick={onClose}><Wallet size={16} aria-hidden="true" />Все счета и касса</Link>
    </div>
  );
}

function PatientCard({ card, onClose, onAsk }: { card: Extract<MoreCard, { kind: 'patientInfo' }>; onClose: () => void; onAsk: (question: string) => void }) {
  const facts = [
    card.phone && { label: 'Телефон', value: card.phone },
    card.age !== null && { label: 'Возраст', value: `${card.age}` },
    card.nextVisit && { label: 'Следующий визит', value: `${when(card.nextVisit.startsAt)}${card.nextVisit.service ? ` · ${card.nextVisit.service}` : ''}${card.nextVisit.doctor ? ` · ${card.nextVisit.doctor}` : ''}` },
    { label: 'Прошлый визит', value: card.lastVisit ? `${day(card.lastVisit.startsAt)}${card.lastVisit.service ? ` · ${card.lastVisit.service}` : ''}` : 'ещё не был' },
    card.plan && { label: 'План лечения', value: `${card.plan.title}: осталось ${rub(card.plan.left)} из ${rub(card.plan.total)}` },
    card.tasks > 0 && { label: 'Задачи', value: `открытых ${card.tasks}` },
  ].filter(Boolean) as { label: string; value: string }[];
  return (
    <div className={styles.glass}>
      {card.allergies && card.allergies.length > 0 && <p className={styles.alert}><AlertTriangle size={16} aria-hidden="true" />Аллергия: {card.allergies.join(', ')}</p>}
      {card.debt !== null && card.debt > 0 && <p className={styles.alert} data-tone="money"><Wallet size={16} aria-hidden="true" />Долг {rub(card.debt)}</p>}
      <dl className={styles.facts}>
        {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
      </dl>
      <div className={styles.chips}>
        {card.todayVisitId && <Link className={styles.chipGo} href={`/visits/${card.todayVisitId}`} onClick={onClose}>Открыть приём</Link>}
        <Link className={styles.chip} href={`/patients/${card.id}`} onClick={onClose}>Карта пациента</Link>
        {!card.nextVisit && <button type="button" className={styles.chip} onClick={() => onAsk(`Запиши ${card.name} на ближайшее свободное время`)}>Записать</button>}
        {card.debt !== null && card.debt > 0 && <button type="button" className={styles.chip} onClick={() => onAsk(`Прими оплату у ${card.name} ${Math.round(card.debt!)} рублей картой`)}>Принять оплату</button>}
        {card.phone && <a className={styles.chip} href={`tel:${card.phone}`}><Phone size={14} aria-hidden="true" />Позвонить</a>}
      </div>
    </div>
  );
}

/** Money moves only on an explicit tap; one key per attempt so a double tap is taken once. */
function PaymentCard({ card, onAsk }: { card: Extract<MoreCard, { kind: 'payment' }>; onAsk: (question: string) => void }) {
  const { bump } = useFocus();
  const [amount, setAmount] = useState(card.amount ? String(card.amount) : card.debt ? String(card.debt) : '');
  const [method, setMethod] = useState(card.method);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState<number | null>(null);
  const key = useMemo(() => `assistant-pay-${Date.now()}-${Math.random().toString(36).slice(2)}`, []);
  if (!card.patient) {
    if (!card.candidates.length) return null;
    return (
      <ul className={styles.glass}>
        {card.candidates.map((row) => (
          <li key={row.id}>
            <button type="button" className={styles.row} onClick={() => onAsk(`Прими оплату у ${row.name}${card.amount ? ` ${card.amount} рублей` : ''} ${METHODS.find((item) => item.id === card.method)?.label.toLowerCase() ?? ''}`)}>
              <span className={styles.rowText}><b>{row.name}</b><small>{row.phone ?? 'телефона нет'}</small></span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    );
  }
  const sum = Number(amount.replace(',', '.').replace(/[^\d.]/g, '')) || 0;
  const submit = async () => {
    setPending(true);
    setError('');
    try {
      await api('/finance/payments', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ patientId: card.patient!.id, amount: sum, method }) });
      bump();
      setPaid(sum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Оплата не прошла');
    } finally {
      setPending(false);
    }
  };
  if (paid !== null) {
    return (
      <div className={`${styles.glass} ${styles.done}`}>
        <span className={styles.doneMark} aria-hidden="true"><Check size={26} strokeWidth={2.6} /></span>
        <div><b>Оплата принята</b><p>{card.patient.name} · {rub(paid)} · {METHODS.find((item) => item.id === method)?.label.toLowerCase()}</p></div>
        <Link href={`/patients/${card.patient.id}?tab=money`} className={styles.doneLink}>Счета<ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    );
  }
  return (
    <div className={styles.glass}>
      <p className={styles.glassHead}><b>Оплата · {card.patient.name}</b><span>{card.debt ? `долг ${rub(card.debt)}` : 'открытых счетов нет — сумма уйдёт на депозит'}</span></p>
      <div className={styles.book}>
        <label className={styles.bookField}><span className={styles.bookLabel}>Сумма, ₽</span><input className={styles.bookInput} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Сумма оплаты" /></label>
        <div className={styles.chips} role="radiogroup" aria-label="Способ оплаты">
          {METHODS.map((item) => <button key={item.id} type="button" role="radio" aria-checked={method === item.id} className={method === item.id ? styles.chipGo : styles.chip} onClick={() => setMethod(item.id)}>{item.label}</button>)}
        </div>
        {card.debt !== null && sum > card.debt && card.debt > 0 && <p className={styles.bookHint}>Больше долга на {rub(sum - card.debt)} — остаток уйдёт на депозит пациента.</p>}
        {error && <p className={styles.bookError} role="alert">{error}</p>}
        <div className={styles.bookActs}>
          <button type="button" className={styles.bookGo} disabled={pending || sum <= 0} onClick={() => void submit()}>{pending ? 'Провожу…' : `Принять ${sum > 0 ? rub(sum) : ''}`}</button>
        </div>
      </div>
    </div>
  );
}

function TasksCard({ card, onClose }: { card: Extract<MoreCard, { kind: 'tasks' }>; onClose: () => void }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  if (!card.items.length) return null;
  const finish = async (id: string) => {
    await api(`/tasks/${id}/done`, { method: 'POST' }).then(() => setDone((current) => new Set(current).add(id))).catch(() => undefined);
  };
  return (
    <div className={styles.glass}>
      <ul>
        {card.items.map((row) => (
          <li key={row.id} className={styles.rowLine} data-done={done.has(row.id) || undefined}>
            <button type="button" className={styles.tick} aria-label={`Готово: ${row.title}`} aria-pressed={done.has(row.id)} onClick={() => void finish(row.id)}>{done.has(row.id) && <Check size={16} />}</button>
            <span className={styles.rowText}><b>{row.title}</b><small>{[row.dueAt ? `${row.overdue ? 'просрочено · ' : ''}до ${when(row.dueAt)}` : 'без срока', row.patient?.name].filter(Boolean).join(' · ')}</small></span>
          </li>
        ))}
      </ul>
      <Link className={styles.glassLink} href="/tasks" onClick={onClose}><ListChecks size={16} aria-hidden="true" />Все задачи</Link>
    </div>
  );
}

function NewTaskCard({ card }: { card: Extract<MoreCard, { kind: 'newTask' }> }) {
  const { bump } = useFocus();
  const [title, setTitle] = useState(card.title);
  const [due, setDue] = useState(card.dueAt ? card.dueAt.slice(0, 10) : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState(false);
  const submit = async () => {
    setPending(true);
    setError('');
    try {
      await api('/tasks', { method: 'POST', body: JSON.stringify({ title: title.trim(), dueAt: due ? new Date(`${due}T18:00:00`).toISOString() : undefined, patientId: card.patient?.id, assigneeId: card.assignee?.id }) });
      bump();
      setMade(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Задача не создалась');
    } finally {
      setPending(false);
    }
  };
  if (made) {
    return (
      <div className={`${styles.glass} ${styles.done}`}>
        <span className={styles.doneMark} aria-hidden="true"><Check size={26} strokeWidth={2.6} /></span>
        <div><b>Задача создана</b><p>{title}{card.assignee ? ` · ${card.assignee.name}` : ''}</p></div>
        <Link href="/tasks" className={styles.doneLink}>Задачи<ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    );
  }
  return (
    <div className={styles.glass}>
      <p className={styles.glassHead}><b>Новая задача</b><span>{[card.assignee ? `для ${card.assignee.name}` : 'для вас', card.patient?.name].filter(Boolean).join(' · ')}</span></p>
      <div className={styles.book}>
        <label className={styles.bookField}><span className={styles.bookLabel}>Что сделать</span><input className={styles.bookInput} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className={styles.bookField}><span className={styles.bookLabel}>Срок</span><input className={styles.bookInput} type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>
        {error && <p className={styles.bookError} role="alert">{error}</p>}
        <div className={styles.bookActs}>
          <button type="button" className={styles.bookGo} disabled={pending || title.trim().length < 2} onClick={() => void submit()}>{pending ? 'Создаю…' : 'Создать задачу'}</button>
        </div>
      </div>
    </div>
  );
}

function StockCard({ card, onClose }: { card: Extract<MoreCard, { kind: 'stock' }>; onClose: () => void }) {
  if (!card.items.length) return null;
  return (
    <div className={styles.glass}>
      <ul>
        {card.items.map((row) => (
          <li key={row.id} className={styles.rowLine}>
            <span className={styles.row}>
              <span className={styles.rowText}><b>{row.name}</b><small>минимум {row.minStock} {row.unit}</small></span>
              <span className={styles.amount} data-low={row.low || undefined}>{row.quantity} {row.unit}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link className={styles.glassLink} href="/supply" onClick={onClose}><Package size={16} aria-hidden="true" />Снабжение и склад</Link>
    </div>
  );
}
