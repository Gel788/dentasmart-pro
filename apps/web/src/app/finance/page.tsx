'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreditCard, Receipt, Wallet } from 'lucide-react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { ListRow } from '@/components/ui/list-row';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { TabBar } from '@/components/ui/tab-bar';
import { formatMoney, INSTALLMENT_STATUS, INVOICE_STATUS, PAYMENT_METHOD, label } from '@/lib/format';

type FinanceTab = 'main' | 'extra';

function FinancePageContent() {
  const searchParams = useSearchParams();
  const prePatientId = searchParams.get('patientId') ?? '';
  const preInvoiceId = searchParams.get('invoiceId') ?? '';
  const { branchId } = useBranch();
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [invoices, setInvoices] = useState<unknown[]>([]);
  const [payments, setPayments] = useState<unknown[]>([]);
  const [patients, setPatients] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [invModal, setInvModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [invForm, setInvForm] = useState({ patientId: '', number: '', totalAmount: '' });
  const [payForm, setPayForm] = useState({ patientId: '', amount: '', method: 'CASH', invoiceId: '' });
  const [shift, setShift] = useState<{ id: string; status: string; openingCash: string; openedAt: string } | null>(null);
  const [closeCash, setCloseCash] = useState('');
  const [deposits, setDeposits] = useState<unknown[]>([]);
  const [installments, setInstallments] = useState<unknown[]>([]);
  const [families, setFamilies] = useState<unknown[]>([]);
  const [payrollRules, setPayrollRules] = useState<unknown[]>([]);
  const [promos, setPromos] = useState<unknown[]>([]);
  const [financeTab, setFinanceTab] = useState<FinanceTab>('main');
  const [depositModal, setDepositModal] = useState(false);
  const [installmentModal, setInstallmentModal] = useState(false);
  const [familyModal, setFamilyModal] = useState(false);
  const [promoModal, setPromoModal] = useState(false);
  const [depositForm, setDepositForm] = useState({ patientId: '', amount: '' });
  const [installmentForm, setInstallmentForm] = useState({ patientId: '', totalAmount: '', months: '6' });
  const [familyForm, setFamilyForm] = useState({ name: '', patientIds: [] as string[] });
  const [promoForm, setPromoForm] = useState({ code: '', discountPct: '10' });

  const load = () => {
    const invQ = prePatientId ? `?patientId=${prePatientId}` : '';
    api<Record<string, number>>('/finance/summary').then(setSummary);
    api<unknown[]>(`/finance/invoices${invQ}`).then(setInvoices);
    api<unknown[]>(`/finance/payments${invQ}`).then(setPayments);
    if (branchId) api<typeof shift | null>(`/finance/cash-shift/current?branchId=${branchId}`).then(setShift);
    api<unknown[]>('/finance/deposits').then(setDeposits);
    api<unknown[]>('/finance/installments').then(setInstallments);
    api<unknown[]>('/finance/family-groups').then(setFamilies);
    api<unknown[]>('/finance/payroll-rules').then(setPayrollRules);
    api<unknown[]>('/finance/promo-codes').then(setPromos);
  };

  useEffect(() => {
    load();
    api<{ items: { id: string; firstName: string; lastName: string }[] }>('/patients?pageSize=500').then((r) => setPatients(r.items));
  }, [branchId, prePatientId]);

  useEffect(() => {
    if (!prePatientId) return;
    setInvForm((f) => ({ ...f, patientId: prePatientId }));
    setPayForm((f) => ({ ...f, patientId: prePatientId, invoiceId: preInvoiceId }));
    if (preInvoiceId) setPayModal(true);
  }, [prePatientId, preInvoiceId]);

  useEffect(() => {
    if (!preInvoiceId || !invoices.length) return;
    const inv = (invoices as { id: string; totalAmount: string; paidAmount: string; patient: { id: string } }[]).find(
      (i) => i.id === preInvoiceId,
    );
    if (inv) {
      const remaining = Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount));
      setPayForm((f) => ({
        ...f,
        patientId: inv.patient.id,
        invoiceId: inv.id,
        amount: remaining > 0 ? String(remaining) : f.amount,
      }));
    }
  }, [preInvoiceId, invoices]);

  const openPayForInvoice = (inv: {
    id: string;
    totalAmount: string;
    paidAmount: string;
    status: string;
    patient: { id: string };
  }) => {
    const remaining = Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount));
    setPayForm({
      patientId: inv.patient.id,
      amount: remaining > 0 ? String(remaining) : '',
      method: 'CASH',
      invoiceId: inv.id,
    });
    setPayModal(true);
  };

  const createInvoice = async (e: FormEvent) => {
    e.preventDefault();
    await api('/finance/invoices', {
      method: 'POST',
      body: JSON.stringify({ ...invForm, totalAmount: +invForm.totalAmount }),
    });
    setInvModal(false);
    load();
  };

  const createPayment = async (e: FormEvent) => {
    e.preventDefault();
    await api('/finance/payments', {
      method: 'POST',
      body: JSON.stringify({
        patientId: payForm.patientId,
        amount: +payForm.amount,
        method: payForm.method,
        invoiceId: payForm.invoiceId || undefined,
      }),
    });
    setPayModal(false);
    load();
  };

  return (
    <Protected>
      {prePatientId && (
        <div className="mb-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 px-4 py-3 text-sm text-[var(--text-secondary)]">
          Фильтр по пациенту из карточки ·{' '}
          <a href="/finance" className="font-medium text-[var(--accent)] hover:underline">
            сбросить
          </a>
        </div>
      )}

      <PageHeader
        badge="Финансы"
        title="Касса и учёт"
        description="Счета, оплаты, депозиты и рассрочки"
        action={
          <>
            <Button variant="ghost" onClick={() => setDepositModal(true)}>Депозит</Button>
            <Button variant="ghost" onClick={() => setInstallmentModal(true)}>Рассрочка</Button>
            <Button variant="ghost" onClick={() => setInvModal(true)}>+ Счёт</Button>
            <Button onClick={() => setPayModal(true)}>+ Оплата</Button>
          </>
        }
      />

      <Card className="mb-6">
        <CardHeader title="Кассовая смена" description="Внутренний учёт наличных по филиалу" />
        {shift?.status === 'OPEN' ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <p className="text-sm text-[var(--muted)]">
              Открыта с {new Date(shift.openedAt).toLocaleString('ru-RU')} · в кассе: {formatMoney(shift.openingCash)}
            </p>
            <Input placeholder="Сумма в кассе при закрытии" type="number" value={closeCash} onChange={(e) => setCloseCash(e.target.value)} className="max-w-xs" />
            <Button
              variant="danger"
              onClick={async () => {
                await api(`/finance/cash-shift/${shift.id}/close`, {
                  method: 'POST',
                  body: JSON.stringify({ closingCash: +closeCash }),
                });
                load();
              }}
            >
              Закрыть смену
            </Button>
          </div>
        ) : (
          <Button
            className="mt-3"
            onClick={async () => {
              await api('/finance/cash-shift/open', {
                method: 'POST',
                body: JSON.stringify({ branchId, openingCash: 5000 }),
              });
              load();
            }}
          >
            Открыть смену (5000 ₽)
          </Button>
        )}
      </Card>

      <TabBar
        tabs={[
          { id: 'main' as FinanceTab, label: 'Операции' },
          { id: 'extra' as FinanceTab, label: 'Депозиты и семьи' },
        ]}
        value={financeTab}
        onChange={setFinanceTab}
      />

      {summary && (
        <div className="mb-8 mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Дебиторка" value={formatMoney(summary.receivable)} icon={Wallet} tone="amber" />
          <StatCard label="Выручка сегодня" value={formatMoney(summary.revenueToday ?? 0)} icon={CreditCard} tone="teal" />
          <StatCard label="Открытых счетов" value={summary.openInvoices} icon={Receipt} tone="blue" />
          <StatCard label="Всего оплат" value={formatMoney(summary.totalPayments)} icon={CreditCard} tone="teal" />
        </div>
      )}

      {financeTab === 'main' && (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Счета" />
          <div className="space-y-2">
            {(invoices as { id: string; number: string; totalAmount: string; paidAmount: string; status: string; patient: { id: string; lastName: string; firstName: string } }[]).map((inv) => (
              <ListRow
                key={inv.id}
                trailing={
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={inv.status === 'PAID' ? 'success' : 'warning'}>{label(INVOICE_STATUS, inv.status)}</Badge>
                    {inv.status !== 'PAID' && (
                      <Button size="sm" onClick={() => openPayForInvoice(inv)}>
                        Оплатить
                      </Button>
                    )}
                  </div>
                }
              >
                <p className="font-medium">{inv.number} — {inv.patient.lastName} {inv.patient.firstName}</p>
                <p className="text-[var(--muted)]">{formatMoney(inv.paidAmount)} / {formatMoney(inv.totalAmount)}</p>
                <a href={`/finance/invoices/${inv.id}/print`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-[var(--accent)] hover:underline">Печать</a>
              </ListRow>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Оплаты" />
          <div className="space-y-2">
            {(payments as { id: string; amount: string; method: string; paidAt: string }[]).map((p) => (
              <ListRow key={p.id}>
                <p className="font-medium">{formatMoney(p.amount)}</p>
                <p className="text-[var(--muted)]">{label(PAYMENT_METHOD, p.method)} · {new Date(p.paidAt).toLocaleDateString('ru-RU')}</p>
              </ListRow>
            ))}
          </div>
        </Card>
      </div>
      )}

      {financeTab === 'extra' && (
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader title="Депозиты" action={<Button size="sm" variant="ghost" onClick={() => setDepositModal(true)}>Пополнить</Button>} />
          <ul className="space-y-2 text-sm">
            {(deposits as { patient: { firstName: string; lastName: string }; balance: string }[]).map((d, i) => (
              <li key={i} className="flex justify-between rounded-xl bg-[var(--surface-muted)]/50 px-3 py-2">
                <span>{d.patient.lastName} {d.patient.firstName}</span>
                <span className="font-semibold text-[var(--accent)]">{formatMoney(d.balance)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Рассрочки" action={<Button size="sm" variant="ghost" onClick={() => setInstallmentModal(true)}>Создать</Button>} />
          <ul className="space-y-2 text-sm">
            {(installments as { patient: { lastName: string }; totalAmount: string; status: string }[]).map((p, i) => (
              <li key={i} className="flex justify-between rounded-xl bg-[var(--surface-muted)]/50 px-3 py-2">
                <span>{p.patient.lastName}</span>
                <span>{formatMoney(p.totalAmount)} · <Badge>{label(INSTALLMENT_STATUS, p.status)}</Badge></span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Семейные счета" action={<Button size="sm" variant="ghost" onClick={() => setFamilyModal(true)}>+ Группа</Button>} />
          <ul className="space-y-2 text-sm">
            {(families as { name: string; members: { patient: { lastName: string } }[] }[]).map((f, i) => (
              <li key={i} className="rounded-xl bg-[var(--surface-muted)]/50 px-3 py-2">
                <span className="font-medium">{f.name}</span>
                <span className="text-[var(--muted)]"> — {f.members.map((m) => m.patient.lastName).join(', ')}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Промокоды" action={<Button size="sm" variant="ghost" onClick={() => setPromoModal(true)}>+ Код</Button>} />
          <ul className="space-y-2 text-sm">
            {(promos as { code: string; discountPct?: string; isActive: boolean }[]).map((pr, i) => (
              <li key={i} className="flex justify-between rounded-xl bg-[var(--surface-muted)]/50 px-3 py-2">
                <span className="font-mono font-medium">{pr.code}</span>
                <span>{pr.discountPct ?? 0}% · {pr.isActive ? 'активен' : 'выкл'}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Правила зарплаты" />
          <ul className="space-y-2 text-sm">
            {(payrollRules as { name: string; ruleType: string }[]).map((r, i) => (
              <li key={i} className="flex justify-between rounded-xl bg-[var(--surface-muted)]/50 px-3 py-2">
                <span>{r.name}</span>
                <Badge>{r.ruleType}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      )}

      <Modal open={invModal} onClose={() => setInvModal(false)} title="Новый счёт">
        <form onSubmit={createInvoice} className="space-y-3">
          <div><Label>Пациент</Label>
            <Select required value={invForm.patientId} onChange={(e) => setInvForm({ ...invForm, patientId: e.target.value })}>
              <option value="">—</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}
            </Select>
          </div>
          <div><Label>Номер</Label><Input required value={invForm.number} onChange={(e) => setInvForm({ ...invForm, number: e.target.value })} /></div>
          <div><Label>Сумма</Label><Input type="number" required value={invForm.totalAmount} onChange={(e) => setInvForm({ ...invForm, totalAmount: e.target.value })} /></div>
          <Button type="submit" className="w-full">Выставить</Button>
        </form>
      </Modal>

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Приём оплаты">
        <form onSubmit={createPayment} className="space-y-3">
          <div><Label>Пациент</Label>
            <Select required value={payForm.patientId} onChange={(e) => setPayForm({ ...payForm, patientId: e.target.value })}>
              <option value="">—</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}
            </Select>
          </div>
          <div><Label>Сумма</Label><Input type="number" required value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
          <div><Label>Способ</Label>
            <Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
              {Object.entries(PAYMENT_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div><Label>Счёт (необязательно)</Label>
            <Select value={payForm.invoiceId} onChange={(e) => setPayForm({ ...payForm, invoiceId: e.target.value })}>
              <option value="">Без привязки</option>
              {(invoices as { id: string; number: string; status: string; patient: { id: string; lastName: string; firstName: string } }[])
                .filter((inv) => !payForm.patientId || inv.patient.id === payForm.patientId)
                .filter((inv) => inv.status !== 'PAID' && inv.status !== 'CANCELLED')
                .map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.number} — {inv.patient.lastName} {inv.patient.firstName}
                  </option>
                ))}
            </Select>
          </div>
          <Button type="submit" className="w-full">Провести</Button>
        </form>
      </Modal>

      <Modal open={depositModal} onClose={() => setDepositModal(false)} title="Пополнение депозита" size="lg">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          await api('/finance/deposits/top-up', { method: 'POST', body: JSON.stringify({ patientId: depositForm.patientId, amount: +depositForm.amount }) });
          setDepositModal(false);
          load();
        }}>
          <div><Label>Пациент</Label>
            <Select required value={depositForm.patientId} onChange={(e) => setDepositForm({ ...depositForm, patientId: e.target.value })}>
              <option value="">—</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}
            </Select>
          </div>
          <div><Label>Сумма</Label><Input type="number" required value={depositForm.amount} onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })} /></div>
          <Button type="submit" className="w-full">Пополнить</Button>
        </form>
      </Modal>

      <Modal open={installmentModal} onClose={() => setInstallmentModal(false)} title="Рассрочка" size="lg">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          await api('/finance/installments', { method: 'POST', body: JSON.stringify({ patientId: installmentForm.patientId, totalAmount: +installmentForm.totalAmount, months: +installmentForm.months }) });
          setInstallmentModal(false);
          load();
        }}>
          <div><Label>Пациент</Label>
            <Select required value={installmentForm.patientId} onChange={(e) => setInstallmentForm({ ...installmentForm, patientId: e.target.value })}>
              <option value="">—</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}
            </Select>
          </div>
          <div><Label>Сумма</Label><Input type="number" required value={installmentForm.totalAmount} onChange={(e) => setInstallmentForm({ ...installmentForm, totalAmount: e.target.value })} /></div>
          <div><Label>Месяцев</Label><Input type="number" required value={installmentForm.months} onChange={(e) => setInstallmentForm({ ...installmentForm, months: e.target.value })} /></div>
          <Button type="submit" className="w-full">Оформить</Button>
        </form>
      </Modal>

      <Modal open={familyModal} onClose={() => setFamilyModal(false)} title="Семейная группа" size="lg">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          await api('/finance/family-groups', { method: 'POST', body: JSON.stringify({ name: familyForm.name, patientIds: familyForm.patientIds }) });
          setFamilyModal(false);
          load();
        }}>
          <div><Label>Название</Label><Input required value={familyForm.name} onChange={(e) => setFamilyForm({ ...familyForm, name: e.target.value })} /></div>
          <div>
            <Label>Участники</Label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] p-2">
              {patients.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-muted)]">
                  <input
                    type="checkbox"
                    checked={familyForm.patientIds.includes(p.id)}
                    onChange={(e) => {
                      setFamilyForm((f) => ({
                        ...f,
                        patientIds: e.target.checked
                          ? [...f.patientIds, p.id]
                          : f.patientIds.filter((id) => id !== p.id),
                      }));
                    }}
                  />
                  {p.lastName} {p.firstName}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={familyForm.patientIds.length < 2}>Создать</Button>
        </form>
      </Modal>

      <Modal open={promoModal} onClose={() => setPromoModal(false)} title="Промокод">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          await api('/finance/promo-codes', { method: 'POST', body: JSON.stringify({ code: promoForm.code, discountPct: +promoForm.discountPct }) });
          setPromoModal(false);
          load();
        }}>
          <div><Label>Код</Label><Input required value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value })} /></div>
          <div><Label>Скидка %</Label><Input type="number" value={promoForm.discountPct} onChange={(e) => setPromoForm({ ...promoForm, discountPct: e.target.value })} /></div>
          <Button type="submit" className="w-full">Создать</Button>
        </form>
      </Modal>
    </Protected>
  );
}

export default function FinancePage() {
  return (
    <Suspense fallback={<Protected><p className="text-[var(--muted)]">Загрузка кассы…</p></Protected>}>
      <FinancePageContent />
    </Suspense>
  );
}
