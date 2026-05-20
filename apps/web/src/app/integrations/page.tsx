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

  const load = () => {
    api<typeof configs>('/integrations').then(setConfigs);
    api<unknown[]>('/integrations/webhooks').then(setWebhooks);
    api<unknown[]>('/integrations/blockchain-audit').then(setChain);
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

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {PROVIDERS.map((p) => {
          const cfg = configs.find((c) => c.provider === p);
          return (
            <Card key={p} hover className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Plug size={18} />
                </div>
                <div>
                  <p className="font-semibold text-[var(--text)]">{p}</p>
                  <div className="mt-1">
                    <Badge variant={cfg?.isActive ? 'success' : 'default'}>
                      {cfg?.isActive ? 'Включено (stub)' : 'Выключено'}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button variant={cfg?.isActive ? 'primary' : 'ghost'} onClick={() => toggle(p, !cfg?.isActive)}>
                {cfg?.isActive ? 'Вкл' : 'Выкл'}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8">
        <CardHeader title="Webhooks" description="Исходящие уведомления" />
        <div className="space-y-2">
          {(webhooks as { url: string; events: string[]; isActive: boolean }[]).map((w, i) => (
            <ListRow key={i} trailing={w.isActive ? <Badge variant="success">Активен</Badge> : <Badge>Неактивен</Badge>}>
              <p className="font-medium text-[var(--text)]">{w.url}</p>
              <p className="text-[var(--muted)]">{w.events.join(', ')}</p>
            </ListRow>
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Blockchain-аудит медкарт" description="Цепочка хешей записей" />
        <div className="max-h-40 space-y-2 overflow-auto">
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
