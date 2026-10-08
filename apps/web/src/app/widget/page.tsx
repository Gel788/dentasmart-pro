'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';

type Visit = { id: string; startsAt: string; endsAt: string; service: { name: string } | null };

export default function WidgetPage() {
  const slug = 'demo-clinic';
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const embed = origin
    ? `<script src="${origin}/widget/dentasmart-widget.js" data-clinic="${slug}" data-api="${apiBase}"></script>`
    : '';
  const [phone, setPhone] = useState('');
  const [visits, setVisits] = useState<Visit[]>([]);
  const [appointmentId, setAppointmentId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [note, setNote] = useState('');

  const findVisits = async () => {
    const rows = await fetch(`${apiBase}/public/widget/${slug}/visits?phone=${encodeURIComponent(phone)}`).then((r) => r.json());
    setVisits(Array.isArray(rows) ? rows : []);
    setAppointmentId(Array.isArray(rows) && rows[0] ? rows[0].id : '');
    setNote(Array.isArray(rows) && rows.length ? '' : 'Будущих записей с этим телефоном нет');
  };

  const moveVisit = async (event: FormEvent) => {
    event.preventDefault();
    const start = new Date(startsAt);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const response = await fetch(`${apiBase}/public/widget/${slug}/reschedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appointmentId, phone, startsAt: start.toISOString(), endsAt: end.toISOString() }),
    });
    const body = await response.json();
    setNote(response.ok ? `Перенесено на ${new Date(body.startsAt).toLocaleString('ru-RU')}` : (body.message ?? 'Не перенеслось'));
    if (response.ok) findVisits();
  };

  return (
    <Protected>
      <PageHeader
        badge="Виджет"
        title="Виджет онлайн-записи"
        description="Web Component для встраивания на любой сайт"
      />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Код вставки" />
          <pre className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 font-mono text-xs text-[var(--text-secondary)]">{embed}</pre>
        </Card>
        <Card>
          <CardHeader title="Публичный API" />
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] font-mono text-xs text-[var(--text-secondary)] [&>li]:px-4 [&>li]:py-2.5">
            <li>{`GET /api/v1/public/widget/${slug}/config`}</li>
            <li>{`GET /api/v1/public/widget/${slug}/services`}</li>
            <li>{`GET /api/v1/public/widget/${slug}/slots`}</li>
            <li>{`POST /api/v1/public/widget/${slug}/book`}</li>
            <li>{`POST /api/v1/public/widget/${slug}/reschedule`}</li>
          </ul>
        </Card>
        <Card>
          <CardHeader title="Перенос записи" description="По телефону пациента, если новое время свободно" />
          <form onSubmit={moveVisit} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Телефон</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00" aria-label="Телефон для переноса" />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="ghost" onClick={findVisits}>Найти записи</Button>
            </div>
            <div>
              <Label>Запись</Label>
              <Select aria-label="Запись для переноса" value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)}>
                <option value="">Нет</option>
                {visits.map((visit) => (
                  <option key={visit.id} value={visit.id}>
                    {new Date(visit.startsAt).toLocaleString('ru-RU')} · {visit.service?.name ?? 'Приём'}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Новое время</Label>
              <Input type="datetime-local" aria-label="Новое время записи" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4 sm:col-span-2">
              <Button type="submit" disabled={!appointmentId || !startsAt}>Перенести</Button>
              {note && <p role="status" className="text-sm text-[var(--text-secondary)]">{note}</p>}
            </div>
          </form>
        </Card>
      </div>
    </Protected>
  );
}
