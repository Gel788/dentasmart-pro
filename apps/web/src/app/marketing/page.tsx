'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Badge } from '@/components/ui/badge';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';

export default function MarketingPage() {
  const [campaigns, setCampaigns] = useState<unknown[]>([]);
  const [chains, setChains] = useState<unknown[]>([]);
  const [segments, setSegments] = useState<unknown[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', channel: 'SMS' });

  const load = () => {
    api<unknown[]>('/marketing/campaigns').then(setCampaigns);
    api<unknown[]>('/marketing/automation-chains').then(setChains);
    api<unknown[]>('/marketing/segments').then(setSegments);
  };

  useEffect(() => { load(); }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    await api('/marketing/campaigns', { method: 'POST', body: JSON.stringify(form) });
    setModal(false);
    load();
  };

  return (
    <Protected>
      <PageHeader
        badge="Маркетинг"
        title="Маркетинг"
        description="Кампании и автоцепочки (внутренние)"
        action={<Button onClick={() => setModal(true)}>+ Кампания</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Кампании" description="Рассылки и промо-акции" />
          <div className="space-y-2">
            {(campaigns as { id: string; name: string; channel: string; status: string }[]).map((c) => (
              <ListRow key={c.id}>
                <p className="font-medium text-[var(--text)]">{c.name}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge variant="accent">{c.channel}</Badge>
                  <Badge>{c.status}</Badge>
                </div>
              </ListRow>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Автоцепочки" description="Триггерные сценарии" />
          <div className="space-y-2">
            {(chains as { id: string; name: string; trigger: string; isActive: boolean }[]).map((ch) => (
              <ListRow
                key={ch.id}
                trailing={
                  <Button variant="ghost" onClick={async () => {
                    const r = await api<{ queued: number }>(`/marketing/automation-chains/${ch.id}/run`, { method: 'POST' });
                    alert(`Очередь: ${r.queued}`);
                  }}>Запустить</Button>
                }
              >
                <p className="font-medium text-[var(--text)]">{ch.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-[var(--muted)]">{ch.trigger}</span>
                  {ch.isActive && <Badge variant="success">Активна</Badge>}
                </div>
              </ListRow>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Сегменты" description="Группы пациентов для таргетинга" />
        <div className="space-y-2">
          {(segments as { id: string; name: string; _count: { members: number } }[]).map((s) => (
            <ListRow
              key={s.id}
              trailing={
                <Button variant="ghost" onClick={async () => {
                  await api(`/marketing/segments/${s.id}/refresh`, { method: 'POST' });
                  load();
                }}>Обновить</Button>
              }
            >
              <p className="font-medium text-[var(--text)]">{s.name}</p>
              <p className="text-[var(--muted)]">{s._count.members} участников</p>
            </ListRow>
          ))}
        </div>
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Новая кампания" description="Создание маркетинговой рассылки">
        <form onSubmit={onCreate} className="space-y-3">
          <div><Label>Название</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Канал</Label><Input value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} /></div>
          <Button type="submit" className="w-full">Создать</Button>
        </form>
      </Modal>
    </Protected>
  );
}
