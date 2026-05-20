'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDateOnly, formatMoney, label, INVOICE_STATUS } from '@/lib/format';

type InvoicePrint = {
  id: string;
  number: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
  createdAt: string;
  organization: { name: string };
  patient: { firstName: string; lastName: string; phone?: string | null };
  payments: { amount: string; method: string; paidAt: string }[];
};

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<InvoicePrint | null>(null);

  useEffect(() => {
    api<InvoicePrint>(`/finance/invoices/${id}`).then(setInv);
  }, [id]);

  if (!inv) {
    return <Protected><p className="p-8 text-[var(--muted)]">Загрузка…</p></Protected>;
  }

  return (
    <Protected>
      <div className="mb-6 flex gap-2 print:hidden">
        <Button onClick={() => window.print()}>Печать</Button>
        <Button variant="ghost" onClick={() => window.close()}>Закрыть</Button>
      </div>
      <article className="mx-auto max-w-2xl rounded-2xl border border-[var(--border)] bg-white p-10 text-[var(--text)] shadow-sm print:border-0 print:shadow-none">
        <header className="border-b border-[var(--border)] pb-6">
          <h1 className="text-2xl font-bold">{inv.organization.name}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Счёт на оплату</p>
        </header>
        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[var(--muted)]">Номер</p>
            <p className="font-semibold">{inv.number}</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Дата</p>
            <p className="font-semibold">{formatDateOnly(inv.createdAt)}</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Пациент</p>
            <p className="font-semibold">{inv.patient.lastName} {inv.patient.firstName}</p>
            {inv.patient.phone && <p className="text-[var(--muted)]">{inv.patient.phone}</p>}
          </div>
          <div>
            <p className="text-[var(--muted)]">Статус</p>
            <p className="font-semibold">{label(INVOICE_STATUS, inv.status)}</p>
          </div>
        </div>
        <div className="mt-8 rounded-xl bg-[var(--surface-muted)] p-6">
          <p className="text-sm text-[var(--muted)]">К оплате</p>
          <p className="text-3xl font-bold text-[var(--accent)]">{formatMoney(inv.totalAmount)}</p>
          <p className="mt-2 text-sm">Оплачено: {formatMoney(inv.paidAmount)}</p>
        </div>
        {inv.payments.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-2 font-semibold">Платежи</h2>
            <ul className="space-y-1 text-sm">
              {inv.payments.map((p, i) => (
                <li key={i} className="flex justify-between border-b border-[var(--border)] py-2">
                  <span>{new Date(p.paidAt).toLocaleString('ru-RU')}</span>
                  <span>{formatMoney(p.amount)} · {p.method}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </Protected>
  );
}
