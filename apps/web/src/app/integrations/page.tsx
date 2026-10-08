'use client';

import { useEffect, useState } from 'react';
import { Plug } from 'lucide-react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';

const PROVIDERS = ['ONEC', 'YUKASSA', 'ATOL', 'EGISZ', 'HL7_FHIR', 'ROISTAT', 'YANDEX_METRIKA'];

export default function IntegrationsPage() {
  const [configs, setConfigs] = useState<{ provider: string; isActive: boolean; configJson: object }[]>([]);
  const [webhooks, setWebhooks] = useState<unknown[]>([]);
  const [chain, setChain] = useState<unknown[]>([]);
  const [journal, setJournal] = useState<{ id: string; provider: string; action: string; status: string; message: string; createdAt: string }[]>([]);

  const load = () => {
    api<typeof configs>('/integrations').then(setConfigs);
    api<unknown[]>('/integrations/webhooks').then(setWebhooks);
    api<unknown[]>('/integrations/blockchain-audit').then(setChain);
    api<typeof journal>('/integrations/journal').then(setJournal);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (provider: string, isActive: boolean) => {
    await api('/integrations/configs', {
      method: 'POST',
      body: JSON.stringify({ provider, configJson: { mode: 'stub' }, isActive }),
    });
    load();
  };

  return (
    <Protected>
      <PageHeader
        badge="Интеграции"
        title="Интеграции"
        description="Заглушки провайдеров — включите для демо, реальные API подключите позже"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDERS.map((p) => {
          const cfg = configs.find((c) => c.provider === p);
          return (
            <Card key={p} hover className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={cfg?.isActive ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]' : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--muted)]'}>
                  <Plug size={16} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-mono text-sm font-semibold text-[var(--text)]">{p}</p>
                  <div className="mt-1">
                    <Badge variant={cfg?.isActive ? 'success' : 'default'}>
                      {cfg?.isActive ? 'Включено (stub)' : 'Выключено'}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button size="sm" variant={cfg?.isActive ? 'primary' : 'ghost'} aria-pressed={!!cfg?.isActive} onClick={() => toggle(p, !cfg?.isActive)}>
                {cfg?.isActive ? 'Вкл' : 'Выкл'}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Журнал отправок"
          description="ЕГИСЗ и касса 54-ФЗ пишутся сюда и не уходят наружу, пока оператор не подключён"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await api('/integrations/dispatch', { method: 'POST', body: JSON.stringify({ provider: 'ATOL', action: 'sell' }) });
                await api('/integrations/dispatch', { method: 'POST', body: JSON.stringify({ provider: 'EGISZ', action: 'semd' }) });
                load();
              }}
            >
              Проверить отправку
            </Button>
          }
        />
        <div className="space-y-2">
          {journal.map((row) => (
            <ListRow key={row.id} trailing={<Badge variant={row.status === 'QUEUED' ? 'accent' : 'warning'}>{row.status === 'SKIPPED' ? 'Не отправлено' : row.status === 'QUEUED' ? 'В очереди' : 'Ошибка'}</Badge>}>
              <p className="font-mono text-xs font-semibold text-[var(--text)]">{row.provider} · {row.action}</p>
              <p className="mt-0.5 text-[var(--muted)]">{row.message}</p>
            </ListRow>
          ))}
          {!journal.length && <p className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center text-sm text-[var(--muted)]">Журнал пуст</p>}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Webhooks" description="Исходящие уведомления" />
        <div className="space-y-2">
          {(webhooks as { url: string; events: string[]; isActive: boolean }[]).map((w, i) => (
            <ListRow key={i} trailing={w.isActive ? <Badge variant="success">Активен</Badge> : <Badge>Неактивен</Badge>}>
              <p className="truncate font-mono text-xs font-semibold text-[var(--text)]">{w.url}</p>
              <p className="mt-0.5 text-[var(--muted)]">{w.events.join(', ')}</p>
            </ListRow>
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Blockchain-аудит медкарт" description="Цепочка хешей записей" />
        <div className="max-h-56 space-y-2 overflow-auto">
          {(chain as { recordType: string; contentHash: string; chainedAt: string }[]).map((h, i) => (
            <ListRow key={i}>
              <p className="font-mono text-xs font-medium text-[var(--text)]">{h.recordType}</p>
              <p className="font-mono text-xs text-[var(--muted)]">
                {h.contentHash.slice(0, 24)}… · {new Date(h.chainedAt).toLocaleString('ru-RU')}
              </p>
            </ListRow>
          ))}
        </div>
      </Card>
    </Protected>
  );
}
