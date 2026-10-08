'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { ToothChart, type ToothRecord } from '@/components/tooth-chart';
import { api } from '@/lib/api';
import { APPOINTMENT_STATUS, INVOICE_STATUS, PAYMENT_METHOD, PLAN_STATUS, TOOTH_CONDITIONS, formatMoney, label } from '@/lib/format';

type Workflow = {
  appointment: {
    id: string;
    status: string;
    startsAt: string;
    branchId: string;
    noShowReason?: string | null;
    patient: { id: string; firstName: string; lastName: string };
    service?: { id: string; name: string; basePrice: string } | null;
    doctor?: { id: string; firstName: string; lastName: string } | null;
  };
  invoice: {
    id: string;
    number: string;
    totalAmount: string;
    paidAmount: string;
    status: string;
    items?: { id: string; title: string; price: string; toothNum?: number | null }[];
  } | null;
  plan: {
    id: string;
    title: string;
    status?: string;
    totalPrice?: string;
    items?: { id: string; title: string; price: string; status?: string; toothNum?: number | null; invoiceItem?: { id: string } | null }[];
  } | null;
  visitNote: {
    complaints: string;
    anamnesis: string;
    objective: string;
    diagnosis: string;
    treatment: string;
    recommendations: string;
  } | null;
};

const STATUSES = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW'] as const;

