'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar } from '@/components/ui/tab-bar';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Tab = 'services' | 'prices';

export default function ServicesPage() {
  const [tab, setTab] = useState<Tab>('services');
  const [items, setItems] = useState<{ id: string; name: string; code?: string; durationMin: number; basePrice: string }[]>([]);
  const [priceLists, setPriceLists] = useState<{ id: string; name: string; items: { price: string; service: { name: string } }[] }[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', durationMin: '30', basePrice: '0' });

  const load = () => {
    api<typeof items>('/services').then(setItems);
    api<typeof priceLists>('/finance/price-lists').then(setPriceLists);
  };

  useEffect(() => { load(); }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    await api('/services', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        code: form.code || undefined,
        durationMin: +form.durationMin,
        basePrice: +form.basePrice,
      }),
    });
    setModal(false);
    load();
  };

  return (
    <Protected>
      <PageHeader
        badge="Прайс"
        title="Услуги и прайс"
        description="Каталог манипуляций и прайс-листы"
        action={tab === 'services' ? <Button onClick={() => setModal(true)}>+ Услуга</Button> : undefined}
      />

      <TabBar
        tabs={[
          { id: 'services' as Tab, label: 'Услуги' },
          { id: 'prices' as Tab, label: 'Прайс-листы' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'services' && (
        <div className="ds-card mt-6 overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                <th scope="col" className="px-5 py-3">Название</th>
                <th scope="col" className="px-5 py-3">Код</th>
                <th scope="col" className="px-5 py-3 text-right">Мин</th>
                <th scope="col" className="px-5 py-3 text-right">Цена</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="ds-table-row">
                  <td className="px-5 py-3.5 font-medium text-[var(--text)]">{s.name}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-[var(--muted)]">{s.code ?? '—'}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-[var(--muted)]">{s.durationMin}</td>
                  <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-[var(--text)]">{formatMoney(s.basePrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'prices' && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {priceLists.map((pl) => (
            <Card key={pl.id}>
              <CardHeader title={pl.name} description={`${pl.items.length} позиций`} />
              <ul className="divide-y divide-[var(--border)] text-sm">
                {pl.items.map((it, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-[var(--text-secondary)]">{it.service.name}</span>
                    <span className="font-semibold tabular-nums text-[var(--text)]">{formatMoney(it.price)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {!priceLists.length && <p className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center text-sm text-[var(--muted)] lg:col-span-2">Прайс-листы из seed или настройки сети</p>}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Новая услуга">
        <form onSubmit={onCreate} className="space-y-3">
          <div><Label>Название</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Код</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div><Label>Длительность (мин)</Label><Input type="number" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} /></div>
          <div><Label>Цена</Label><Input type="number" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} /></div>
          <Button type="submit" className="w-full">Добавить</Button>
        </form>
      </Modal>
    </Protected>
  );
}
