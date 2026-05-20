'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, Package } from 'lucide-react';
import { Protected } from '@/components/protected';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar } from '@/components/ui/tab-bar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { ListRow } from '@/components/ui/list-row';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';

type Tab = 'stock' | 'inventory' | 'norms';

export default function WarehousePage() {
  const { branchId } = useBranch();
  const [tab, setTab] = useState<Tab>('stock');
  const [items, setItems] = useState<unknown[]>([]);
  const [low, setLow] = useState<unknown[]>([]);
  const [session, setSession] = useState<{
    id: string;
    lines: { id: string; expectedQty: string; actualQty: string; diffQty: string; item: { name: string } }[];
  } | null>(null);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [norms, setNorms] = useState<unknown[]>([]);
  const load = () => {
    if (!branchId) return;
    api<unknown[]>('/warehouse/items').then(setItems);
    api<unknown[]>('/warehouse/low-stock').then(setLow);
    api<typeof session | null>(`/warehouse/inventory/active?branchId=${branchId}`).then(setSession);
    api<unknown[]>('/warehouse/material-norms').then(setNorms);
  };

  useEffect(() => {
    load();
  }, [branchId]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    await api('/warehouse/items', { method: 'POST', body: JSON.stringify({ name }) });
    setModal(false);
    load();
  };

  const startInventory = async () => {
    const s = await api<typeof session>(`/warehouse/inventory/start`, {
      method: 'POST',
      body: JSON.stringify({ branchId }),
    });
    setSession(s);
    setTab('inventory');
  };

  const updateLine = async (lineId: string, actualQty: number) => {
    await api(`/warehouse/inventory/lines/${lineId}`, {
      method: 'PATCH',
      body: JSON.stringify({ actualQty }),
    });
    load();
  };

  const completeInventory = async () => {
    if (!session) return;
    await api(`/warehouse/inventory/${session.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ branchId }),
    });
    setSession(null);
    load();
  };

  const stockItems = items as { id: string; name: string; sku?: string; batches: { quantity: string }[] }[];
  const lowCount = (low as unknown[]).length;
  const normItems = norms as { id: string; quantity: string; service: { name: string }; item: { name: string } }[];

  return (
    <Protected>
      <PageHeader
        badge="Склад"
        title="Материалы и остатки"
        description="Инвентаризация и нормы расхода по услугам"
        action={
          <>
            <TabBar
              tabs={[
                { id: 'stock' as Tab, label: 'Остатки' },
                { id: 'inventory' as Tab, label: 'Инвентаризация' },
                { id: 'norms' as Tab, label: 'Нормы' },
              ]}
              value={tab}
              onChange={setTab}
            />
            <Button onClick={() => setModal(true)}>+ Позиция</Button>
          </>
        }
      />

      {tab === 'stock' && (
        <>
          {!!lowCount && <LowStockBanner count={lowCount} />}
          {stockItems.length ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stockItems.map((it) => {
                const qty = it.batches?.reduce((s, b) => s + Number(b.quantity), 0) ?? 0;
                return (
                  <Card key={it.id} hover>
                    <p className="font-semibold text-[var(--text)]">{it.name}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{it.sku ?? '—'}</p>
                    <p className="mt-2 text-sm">
                      Остаток: <span className="font-medium text-[var(--text)]">{qty}</span>
                    </p>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState icon={Package} title="Нет позиций" description="Добавьте первую позицию на склад" />
            </div>
          )}
        </>
      )}

      {tab === 'norms' && (
        <div className="mt-6 space-y-2">
          {normItems.length ? (
            normItems.map((n) => (
              <ListRow key={n.id}>
                <p className="font-medium text-[var(--text)]">{n.service.name}</p>
                <p className="mt-0.5 text-[var(--muted)]">
                  {n.item.name} · <span className="font-medium text-[var(--text-secondary)]">{n.quantity} шт.</span>
                </p>
              </ListRow>
            ))
          ) : (
            <EmptyState icon={Package} title="Нормы не заданы" description="Привяжите расход материалов к услугам" />
          )}
        </div>
      )}

      {tab === 'inventory' && (
        <div className="mt-6">
          {!session ? (
            <Button onClick={startInventory}>Начать инвентаризацию</Button>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--muted)]">Сверьте фактические остатки</p>
                <Button onClick={completeInventory}>Завершить и провести</Button>
              </div>
              <div className="space-y-2">
                {session.lines.map((line) => (
                  <ListRow key={line.id}>
                    <p className="font-medium text-[var(--text)]">{line.item.name}</p>
                    <p className="mt-0.5 text-[var(--muted)]">Учёт: {line.expectedQty}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Input
                        type="number"
                        className="w-24"
                        defaultValue={line.actualQty}
                        onBlur={(e) => updateLine(line.id, +e.target.value)}
                      />
                      <Badge variant={Number(line.diffQty) !== 0 ? 'warning' : 'default'}>
                        Δ {line.diffQty}
                      </Badge>
                    </div>
                  </ListRow>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Новая позиция" description="Добавление материала на склад">
        <form onSubmit={onCreate} className="space-y-3">
          <div>
            <Label>Название</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" className="w-full">Добавить</Button>
        </form>
      </Modal>
    </Protected>
  );
}

function LowStockBanner({ count }: { count: number }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-4 py-3">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--warning)]" />
      <div>
        <p className="text-sm font-medium text-[var(--warning)]">Низкий остаток</p>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          {count} {count === 1 ? 'позиция' : count < 5 ? 'позиции' : 'позиций'} ниже минимума
        </p>
      </div>
    </div>
  );
}
