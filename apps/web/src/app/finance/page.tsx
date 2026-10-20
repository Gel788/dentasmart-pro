'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { formatRub, kopecks } from '@dentasmart/shared';
import { Protected } from '@/components/protected';
import styles from '@/components/finance/desk.module.css';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBranch } from '@/lib/branch-context';
import { useIdempotencyKey } from '@/lib/idempotency';

type Due = {
  invoiceId: string;
  number: string;
  createdAt: string;
  promiseNote: string | null;
  patient: { id: string; name: string; phone: string | null };
  total: string;
  discount: string;
  paid: string;
  due: string;
  visitToday: { startsAt: string; status: string } | null;
};
type Paid = { id: string; paidAt: string; amount: string; method: string; isRefund: boolean; refundable: string; patient: { id: string; name: string }; invoiceNumber: string | null };
type Desk = {
  day: string;
  totals: { revenueToday: string; cashToday: string; otherToday: string; receivable: string; openInvoices: number; dueToday: string };
  due: Due[];
  payments: Paid[];
};
type Shift = { id: string; status: string; openingCash: string; openedAt: string } | null;
type Closed = { expectedCash: string; difference: string; closingCash: string };

const METHOD: Record<string, string> = { CASH: 'наличные', CARD: 'карта', ONLINE: 'онлайн', DMS: 'ДМС', INSTALLMENT: 'рассрочка', BONUS: 'бонусы' };
const rub = (value: string | number) => formatRub(kopecks(value));
const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export default function FinancePage() {
  return <Protected><Suspense fallback={null}><CashDesk /></Suspense></Protected>;
}

