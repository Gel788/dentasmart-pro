'use client';

import { FormEvent, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { api, assetUrl, uploadFile } from '@/lib/api';
import { FlaskConical } from 'lucide-react';

const LAB_STATUS = ['RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'REJECTED'] as const;
const LAB_LABEL: Record<string, string> = {
  RECEIVED: 'Принято', IN_PROGRESS: 'В работе', READY: 'Готово', DELIVERED: 'Доставлено', REJECTED: 'Отклонено',
};

const STATUS_VARIANT: Record<string, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  RECEIVED: 'default',
  IN_PROGRESS: 'accent',
  READY: 'success',
  DELIVERED: 'success',
  REJECTED: 'danger',
};

export default function LabPage() {
  const [orders, setOrders] = useState<unknown[]>([]);
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState('');
  const [patientId, setPatientId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [patients, setPatients] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [scanError, setScanError] = useState('');

  const load = () => api<unknown[]>('/lab/orders').then(setOrders);
  useEffect(() => {
    load();
    api<{ items: { id: string; firstName: string; lastName: string }[] }>('/patients?pageSize=200').then((r) => setPatients(r.items));
    api<{ id: string; firstName: string; lastName: string }[]>('/employees').then(setDoctors);
  }, []);

  const setStatus = (id: string, status: string) =>
    api(`/lab/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(load);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    await api('/lab/orders', {
      method: 'POST',
      body: JSON.stringify({
        title,
        patientId: patientId || undefined,
        doctorId: doctorId || undefined,
        dueAt: dueAt || undefined,
        costAmount: costAmount ? Number(costAmount) : undefined,
      }),
    });
    setModal(false);
    load();
  };

  const orderList = orders as {
    id: string;
    title: string;
    status: string;
    shade?: string;
    patient?: { firstName: string; lastName: string } | null;
    doctor?: { firstName: string; lastName: string } | null;
    dueAt?: string | null;
    costAmount?: string | null;
    stlFileUrl?: string | null;
  }[];
  const overdue = orderList.filter((order) => order.dueAt && !['DELIVERED', 'REJECTED'].includes(order.status) && new Date(order.dueAt) < new Date());

  return (
    <Protected>
      <PageHeader
        badge="Лаборатория"
        title="Зуботехническая лаборатория"
        description="Заказ-наряды и статусы"
        action={<Button onClick={() => setModal(true)}>+ Заказ</Button>}
      />

      {scanError && <p className="mb-4 border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{scanError}</p>}
      {!!overdue.length && (
        <div className="mb-4 border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          Просрочено нарядов: {overdue.length}. {overdue.map((order) => order.title).join(', ')}
        </div>
      )}

      <Card padding={false} className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <CardHeader title="Заказ-наряды" description="Статус работы в лаборатории" />
        </div>
        <div>
          {orderList.length ? orderList.map((o) => (
            <Card key={o.id} className="!rounded-none !border-x-0 !border-t-0 !p-4 last:!border-b-0" padding>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--text)]">{o.title}</p>
                  {o.patient && <p className="mt-0.5 text-xs text-[var(--muted)]">{o.patient.lastName} {o.patient.firstName}</p>}
                  {o.doctor && <p className="text-xs text-[var(--muted)]">Врач: {o.doctor.lastName}</p>}
                  {o.dueAt && (
                    <p className="text-xs text-[var(--muted)]">
                      Срок: {new Date(o.dueAt).toLocaleDateString('ru-RU')}
                      {o.costAmount ? ` · лаборатория ${Number(o.costAmount).toLocaleString('ru-RU')} ₽` : ''}
                    </p>
                  )}
                  {o.shade && <p className="mt-0.5 text-xs text-[var(--muted)]">Оттенок: {o.shade}</p>}
                </div>
                <Badge variant={STATUS_VARIANT[o.status] ?? 'default'}>{LAB_LABEL[o.status] ?? o.status}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                {o.stlFileUrl ? (
                  <a className="font-medium text-[var(--accent)]" href={assetUrl(o.stlFileUrl)} target="_blank" rel="noreferrer">Скан STL</a>
                ) : (
                  <span className="text-[var(--muted)]">Скана нет</span>
                )}
                <label className="cursor-pointer font-medium text-[var(--text)]">
                  Прикрепить STL
                  <input
                    type="file"
                    accept=".stl,.obj,.ply"
                    className="sr-only"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      setScanError('');
                      try {
                        const fileUrl = await uploadFile(file);
                        await api(`/lab/orders/${o.id}/scan`, { method: 'PATCH', body: JSON.stringify({ fileUrl }) });
                        load();
                      } catch (e) {
                        setScanError(e instanceof Error ? e.message : 'Скан не прикрепился');
                      }
                    }}
                  />
                </label>
              </div>
              <div className="mt-3 inline-flex flex-wrap gap-1 border-t border-[var(--border)] pt-3">
                {LAB_STATUS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(o.id, s)}
                    className={clsx(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      o.status === s
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-hover)]'
                        : 'text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-secondary)]',
                    )}
                  >
                    {LAB_LABEL[s]}
                  </button>
                ))}
              </div>
            </Card>
          )) : (
            <EmptyState icon={FlaskConical} title="Нет заказов" description="Создайте первый заказ-наряд" />
          )}
        </div>
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Новый заказ-наряд" description="Работа для зуботехнической лаборатории">
        <form onSubmit={onCreate} className="space-y-3">
          <div><Label>Название работы</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div>
            <Label>Пациент</Label>
            <Select aria-label="Пациент заказа" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">Не выбран</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}
            </Select>
          </div>
          <div>
            <Label>Врач</Label>
            <Select aria-label="Врач заказа" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Не выбран</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.lastName} {d.firstName}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Срок</Label>
              <Input type="date" aria-label="Срок наряда" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
            <div>
              <Label>Себестоимость, ₽</Label>
              <Input type="number" min={0} aria-label="Себестоимость лаборатории" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} />
            </div>
          </div>
          <Button type="submit" className="w-full">Создать</Button>
        </form>
      </Modal>
    </Protected>
  );
}
