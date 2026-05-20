'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Receipt, Stethoscope, Wallet, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type WorkflowCtx = {
  appointment: {
    id: string;
    patientId: string;
    status: string;
    patient: { id: string; firstName: string; lastName: string };
    service?: { id: string; name: string; basePrice: string } | null;
  };
  invoice: { id: string; number: string; totalAmount: string; paidAmount: string; status: string } | null;
  plan: { id: string; title: string } | null;
};

export function VisitCompleteModal({
  open,
  appointmentId,
  onClose,
  onRefresh,
}: {
  open: boolean;
  appointmentId: string | null;
  onClose: () => void;
  onRefresh?: () => void;
}) {
  const [ctx, setCtx] = useState<WorkflowCtx | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!open || !appointmentId) {
      setCtx(null);
      return;
    }
    setLoading(true);
    api<WorkflowCtx>(`/appointments/${appointmentId}/workflow`)
      .then(setCtx)
      .finally(() => setLoading(false));
  }, [open, appointmentId]);

  const patientId = ctx?.appointment.patient.id;
  const servicePrice = ctx?.appointment.service ? Number(ctx.appointment.service.basePrice) : 0;

  const run = async (action: () => Promise<unknown>) => {
    setBusy('run');
    try {
      await action();
      onRefresh?.();
      if (appointmentId) {
        const fresh = await api<WorkflowCtx>(`/appointments/${appointmentId}/workflow`);
        setCtx(fresh);
      }
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Приём завершён"
      description="Следующие шаги по пациенту"
      size="lg"
    >
      {loading && <p className="text-sm text-[var(--muted)]">Загрузка…</p>}
      {ctx && (
        <div className="space-y-5">
          <div className="rounded-xl bg-[var(--success-soft)]/50 px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="text-[var(--success)]" size={22} />
            <div>
              <p className="font-semibold text-[var(--text)]">
                {ctx.appointment.patient.lastName} {ctx.appointment.patient.firstName}
              </p>
              <p className="text-sm text-[var(--muted)]">
                {ctx.appointment.service?.name ?? 'Приём без услуги'}
                {servicePrice > 0 ? ` · ${formatMoney(servicePrice)}` : ''}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {!ctx.plan && (
              <Button
                variant="ghost"
                className="h-auto flex-col items-start gap-2 rounded-xl border border-[var(--border)] p-4 text-left"
                disabled={!!busy}
                onClick={() =>
                  run(() => api(`/clinical/treatment-plans/from-appointment/${appointmentId}`, { method: 'POST' }))
                }
              >
                <Stethoscope size={20} className="text-[var(--accent)]" />
                <span className="font-semibold">Создать план лечения</span>
                <span className="text-xs font-normal text-[var(--muted)]">Из услуги приёма</span>
              </Button>
            )}
            {ctx.plan && (
              <Link href={`/clinical/${ctx.plan.id}`} className="block" onClick={onClose}>
                <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)]/30 p-4">
                  <Stethoscope size={20} className="text-[var(--accent)]" />
                  <p className="mt-2 font-semibold">План: {ctx.plan.title}</p>
                  <p className="text-xs text-[var(--muted)]">Открыть →</p>
                </div>
              </Link>
            )}

            {!ctx.invoice && ctx.appointment.service && (
              <Button
                variant="ghost"
                className="h-auto flex-col items-start gap-2 rounded-xl border border-[var(--border)] p-4 text-left"
                disabled={!!busy}
                onClick={() =>
                  run(() => api(`/finance/invoices/from-appointment/${appointmentId}`, { method: 'POST' }))
                }
              >
                <Receipt size={20} className="text-[var(--accent)]" />
                <span className="font-semibold">Выставить счёт</span>
                <span className="text-xs font-normal text-[var(--muted)]">По услуге приёма</span>
              </Button>
            )}
            {ctx.invoice && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-4">
                <Receipt size={20} className="text-[var(--accent)]" />
                <p className="mt-2 font-semibold">{ctx.invoice.number}</p>
                <p className="text-sm text-[var(--muted)]">
                  {formatMoney(ctx.invoice.paidAmount)} / {formatMoney(ctx.invoice.totalAmount)}
                </p>
                {patientId && (
                  <Link
                    href={`/finance?patientId=${patientId}&invoiceId=${ctx.invoice.id}`}
                    className="mt-2 inline-block text-sm font-medium text-[var(--accent)]"
                    onClick={onClose}
                  >
                    Принять оплату →
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            {patientId && (
              <Link href={`/patients/${patientId}`} onClick={onClose}>
                <Button variant="ghost" size="sm">
                  Карточка пациента
                </Button>
              </Link>
            )}
            {patientId && (
              <Link href={`/finance?patientId=${patientId}`} onClick={onClose}>
                <Button size="sm">
                  <Wallet size={16} />
                  Касса
                </Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