/** The front desk's money: who pays now, what came in today, and the drawer. */
function CashDesk() {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const params = useSearchParams();
  const canTake = user?.permissions.includes('finance.write') ?? false;
  const [desk, setDesk] = useState<Desk | null>(null);
  const [shift, setShift] = useState<Shift>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(params.get('patient') ?? '');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [next, current] = await Promise.all([
        api<Desk>(`/finance/desk${branchId ? `?branchId=${branchId}` : ''}`),
        branchId ? api<Shift>(`/finance/cash-shift/current?branchId=${branchId}`).catch(() => null) : Promise.resolve(null),
      ]);
      setDesk(next);
      setShift(current);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Касса не загрузилась');
    }
  }, [branchId]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/ё/g, 'е');
    const digits = needle.replace(/\D/g, '');
    return (desk?.due ?? []).filter((row) => {
      if (!needle) return true;
      const name = row.patient.name.toLowerCase().replace(/ё/g, 'е');
      return name.includes(needle) || row.number.toLowerCase().includes(needle) || (digits.length >= 3 && (row.patient.phone ?? '').replace(/\D/g, '').includes(digits));
    });
  }, [desk, query]);
  const active = rows.find((row) => row.invoiceId === selected) ?? null;

  if (!desk) {
    return error
      ? <div className={styles.failed} role="alert"><p>{error}</p><button type="button" className="sd-btn" onClick={() => void load()}>Повторить</button></div>
      : <div className={styles.page} aria-busy="true"><div className="sd-skel" style={{ height: 88 }} /><div className="sd-skel" style={{ height: 320 }} /></div>;
  }

  const day = new Date(`${desk.day}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <h1 className={styles.title}>Касса<small>{day}</small></h1>
        <Link className="sd-btn-ghost" href="/finance/tools">Другие операции</Link>
      </header>

      <dl className={styles.totals}>
        <div>
          <dt>Принято сегодня</dt>
          <dd>{rub(desk.totals.revenueToday)}</dd>
          <small>наличными {rub(desk.totals.cashToday)} · картой и прочим {rub(desk.totals.otherToday)}</small>
        </div>
        <div data-tone={kopecks(desk.totals.dueToday) > 0 ? 'warn' : undefined}>
          <dt>Ждут оплаты сегодня</dt>
          <dd>{rub(desk.totals.dueToday)}</dd>
          <small>у пациентов с визитом сегодня</small>
        </div>
        <div>
          <dt>Все долги</dt>
          <dd>{rub(desk.totals.receivable)}</dd>
          <small>{desk.totals.openInvoices} {plural(desk.totals.openInvoices, 'счёт', 'счёта', 'счетов')}</small>
        </div>
      </dl>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.body}>
        <section className={styles.list} aria-labelledby="due-title">
          <div className={styles.listHead}>
            <h2 id="due-title">К оплате</h2>
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Найти пациента или счёт</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Фамилия, телефон или номер счёта" autoComplete="off" />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="Очистить"><X size={14} aria-hidden="true" /></button>}
            </label>
          </div>
          {rows.length === 0 ? (
            <p className={styles.none}>{query ? 'Никого не нашли.' : 'Долгов нет — все счета оплачены.'}</p>
          ) : (
            <ul className={styles.rows}>
              {rows.map((row) => (
                <li key={row.invoiceId}>
                  <button type="button" className={styles.row} aria-pressed={row.invoiceId === selected} onClick={() => setSelected(row.invoiceId)}>
                    <span className={styles.who}>
                      <b>{row.patient.name}</b>
                      <small>
                        {row.visitToday ? `визит сегодня в ${time(row.visitToday.startsAt)}` : `счёт от ${new Date(row.createdAt).toLocaleDateString('ru-RU')}`}
                        {' · '}{row.number}
                        {row.promiseNote ? ` · ${row.promiseNote}` : ''}
                      </small>
                    </span>
                    {row.visitToday && <span className={styles.today}>сегодня</span>}
                    <span className={styles.amount}>{rub(row.due)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <PayPanel
          row={active}
          canTake={canTake}
          onClose={() => setSelected(null)}
          onPaid={async () => { setSelected(null); await load(); }}
        />
      </div>

      <section className={styles.journal} aria-labelledby="paid-title">
        <h2 id="paid-title">Оплаты сегодня</h2>
        {desk.payments.length === 0 ? (
          <p className={styles.none}>Сегодня оплат ещё не было.</p>
        ) : (
          <ul>
            {desk.payments.map((payment) => <PaymentRow key={payment.id} payment={payment} canRefund={canTake} onDone={load} />)}
          </ul>
        )}
      </section>

      <ShiftPanel shift={shift} branchId={branchId} canTake={canTake} onChange={load} />
    </div>
  );
}

function PayPanel({ row, canTake, onClose, onPaid }: { row: Due | null; canTake: boolean; onClose: () => void; onPaid: () => Promise<void> }) {
  const key = useIdempotencyKey();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CASH' | 'CARD'>('CARD');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const rowId = row?.invoiceId ?? null;
  const rowDue = row?.due ?? '0';
  const { done } = key;
  useEffect(() => {
    setAmount(rowId ? String(kopecks(rowDue) / 100) : '');
    setError('');
    done();
  }, [rowId, rowDue, done]);

  if (!row) {
    return (
      <aside className={styles.pay} data-empty="true" aria-label="Оплата">
        <p className={styles.none}>Выберите пациента в списке, чтобы принять оплату.</p>
      </aside>
    );
  }

  const asked = Math.round(Number(String(amount).replace(',', '.')) * 100);
  const max = kopecks(row.due);
  const valid = Number.isFinite(asked) && asked > 0 && asked <= max;

  const take = async () => {
    if (!valid || pending) return;
    setPending(true);
    setError('');
    try {
      await api('/finance/payments', {
        method: 'POST',
        headers: key.headers(),
        body: JSON.stringify({ patientId: row.patient.id, invoiceId: row.invoiceId, amount: (asked / 100).toFixed(2), method }),
      });
      key.done();
      await onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Оплата не прошла. Проверьте сумму и попробуйте ещё раз');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button type="button" className={styles.scrim} aria-label="Закрыть оплату" onClick={onClose} />
      <aside className={styles.pay} aria-labelledby="pay-title">
        <div className={styles.payHead}>
          <div>
            <h2 id="pay-title">{row.patient.name}</h2>
            <p>{row.number}{row.patient.phone ? ` · ${row.patient.phone}` : ''}</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть оплату"><X size={18} aria-hidden="true" /></button>
        </div>
        <dl className={styles.breakdown}>
          <div><dt>По счёту</dt><dd>{rub(row.total)}</dd></div>
          {kopecks(row.discount) > 0 && <div><dt>Скидка</dt><dd>−{rub(row.discount)}</dd></div>}
          {kopecks(row.paid) > 0 && <div><dt>Уже оплачено</dt><dd>−{rub(row.paid)}</dd></div>}
          <div className={styles.left}><dt>Осталось</dt><dd>{rub(row.due)}</dd></div>
        </dl>
        {canTake ? (
          <>
            <label className={styles.field}>
              <span>Сумма</span>
              <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={!valid} />
              {!valid && amount !== '' && <small>От 0,01 ₽ до {rub(row.due)}</small>}
            </label>
            <div className={styles.methods} role="radiogroup" aria-label="Способ оплаты">
              {(['CARD', 'CASH'] as const).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={method === value} onClick={() => setMethod(value)}>{value === 'CARD' ? 'Карта' : 'Наличные'}</button>
              ))}
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="button" className="sd-btn" disabled={!valid || pending} onClick={() => void take()}>
              {pending ? 'Проводим…' : `Принять ${valid ? formatRub(asked) : ''}`}
            </button>
            <Link className={styles.link} href={`/patients/${row.patient.id}`}>Карта пациента</Link>
          </>
        ) : (
          <p className={styles.none}>Принимать оплату может администратор или кассир.</p>
        )}
      </aside>
    </>
  );
}

function PaymentRow({ payment, canRefund, onDone }: { payment: Paid; canRefund: boolean; onDone: () => Promise<void> }) {
  const key = useIdempotencyKey();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const left = kopecks(payment.refundable);
  const asked = Math.round(Number(String(amount).replace(',', '.')) * 100);
  const valid = Number.isFinite(asked) && asked > 0 && asked <= left;

  const refund = async () => {
    setPending(true);
    setError('');
    try {
      await api(`/finance/payments/${payment.id}/refund`, { method: 'POST', headers: key.headers(), body: JSON.stringify({ amount: (asked / 100).toFixed(2) }) });
      key.done();
      setOpen(false);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Возврат не прошёл');
    } finally {
      setPending(false);
    }
  };

  return (
    <li className={styles.paid} data-refund={payment.isRefund || undefined}>
      <time dateTime={payment.paidAt}>{time(payment.paidAt)}</time>
      <span className={styles.who}>
        <b>{payment.patient.name}</b>
        <small>{payment.isRefund ? 'возврат' : METHOD[payment.method] ?? payment.method}{payment.invoiceNumber ? ` · ${payment.invoiceNumber}` : ''}</small>
      </span>
      <span className={styles.amount}>{rub(payment.amount)}</span>
      {canRefund && left > 0 && !open && (
        <button type="button" className={styles.textBtn} onClick={() => { setAmount(String(left / 100)); setOpen(true); }}>Вернуть</button>
      )}
      {open && (
        <div className={styles.refund}>
          <label className={styles.field}>
            <span>Сумма возврата, до {formatRub(left)}</span>
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={!valid} />
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div>
            <button type="button" className="sd-btn-ghost" disabled={pending} onClick={() => setOpen(false)}>Отмена</button>
            <button type="button" className={styles.danger} disabled={!valid || pending} onClick={() => void refund()}>{pending ? 'Возвращаем…' : `Вернуть ${valid ? formatRub(asked) : ''}`}</button>
          </div>
        </div>
      )}
    </li>
  );
}

function ShiftPanel({ shift, branchId, canTake, onChange }: { shift: Shift; branchId: string | null | undefined; canTake: boolean; onChange: () => Promise<void> }) {
  const [cash, setCash] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState<Closed | null>(null);
  if (!canTake || !branchId) return null;

  const submit = async () => {
    setPending(true);
    setError('');
    try {
      if (shift?.status === 'OPEN') {
        const result = await api<Closed>(`/finance/cash-shift/${shift.id}/close`, { method: 'POST', body: JSON.stringify({ closingCash: Number(cash.replace(',', '.')) }) });
        setClosed(result);
      } else {
        await api('/finance/cash-shift/open', { method: 'POST', body: JSON.stringify({ branchId, openingCash: Number(cash.replace(',', '.')) }) });
        setClosed(null);
      }
      setCash('');
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setPending(false);
    }
  };

  const open = shift?.status === 'OPEN';
  const valid = cash !== '' && Number(cash.replace(',', '.')) >= 0;
  return (
    <section className={styles.shift} aria-labelledby="shift-title">
      <div>
        <h2 id="shift-title">Смена</h2>
        <p>{open ? `Открыта ${openedLabel(shift!.openedAt)}, в кассе при открытии ${rub(shift!.openingCash)}` : 'Смена закрыта. Перед приёмом наличных откройте её.'}</p>
        {closed && (
          <p className={styles.closed} data-off={kopecks(closed.difference) !== 0 || undefined}>
            Должно быть {rub(closed.expectedCash)}, посчитали {rub(closed.closingCash)}.
            {kopecks(closed.difference) === 0 ? ' Касса сошлась.' : kopecks(closed.difference) < 0 ? ` Недостача ${formatRub(-kopecks(closed.difference))}.` : ` Излишек ${rub(closed.difference)}.`}
          </p>
        )}
      </div>
      <label className={styles.field}>
        <span>{open ? 'Наличных в кассе сейчас' : 'Наличных при открытии'}</span>
        <input inputMode="decimal" value={cash} onChange={(event) => setCash(event.target.value)} placeholder="0" />
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="button" className={open ? 'sd-btn-ghost' : 'sd-btn'} disabled={!valid || pending} onClick={() => void submit()}>
        {pending ? 'Сохраняем…' : open ? 'Закрыть смену' : 'Открыть смену'}
      </button>
    </section>
  );
}

/** "в 09:12" for today, "19 окт. в 22:05" for a shift someone forgot to close. */
function openedLabel(iso: string) {
  const at = new Date(iso);
  const today = new Date().toDateString() === at.toDateString();
  return today ? `в ${time(iso)}` : `${at.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} в ${time(iso)} — не закрыта с прошлого дня`;
}

function plural(n: number, one: string, few: string, many: string) {
  const last = n % 10;
  const tens = n % 100;
  if (last === 1 && tens !== 11) return one;
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
}
