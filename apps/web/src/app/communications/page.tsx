'use client';

import { FormEvent, useEffect, useState } from 'react';
import { MessageSquare, Phone } from 'lucide-react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';

export default function CommunicationsPage() {
  const [threads, setThreads] = useState<unknown[]>([]);
  const [calls, setCalls] = useState<unknown[]>([]);
  const [patients, setPatients] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ patientId: '', channel: 'SMS', body: '' });

  const load = () => {
    api<unknown[]>('/communications/threads').then(setThreads);
    api<unknown[]>('/communications/calls').then(setCalls);
  };

  useEffect(() => {
    load();
    api<{ items: { id: string; firstName: string; lastName: string }[] }>('/patients').then((r) => setPatients(r.items));
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    await api('/communications/threads', { method: 'POST', body: JSON.stringify(form) });
    setModal(false);
    load();
  };

  const threadList = threads as { id: string; channel: string; messages: { body: string; direction: string }[] }[];
  const callList = calls as { id: string; phone: string; durationSec?: number; createdAt: string }[];

  return (
    <Protected>
      <PageHeader
        badge="Связь"
        title="Коммуникации"
        description="Внутренний журнал обращений (без внешних API)"
        action={<Button onClick={() => setModal(true)}>+ Сообщение</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Диалоги" description="Переписка с пациентами" />
          <div className="space-y-2">
            {threadList.length ? threadList.map((t) => (
              <ListRow key={t.id}>
                <Badge variant="accent">{t.channel}</Badge>
                <p className="mt-1.5 line-clamp-2 text-[var(--text-secondary)]">{t.messages?.[0]?.body ?? '—'}</p>
              </ListRow>
            )) : (
              <EmptyState icon={MessageSquare} title="Нет диалогов" description="Создайте первое обращение" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Звонки (журнал)" description="История звонков" />
          <div className="space-y-2">
            {callList.length ? callList.map((c) => (
              <ListRow key={c.id} trailing={<Badge>{c.durationSec ? `${c.durationSec}с` : '—'}</Badge>}>
                <p className="font-medium tabular-nums text-[var(--text)]">{c.phone}</p>
                <p className="mt-0.5 tabular-nums text-[var(--muted)]">{new Date(c.createdAt).toLocaleDateString('ru-RU')}</p>
              </ListRow>
            )) : (
              <EmptyState icon={Phone} title="Нет звонков" description="Звонки появятся в журнале" />
            )}
          </div>
        </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Новое обращение" description="Запись сообщения в журнал">
        <form onSubmit={onCreate} className="space-y-3">
          <div><Label>Пациент</Label>
            <Select required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
              <option value="">—</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}
            </Select>
          </div>
          <div><Label>Канал</Label>
            <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              {['SMS', 'EMAIL', 'WHATSAPP', 'TELEGRAM', 'PHONE'].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div><Label>Текст</Label><Input required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
          <Button type="submit" className="w-full">Сохранить</Button>
        </form>
      </Modal>
    </Protected>
  );
}
