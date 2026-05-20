'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';

function TwoFactorSection() {
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');

  const setup = async () => {
    const r = await api<{ secret: string }>('/auth/2fa/setup', { method: 'POST' });
    setSecret(r.secret);
  };

  const enable = async () => {
    await api('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
    alert('2FA включена');
  };

  return (
    <Card className="mt-6">
      <CardHeader title="Двухфакторная аутентификация" description="TOTP (Google Authenticator и аналоги)" />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={setup}>Сгенерировать секрет</Button>
        {secret && <span className="font-mono text-xs">{secret}</span>}
      </div>
      <div className="mt-3 flex gap-2">
        <Input placeholder="Код из приложения" value={code} onChange={(e) => setCode(e.target.value)} className="max-w-xs" />
        <Button type="button" onClick={enable}>Включить</Button>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const [org, setOrg] = useState<{ name: string; slug: string; email?: string } | null>(null);
  const [widget, setWidget] = useState({ primaryColor: '#3b9eff', logoUrl: '' });
  const [audit, setAudit] = useState<unknown[]>([]);
  const [medAudit, setMedAudit] = useState<unknown[]>([]);

  useEffect(() => {
    api<{ name: string; slug: string; email?: string }>('/settings/organization').then(setOrg);
    api<{ primaryColor?: string; logoUrl?: string } | null>('/settings/widget').then((w) => w && setWidget({ primaryColor: w.primaryColor ?? '#3b9eff', logoUrl: w.logoUrl ?? '' }));
    api<unknown[]>('/settings/audit').then(setAudit);
    api<unknown[]>('/settings/medical-audit').then(setMedAudit);
  }, []);

  const saveWidget = async (e: FormEvent) => {
    e.preventDefault();
    await api('/settings/widget', { method: 'PUT', body: JSON.stringify(widget) });
  };

  return (
    <Protected>
      <PageHeader
        badge="Система"
        title="Настройки"
        description="Организация, виджет, аудит (без внешних интеграций)"
      />

      {org && (
        <Card className="mt-6">
          <CardHeader title="Клиника" />
          <p className="text-sm">{org.name}</p>
          <p className="text-sm text-[var(--muted)]">slug: {org.slug} · {org.email}</p>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Виджет онлайн-записи" />
        <form onSubmit={saveWidget} className="mt-4 max-w-sm space-y-3">
          <div><Label>Цвет</Label><Input type="color" value={widget.primaryColor} onChange={(e) => setWidget({ ...widget, primaryColor: e.target.value })} /></div>
          <div><Label>URL логотипа</Label><Input value={widget.logoUrl} onChange={(e) => setWidget({ ...widget, logoUrl: e.target.value })} /></div>
          <Button type="submit">Сохранить</Button>
        </form>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Аудит действий" />
        <ul className="mt-3 max-h-48 overflow-auto text-xs text-[var(--muted)]">
          {(audit as { action: string; entityType: string; createdAt: string; user?: { email: string } }[]).map((a, i) => (
            <li key={i} className="border-b border-[var(--border)] py-1">
              {new Date(a.createdAt).toLocaleString('ru-RU')} · {a.action} {a.entityType} {a.user?.email && `· ${a.user.email}`}
            </li>
          ))}
        </ul>
      </Card>

      <TwoFactorSection />

      <Card className="mt-6">
        <CardHeader title="Цепочка медкарт (внутренний аудит)" />
        <ul className="mt-3 text-xs text-[var(--muted)]">
          {(medAudit as { recordType: string; contentHash: string; chainedAt: string }[]).map((h, i) => (
            <li key={i} className="py-1">{h.recordType}: {h.contentHash.slice(0, 24)}… · {new Date(h.chainedAt).toLocaleString('ru-RU')}</li>
          ))}
        </ul>
      </Card>
    </Protected>
  );
}
