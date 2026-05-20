'use client';

import { FormEvent, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
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

  const load = () => api<unknown[]>('/lab/orders').then(setOrders);
  useEffect(() => { load(); }, []);

  const setStatus = (id: string, status: string) =>
    api(`/lab/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(load);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    await api('/lab/orders', { method: 'POST', body: JSON.stringify({ title }) });
    setModal(false);
    load();
  };

  const orderList = orders as { id: string; title: string; status: string; shade?: string }[];

  return (
    <Protected>
      <PageHeader
        badge="Лаборатория"
        title="Зуботехническая лаборатория"
        description="Заказ-наряды и статусы"
        action={<Button onClick={() => setModal(true)}>+ Заказ</Button>}
      />

      <Card>
        <CardHeader title="Заказ-наряды" description="Статус работы в лаборатории" />
        <div className="space-y-3">
          {orderList.length ? orderList.map((o) => (
            <Card key={o.id} className="!p-4" padding>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--text)]">{o.title}</p>
                  {o.shade && <p className="mt-0.5 text-xs text-[var(--muted)]">Оттенок: {o.shade}</p>}
                </div>
                <Badge variant={STATUS_VARIANT[o.status] ?? 'default'}>{LAB_LABEL[o.status] ?? o.status}</Badge>
              </div>
              <div className="mt-3 inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-1">
                {LAB_STATUS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(o.id, s)}
                    className={clsx(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                      o.status === s
                        ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                        : 'text-[var(--muted)] hover:text-[var(--text-secondary)]',
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
          <Button type="submit" className="w-full">Создать</Button>
        </form>
      </Modal>
    </Protected>
  );
}
