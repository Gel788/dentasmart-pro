'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

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

      <div className="space-y-2">
        {planList.map((plan) => (
          <ListRow
            key={plan.id}
            href={`/clinical/${plan.id}`}
            trailing={<span className="font-semibold text-[var(--accent)]">{formatMoney(plan.totalPrice)}</span>}
          >
            <p className="font-semibold text-[var(--text)]">{plan.title}</p>
            <p className="mt-0.5 text-[var(--muted)]">
              {plan.patient.lastName} {plan.patient.firstName} · {plan.items?.length ?? 0} этапов
            </p>
            <Badge variant={plan.status === 'ACTIVE' ? 'accent' : 'default'}>{plan.status}</Badge>
          </ListRow>
        ))}
        {!planList.length && (
          <EmptyState
            icon={Stethoscope}
            title="Пока нет планов"
            description="Создайте первый план лечения для пациента"
          />
        )}
      </div>

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
