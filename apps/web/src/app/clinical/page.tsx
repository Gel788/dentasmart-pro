'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Stethoscope } from 'lucide-react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';
import { formatMoney, label, PLAN_STATUS } from '@/lib/format';

export default function ClinicalPage() {
  const [plans, setPlans] = useState<unknown[]>([]);
  const [patients, setPatients] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ patientId: '', title: '' });

  const load = () => api<unknown[]>('/clinical/treatment-plans').then(setPlans);

  useEffect(() => {
    load();
    api<{ items: { id: string; firstName: string; lastName: string }[] }>('/patients').then((r) => setPatients(r.items));
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const plan = await api<{ id: string }>('/clinical/treatment-plans', { method: 'POST', body: JSON.stringify(form) });
    setModal(false);
    window.location.href = `/clinical/${plan.id}`;
  };

  const planList = plans as {
    id: string;
    title: string;
    status: string;
    totalPrice: string;
    patient: { id: string; firstName: string; lastName: string };
    items: { title: string }[];
  }[];

  return (
    <Protected>
      <PageHeader
        badge="Клиника"
        title="Планы лечения"
        description="Этапы, дневник и согласование — полный цикл в одном месте"
        action={<Button onClick={() => setModal(true)}>+ План лечения</Button>}
      />

      {planList.length ? (
        <div className="ds-card overflow-hidden p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                <th className="px-5 py-3.5">План</th>
                <th className="px-5 py-3.5">Пациент</th>
                <th className="px-5 py-3.5">Этапы</th>
                <th className="px-5 py-3.5">Статус</th>
                <th className="px-5 py-3.5 text-right">Сумма</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {planList.map((plan) => (
                <tr key={plan.id} className="ds-table-row group">
                  <td className="px-5 py-4">
                    <Link href={`/clinical/${plan.id}`} className="font-semibold text-[var(--text)] group-hover:text-[var(--accent)]">
                      {plan.title}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-[var(--text-secondary)]">
                    {plan.patient.lastName} {plan.patient.firstName}
                  </td>
                  <td className="px-5 py-4 tabular-nums text-[var(--muted)]">{plan.items?.length ?? 0}</td>
                  <td className="px-5 py-4">
                    <Badge variant={plan.status === 'ACTIVE' ? 'accent' : 'default'}>
                      {label(PLAN_STATUS, plan.status) || plan.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right font-semibold tabular-nums text-[var(--accent)]">
                    {formatMoney(plan.totalPrice)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/clinical/${plan.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
                    >
                      Открыть
                      <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Stethoscope}
          title="Пока нет планов"
          description="Создайте первый план лечения для пациента"
        />
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Новый план лечения"
        description="Выберите пациента и название плана"
      >
        <form onSubmit={onCreate} className="space-y-3">
          <div>
            <Label>Пациент</Label>
            <Select required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
              <option value="">—</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>
              ))}
            </Select>
          </div>
          <div><Label>Название</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <Button type="submit" className="w-full">Создать и открыть</Button>
        </form>
      </Modal>
    </Protected>
  );
}