export default function VisitPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [ctx, setCtx] = useState<Workflow | null>(null);
  const [teeth, setTeeth] = useState<ToothRecord[]>([]);
  const [selected, setSelected] = useState<number>();
  const [condition, setCondition] = useState('CARIES');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [method, setMethod] = useState('CARD');
  const [payAmount, setPayAmount] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [bookedAt, setBookedAt] = useState('');
  const [noShowReason, setNoShowReason] = useState('');
  const [askNoShow, setAskNoShow] = useState(false);
  const [note, setNote] = useState({
    complaints: '',
    anamnesis: '',
    objective: '',
    diagnosis: '',
    treatment: '',
    recommendations: '',
  });
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const billableKey = (ctx?.plan?.items ?? [])
    .filter((item) => (item.status === 'ACCEPTED' || item.status === 'DONE') && !item.invoiceItem)
    .map((item) => item.id)
    .join(',');

  const load = useCallback(() => {
    api<Workflow>(`/appointments/${id}/workflow`)
      .then(async (next) => {
        setCtx(next);
        setNoShowReason(next.appointment.noShowReason ?? '');
        if (next.visitNote) {
          setNote({
            complaints: next.visitNote.complaints ?? '',
            anamnesis: next.visitNote.anamnesis ?? '',
            objective: next.visitNote.objective ?? '',
            diagnosis: next.visitNote.diagnosis ?? '',
            treatment: next.visitNote.treatment ?? '',
            recommendations: next.visitNote.recommendations ?? '',
          });
        }
        const chart = await api<ToothRecord[]>(`/clinical/patients/${next.appointment.patient.id}/teeth`);
        setTeeth(chart);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось открыть приём'));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setOrderIds(billableKey ? billableKey.split(',') : []);
  }, [billableKey]);

  useEffect(() => {
    if (!ctx?.invoice) return;
    const left = Math.max(0, Number(ctx.invoice.totalAmount) - Number(ctx.invoice.paidAmount));
    setPayAmount(left > 0 ? String(left) : '');
  }, [ctx?.invoice?.id, ctx?.invoice?.paidAmount, ctx?.invoice?.totalAmount]);

  useEffect(() => {
    if (!ctx?.appointment.startsAt || nextAt) return;
    const start = new Date(ctx.appointment.startsAt);
    start.setDate(start.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    setNextAt(
      `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`,
    );
  }, [ctx?.appointment.startsAt, nextAt]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await action();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy('');
    }
  };

  if (!ctx) {
    return (
      <Protected>
        <p className="text-sm text-[var(--muted)]">{error || 'Открываю приём…'}</p>
      </Protected>
    );
  }

  const { appointment: a, invoice, plan } = ctx;
  const patientId = a.patient.id;
  const due = invoice ? Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount)) : 0;

  return (
    <Protected>
      <Link href="/visit" className="mb-4 inline-flex text-sm font-medium text-[var(--accent-hover)] hover:text-[var(--accent)]">
        ← Приёмы сегодня
      </Link>
      <PageHeader
        badge="Приём"
        title={`${a.patient.lastName} ${a.patient.firstName}`}
        description={
          <>
            {new Date(a.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            {' · '}
            {a.service?.name ?? 'Приём'}
            {a.doctor ? ` · ${a.doctor.lastName}` : ''}
            {a.service ? ` · ${formatMoney(a.service.basePrice)}` : ''}
          </>
        }
        action={<Badge variant={a.status === 'COMPLETED' ? 'success' : 'accent'}>{label(APPOINTMENT_STATUS, a.status)}</Badge>}
      />

      {error && <p className="mb-4 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p>}

      <div className="mb-6 flex flex-wrap gap-2">
        {STATUSES.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={a.status === status ? 'primary' : 'ghost'}
            disabled={!!busy}
            onClick={() => {
              if (status === 'NO_SHOW') {
                setAskNoShow(true);
                return;
              }
              setAskNoShow(false);
              run('status', () => api(`/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }));
            }}
          >
            {label(APPOINTMENT_STATUS, status)}
          </Button>
        ))}
        <Link href={`/patients/${patientId}`} className="ml-auto">
          <Button variant="ghost" size="sm">Карта пациента</Button>
        </Link>
      </div>

      {(askNoShow || a.status === 'NO_SHOW') && (
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4">
          <div className="min-w-[240px] flex-1">
            <Input
              value={noShowReason}
              placeholder="Почему не пришёл"
              aria-label="Причина неявки"
              onChange={(e) => setNoShowReason(e.target.value)}
            />
          </div>
          <Button
            variant="danger"
            disabled={!!busy || !noShowReason.trim()}
            onClick={() =>
              run('noshow', async () => {
                await api(`/appointments/${id}/status`, {
                  method: 'PATCH',
                  body: JSON.stringify({ status: 'NO_SHOW', noShowReason: noShowReason.trim() }),
                });
                setAskNoShow(false);
              })
            }
          >
            Сохранить неявку
          </Button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Зубная формула" description="Отметьте зуб и сохраните состояние" />
          <ToothChart records={teeth} selected={selected} onSelect={setSelected} />
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <Select value={condition} onChange={(e) => setCondition(e.target.value)} aria-label="Состояние зуба">
                {Object.entries(TOOTH_CONDITIONS).map(([key, name]) => (
                  <option key={key} value={key}>{name}</option>
                ))}
              </Select>
            </div>
            <Button
              disabled={!selected || !!busy}
              onClick={() =>
                run('tooth', () =>
                  api(`/clinical/patients/${patientId}/teeth`, {
                    method: 'POST',
                    body: JSON.stringify({ toothNum: selected, formula: 'ADULT', condition }),
                  }),
                )
              }
            >
              {selected ? `Сохранить ${selected}` : 'Выберите зуб'}
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="План лечения"
              action={
                plan ? (
                  <Link href={`/clinical/${plan.id}`} className="text-sm font-medium text-[var(--accent)]">Открыть</Link>
                ) : (
                  <Button
                    size="sm"
                    disabled={!!busy}
                    onClick={() => run('plan', () => api(`/clinical/treatment-plans/from-appointment/${id}`, { method: 'POST' }))}
                  >
                    Создать из услуги
                  </Button>
                )
              }
            />
            {plan ? (
              <div>
                <p className="font-semibold">{plan.title}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['PROPOSED', 'ACCEPTED', 'COMPLETED', 'REJECTED'] as const).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={plan.status === status ? 'primary' : 'ghost'}
                      disabled={!!busy}
                      onClick={() =>
                        run('plan-status', () =>
                          api(`/clinical/treatment-plans/${plan.id}/status`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status }),
                          }),
                        )
                      }
                    >
                      {label(PLAN_STATUS, status)}
                    </Button>
                  ))}
                </div>
                <ul className="mt-3 space-y-2">
                  {(plan.items ?? []).map((item) => {
                    const canOrder = (item.status === 'ACCEPTED' || item.status === 'DONE') && !item.invoiceItem;
                    return (
                      <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2">
                          {canOrder ? (
                            <input
                              type="checkbox"
                              aria-label={`В наряд: ${item.title}`}
                              checked={orderIds.includes(item.id)}
                              onChange={() =>
                                setOrderIds((prev) =>
                                  prev.includes(item.id) ? prev.filter((lineId) => lineId !== item.id) : [...prev, item.id],
                                )
                              }
                            />
                          ) : null}
                          {item.toothNum ? `${item.toothNum} · ` : ''}
                          {item.title}
                          {item.invoiceItem ? <span className="text-xs text-[var(--success)]">в наряде</span> : null}
                        </span>
                        <span className="font-medium text-[var(--accent)]">{formatMoney(item.price)}</span>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  className="mt-3"
                  size="sm"
                  disabled={!!busy || !orderIds.length}
                  onClick={() =>
                    run('order', () =>
                      api(`/finance/invoices/from-plan/${plan.id}`, {
                        method: 'POST',
                        body: JSON.stringify({ itemIds: orderIds, appointmentId: id }),
                      }),
                    )
                  }
                >
                  В наряд{orderIds.length ? ` · ${orderIds.length}` : ''}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Плана к этой записи ещё нет.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Случай обслуживания" description="Запись в карту по этому приёму" />
            <div className="grid gap-3">
              {(
                [
                  ['complaints', 'Жалобы'],
                  ['anamnesis', 'Анамнез'],
                  ['objective', 'Объективно'],
                  ['diagnosis', 'Диагноз'],
                  ['treatment', 'Лечение'],
                  ['recommendations', 'Рекомендации'],
                ] as const
              ).map(([key, title]) => (
                <div key={key}>
                  <Label>{title}</Label>
                  <Textarea
                    aria-label={title}
                    value={note[key]}
                    onChange={(e) => setNote((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <Button
                disabled={!!busy}
                onClick={() =>
                  run('note', () =>
                    api(`/appointments/${id}/note`, {
                      method: 'POST',
                      body: JSON.stringify(note),
                    }),
                  )
                }
              >
                Сохранить случай
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Счёт и оплата"
              action={
                !invoice && a.service ? (
                  <Button
                    size="sm"
                    disabled={!!busy}
                    onClick={() => run('invoice', () => api(`/finance/invoices/from-appointment/${id}`, { method: 'POST' }))}
                  >
                    Выставить счёт
                  </Button>
                ) : null
              }
            />
            {invoice ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{invoice.number}</p>
                    <p className="text-sm text-[var(--muted)]">{label(INVOICE_STATUS, invoice.status)}</p>
                  </div>
                  <p className="ds-display text-2xl text-[var(--accent)]">{formatMoney(invoice.totalAmount)}</p>
                </div>
                {invoice.items?.length ? (
                  <ul className="space-y-1 text-sm">
                    {invoice.items.map((line) => (
                      <li key={line.id} className="flex justify-between gap-3">
                        <span>{line.toothNum ? `${line.toothNum} · ` : ''}{line.title}</span>
                        <span>{formatMoney(line.price)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-sm text-[var(--text-secondary)]">
                  Оплачено {formatMoney(invoice.paidAmount)} · остаток {formatMoney(due)}
                </p>
                {due > 0 && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-28">
                      <Input
                        type="number"
                        min={1}
                        max={due}
                        step="0.01"
                        value={payAmount}
                        aria-label="Сумма оплаты"
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </div>
                    <div className="min-w-[160px]">
                      <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Способ оплаты">
                        {Object.entries(PAYMENT_METHOD).map(([key, name]) => (
                          <option key={key} value={key}>{name}</option>
                        ))}
                      </Select>
                    </div>
                    <Button
                      disabled={!!busy || !(Number(payAmount) > 0) || Number(payAmount) > due}
                      onClick={() =>
                        run('pay', () =>
                          api('/finance/payments', {
                            method: 'POST',
                            body: JSON.stringify({
                              patientId,
                              invoiceId: invoice.id,
                              amount: Number(payAmount),
                              method,
                            }),
                          }),
                        )
                      }
                    >
                      Принять {formatMoney(Number(payAmount) || 0)}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Счёт появится из услуги записи.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Следующий визит" description="Записываем до того, как пациент уйдёт" />
            {bookedAt ? (
              <p className="text-sm text-[var(--text)]">Записан на {bookedAt}. Врач и услуга те же.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <Input
                    type="datetime-local"
                    value={nextAt}
                    aria-label="Дата следующего визита"
                    onChange={(e) => setNextAt(e.target.value)}
                  />
                </div>
                <Button
                  disabled={!!busy || !nextAt}
                  onClick={() => {
                    const starts = new Date(nextAt);
                    const ends = new Date(starts.getTime() + 30 * 60 * 1000);
                    run('next', async () => {
                      await api('/appointments', {
                        method: 'POST',
                        body: JSON.stringify({
                          patientId,
                          branchId: a.branchId,
                          doctorId: a.doctor?.id,
                          serviceId: a.service?.id,
                          startsAt: starts.toISOString(),
                          endsAt: ends.toISOString(),
                          notes: 'Следующий визит из приёма',
                        }),
                      });
                      setBookedAt(
                        starts.toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                      );
                    });
                  }}
                >
                  Записать
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </Protected>
  );
}
