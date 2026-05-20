'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { GripVertical } from 'lucide-react';
import { Protected } from '@/components/protected';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { formatMoney, label, PLAN_STATUS } from '@/lib/format';

export default function TreatmentPlanPage() {
  const { planId } = useParams<{ planId: string }>();
  const { branchId } = useBranch();
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [newItem, setNewItem] = useState({ title: '', price: '', toothNum: '' });
  const [services, setServices] = useState<{ id: string; name: string; basePrice: string }[]>([]);
  const [servicePick, setServicePick] = useState('');
  const [diary, setDiary] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const load = useCallback(() => {
    api<Record<string, unknown>>(`/clinical/treatment-plans/${planId}`).then(setPlan);
  }, [planId]);

  useEffect(() => {
    load();
    api<typeof services>('/services').then(setServices);
  }, [load]);

  if (!plan) {
    return (
      <Protected>
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 rounded bg-[var(--surface-muted)]" />
          <div className="ds-card h-40 bg-[var(--surface-muted)]" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="ds-card h-64 bg-[var(--surface-muted)]" />
            <div className="ds-card h-64 bg-[var(--surface-muted)]" />
          </div>
        </div>
      </Protected>
    );
  }

  const p = plan as {
    title: string;
    status: string;
    totalPrice: string;
    patient: { id: string; firstName: string; lastName: string };
    items: { id: string; title: string; price: string; toothNum?: number; isCompleted: boolean }[];
    diaryEntries: { id: string; notes: string; createdAt: string }[];
  };

  const completedCount = p.items.filter((i) => i.isCompleted).length;

  const addItem = async () => {
    await api(`/clinical/treatment-plans/${planId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        title: newItem.title,
        price: +newItem.price,
        toothNum: newItem.toothNum ? +newItem.toothNum : undefined,
        serviceId: servicePick || undefined,
      }),
    });
    await api(`/clinical/treatment-plans/${planId}/recalculate`, { method: 'POST' });
    setNewItem({ title: '', price: '', toothNum: '' });
    setServicePick('');
    load();
  };

  const toggleItem = async (itemId: string, done: boolean) => {
    if (done) {
      await api(`/clinical/treatment-plans/items/${itemId}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({ isCompleted: true, branchId }),
      });
    } else {
      await api(`/clinical/treatment-plans/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isCompleted: false }),
      });
    }
    load();
  };

  const addDiary = async () => {
    if (!diary.trim()) return;
    await api(`/clinical/treatment-plans/${planId}/diary`, {
      method: 'POST',
      body: JSON.stringify({ notes: diary }),
    });
    setDiary('');
    load();
  };

  const setStatus = async (status: string) => {
    await api(`/clinical/treatment-plans/${planId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    load();
  };

  const dropItem = async (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return;
    const ids = p.items.map((i) => i.id);
    const [id] = ids.splice(dragIdx, 1);
    ids.splice(toIdx, 0, id);
    await api(`/clinical/treatment-plans/${planId}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ itemIds: ids }),
    });
    setDragIdx(null);
    load();
  };

  const moveItem = async (index: number, dir: -1 | 1) => {
    const ids = p.items.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await api(`/clinical/treatment-plans/${planId}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ itemIds: ids }),
    });
    load();
  };

  return (
    <Protected>
      <BackLink href="/clinical">Планы лечения</BackLink>

      <PageHeader
        badge="План лечения"
        title={p.title}
        description={
          <>
            <Link href={`/patients/${p.patient.id}`} className="font-medium text-[var(--accent)] hover:underline">
              {p.patient.lastName} {p.patient.firstName}
            </Link>
            {' · '}
            {formatMoney(p.totalPrice)}
            {' · '}
            {completedCount}/{p.items.length} этапов
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={async () => {
                const inv = await api<{ id: string }>(`/finance/invoices/from-plan/${planId}`, { method: 'POST' });
                window.location.href = `/finance?patientId=${p.patient.id}&invoiceId=${inv.id}`;
              }}
            >
              Выставить счёт
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const alt = await api<{ id: string }>(`/clinical/treatment-plans/${planId}/alternative`, {
                  method: 'POST',
                  body: JSON.stringify({ title: `${p.title} (альтернатива)` }),
                });
                window.location.href = `/clinical/${alt.id}`;
              }}
            >
              + Альтернатива
            </Button>
            {Object.keys(PLAN_STATUS).map((s) => (
              <Button key={s} size="sm" variant={p.status === s ? 'primary' : 'ghost'} onClick={() => setStatus(s)}>
                {label(PLAN_STATUS, s)}
              </Button>
            ))}
          </div>
        }
      />

      <div className="mb-6">
        <Badge variant={p.status === 'COMPLETED' ? 'success' : 'accent'}>
          {label(PLAN_STATUS, p.status)}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Этапы плана" description="Перетащите или используйте стрелки для порядка" />
          <ul className="space-y-2">
            {p.items.map((it, idx) => (
              <li
                key={it.id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropItem(idx)}
                className={`flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 px-3 py-3 text-sm transition ${
                  dragIdx === idx ? 'opacity-50' : ''
                } ${it.isCompleted ? 'opacity-75' : ''}`}
              >
                <GripVertical size={14} className="shrink-0 cursor-grab text-[var(--muted)]" />
                <div className="flex flex-col gap-0.5">
                  <button type="button" className="text-[10px] text-[var(--muted)] hover:text-[var(--accent)]" onClick={() => moveItem(idx, -1)}>↑</button>
                  <button type="button" className="text-[10px] text-[var(--muted)] hover:text-[var(--accent)]" onClick={() => moveItem(idx, 1)}>↓</button>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
                  checked={it.isCompleted}
                  onChange={(e) => toggleItem(it.id, e.target.checked)}
                />
                <span className={`min-w-0 flex-1 ${it.isCompleted ? 'line-through text-[var(--muted)]' : 'font-medium'}`}>
                  {it.title}
                  {it.toothNum ? ` · зуб ${it.toothNum}` : ''}
                </span>
                <span className="shrink-0 font-semibold text-[var(--accent)]">{formatMoney(it.price)}</span>
              </li>
            ))}
            {!p.items.length && (
              <p className="py-6 text-center text-sm text-[var(--muted)]">Добавьте первый этап ниже</p>
            )}
          </ul>
          <div className="mt-4 grid gap-2 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
            <Label>Услуга из прайса</Label>
            <Select
              value={servicePick}
              onChange={(e) => {
                const id = e.target.value;
                setServicePick(id);
                const svc = services.find((s) => s.id === id);
                if (svc) setNewItem({ ...newItem, title: svc.name, price: svc.basePrice });
              }}
            >
              <option value="">Выберите или введите вручную</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {formatMoney(s.basePrice)}
                </option>
              ))}
            </Select>
            <Input placeholder="Манипуляция" value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} />
            <Input placeholder="Цена" type="number" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} />
            <Input placeholder="Зуб №" type="number" value={newItem.toothNum} onChange={(e) => setNewItem({ ...newItem, toothNum: e.target.value })} />
          </div>
          <Button className="mt-3 w-full" onClick={addItem} disabled={!newItem.title || !newItem.price}>
            Добавить этап
          </Button>
        </Card>

        <Card>
          <CardHeader title="Дневник лечения" description="Хронология визитов и заметок врача" />
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {p.diaryEntries.map((d) => (
              <li key={d.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-3 text-sm">
                <p className="text-xs font-medium text-[var(--muted)]">
                  {new Date(d.createdAt).toLocaleString('ru-RU')}
                </p>
                <p className="mt-1 text-[var(--text-secondary)]">{d.notes}</p>
              </li>
            ))}
            {!p.diaryEntries.length && (
              <li className="py-6 text-center text-sm text-[var(--muted)]">Записей пока нет</li>
            )}
          </ul>
          <div className="mt-4 flex gap-2 border-t border-[var(--border)] pt-4">
            <Textarea
              className="min-h-[72px] flex-1"
              placeholder="Запись в дневник…"
              value={diary}
              onChange={(e) => setDiary(e.target.value)}
            />
          </div>
          <Button className="mt-2 w-full" onClick={addDiary} disabled={!diary.trim()}>
            Добавить запись
          </Button>
        </Card>
      </div>
    </Protected>
  );
}
