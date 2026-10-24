'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import styles from './patient-tabs.module.css';

type Invoice = { id: string; number: string; status: string; totalAmount: string; paidAmount: string; discountAmount: string; createdAt: string };
type Payment = { id: string; amount: string; method: string; paidAt: string; refundOfId: string | null; invoiceId: string | null };

const METHOD: Record<string, string> = { CASH: 'наличные', CARD: 'карта', ONLINE: 'онлайн', DMS: 'ДМС', INSTALLMENT: 'рассрочка', BONUS: 'бонусы' };
const INVOICE: Record<string, string> = { DRAFT: 'черновик', ISSUED: 'не оплачен', PARTIAL: 'оплачен частично', PAID: 'оплачен', CANCELLED: 'отменён' };

/** The patient's bills and payments: what was charged, what was paid, what is still owed. */
export function PatientMoney({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api<Invoice[]>(`/finance/invoices?patientId=${patientId}`), api<Payment[]>(`/finance/payments?patientId=${patientId}`)])
      .then(([bills, paid]) => { setInvoices(bills); setPayments(paid); })
      .catch((err: Error) => setError(err.message || 'Оплаты не загрузились'));
  }, [patientId]);
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  if (!invoices || !payments) return <div className={styles.skeleton} aria-label="Загружаем оплаты" />;
  const left = (row: Invoice) => Math.max(0, Number(row.totalAmount) - Number(row.discountAmount) - Number(row.paidAmount));
  const debt = invoices.filter((row) => row.status === 'ISSUED' || row.status === 'PARTIAL').reduce((sum, row) => sum + left(row), 0);
  const paidTotal = payments.filter((row) => row.method !== 'BONUS').reduce((sum, row) => sum + Number(row.amount), 0);
  return (
    <div className={styles.stack}>
      <section className={styles.sum}>
        <div><span><i data-code={debt > 0 ? 'owe' : 'paid'} />Долг</span><b>{formatMoney(debt)}</b></div>
        <div><span>Оплачено всего</span><b>{formatMoney(paidTotal)}</b></div>
        <div className={styles.sumAct}><Link className="sd-btn" href={`/finance?patient=${encodeURIComponent(patientName.split(' ')[0])}`}>Принять оплату</Link></div>
      </section>
      <section className={styles.m}>
        <h2>Счета<em>{invoices.length}</em></h2>
        {invoices.length === 0 ? <p className={styles.none}>Счетов нет. Они появляются, когда врач закрывает визит с услугами.</p> : (
          <ul className={styles.list}>
            {invoices.map((row) => (
              <li key={row.id} className={styles.row}>
                <span className={styles.when}><b>{new Date(row.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</b><small>№ {row.number}</small></span>
                <span className={styles.what}><b>{formatMoney(Number(row.totalAmount) - Number(row.discountAmount))}</b><small>{Number(row.discountAmount) > 0 ? `скидка ${formatMoney(Number(row.discountAmount))} · ` : ''}оплачено {formatMoney(Number(row.paidAmount))}{left(row) > 0 && row.status !== 'CANCELLED' ? ` · осталось ${formatMoney(left(row))}` : ''}</small></span>
                <span className={styles.state}><i data-code={row.status === 'PAID' ? 'paid' : row.status === 'CANCELLED' ? 'gone' : 'owe'} />{INVOICE[row.status] ?? row.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={styles.m}>
        <h2>Оплаты и возвраты<em>{payments.length}</em></h2>
        {payments.length === 0 ? <p className={styles.none}>Оплат ещё не было.</p> : (
          <ul className={styles.list}>
            {payments.map((row) => (
              <li key={row.id} className={styles.row}>
                <span className={styles.when}><b>{new Date(row.paidAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</b><small>{new Date(row.paidAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small></span>
                <span className={styles.what}><b>{row.refundOfId || Number(row.amount) < 0 ? `Возврат ${formatMoney(Math.abs(Number(row.amount)))}` : formatMoney(Number(row.amount))}</b><small>{METHOD[row.method] ?? row.method}{row.invoiceId ? '' : ' · аванс без счёта'}</small></span>
                <span className={styles.state}><i data-code={row.refundOfId || Number(row.amount) < 0 ? 'owe' : 'paid'} />{row.refundOfId || Number(row.amount) < 0 ? 'возврат' : 'оплата'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
