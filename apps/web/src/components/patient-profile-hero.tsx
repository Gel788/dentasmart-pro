'use client';

import Link from 'next/link';
import {
  Calendar,
  Mail,
  Phone,
  Stethoscope,
  Wallet,
  AlertCircle,
  Receipt,
} from 'lucide-react';
import { PatientAvatar } from '@/components/patient-avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatDateOnly, formatMoney, label, patientAge, PATIENT_SOURCE } from '@/lib/format';
import { GENDER_LABELS, patientFullName } from '@/lib/patient';

export type PatientSummary = {
  balanceDue: number;
  depositBalance: number;
  nextAppointment?: { id: string; startsAt: string; service?: { name: string } } | null;
  activePlanId?: string | null;
  activePlanTitle?: string | null;
};

export function PatientProfileHero({
  patient,
  stats,
  summary,
  onEdit,
}: {
  patient: {
    id?: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    phone?: string | null;
    email?: string | null;
    gender?: string | null;
    tags?: string[];
    notes?: string | null;
    source?: string | null;
    birthDate?: string | null;
  };
  stats: { visits: number; plans: number; openInvoices: number };
  summary?: PatientSummary;
  onEdit?: () => void;
}) {
  const name = patientFullName(patient);
  const hasDebt = (summary?.balanceDue ?? 0) > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] border-l-4 border-l-[var(--accent)] px-6 py-8 sm:px-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-5 sm:gap-6">
            <div className="relative">
              <PatientAvatar firstName={patient.firstName} lastName={patient.lastName} size="xl" />
              {hasDebt && (
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--danger)] text-white shadow-md">
                  <AlertCircle size={14} />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--muted)]">Медкарта</p>
              <h1 className="ds-display mt-1 text-2xl text-[var(--text)] sm:text-4xl">{name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
                {patient.birthDate && (
                  <span>
                    {formatDateOnly(patient.birthDate)} · {patientAge(patient.birthDate)} лет
                  </span>
                )}
                {patient.gender && (
                  <span className="text-[var(--text-secondary)]">
                    {GENDER_LABELS[patient.gender] ?? patient.gender}
                  </span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {patient.phone && (
                  <a
                    href={`tel:${patient.phone.replace(/\s/g, '')}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 px-4 py-2 text-sm font-medium text-[var(--text)] shadow-sm backdrop-blur transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    <Phone size={16} className="text-[var(--accent)]" />
                    {patient.phone}
                  </a>
                )}
                {patient.email && (
                  <a
                    href={`mailto:${patient.email}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 px-4 py-2 text-sm font-medium text-[var(--text)] shadow-sm backdrop-blur transition hover:border-[var(--accent)]"
                  >
                    <Mail size={16} className="text-[var(--accent)]" />
                    <span className="max-w-[200px] truncate">{patient.email}</span>
                  </a>
                )}
              </div>
              {patient.source && (
                <div className="mt-3">
                  <Badge variant="accent">{label(PATIENT_SOURCE, patient.source)}</Badge>
                </div>
              )}
              {patient.tags && patient.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {patient.tags.map((t) => (
                    <Badge key={t} variant="accent">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-52">
            {summary?.activePlanId ? (
              <Link href={`/clinical/${summary.activePlanId}`}>
                <Button className="w-full justify-center">
                  <Stethoscope size={16} />
                  План лечения
                </Button>
              </Link>
            ) : (
              <Link href="/clinical">
                <Button className="w-full justify-center">
                  <Stethoscope size={16} />
                  Новый план
                </Button>
              </Link>
            )}
            <Link href={patient.id ? `/schedule?patientId=${patient.id}` : '/schedule'}>
              <Button variant="ghost" className="w-full justify-center">
                <Calendar size={16} />
                Записать
              </Button>
            </Link>
            {patient.id && hasDebt && (
              <Link href={`/finance?patientId=${patient.id}`}>
                <Button variant="danger" className="w-full justify-center">
                  <Wallet size={16} />
                  Оплатить долг
                </Button>
              </Link>
            )}
            {onEdit && (
              <button type="button" className="text-sm text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline" onClick={onEdit}>
                Редактировать карточку
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-px border-t border-[var(--border)] bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: 'Долг',
            value: formatMoney(summary?.balanceDue ?? 0),
            tone: hasDebt ? 'text-[var(--danger)]' : 'text-[var(--success)]',
            icon: Receipt,
          },
          {
            label: 'Депозит',
            value: formatMoney(summary?.depositBalance ?? 0),
            tone: 'text-[var(--accent)]',
            icon: Wallet,
          },
          { label: 'Визитов', value: String(stats.visits), tone: 'text-[var(--text)]', icon: Calendar },
          { label: 'Планов', value: String(stats.plans), tone: 'text-[var(--text)]', icon: Stethoscope },
          { label: 'Открытых счетов', value: String(stats.openInvoices), tone: 'text-[var(--text)]', icon: Receipt },
        ].map((m) => (
          <div key={m.label} className="bg-[var(--surface)] px-5 py-4">
            <p className={`ds-display text-xl tabular-nums ${m.tone}`}>{m.value}</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{m.label}</p>
          </div>
        ))}
      </div>

      {(summary?.nextAppointment || summary?.activePlanTitle) && (
        <div className="grid gap-3 border-t border-[var(--border)] bg-[var(--surface-muted)]/30 p-4 sm:grid-cols-2 sm:px-6">
          {summary.nextAppointment && (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                <Calendar size={20} className="text-[var(--accent)]" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Следующий визит</p>
                <p className="mt-0.5 font-semibold text-[var(--text)]">{formatDate(summary.nextAppointment.startsAt)}</p>
                {summary.nextAppointment.service?.name && (
                  <p className="text-sm text-[var(--muted)]">{summary.nextAppointment.service.name}</p>
                )}
              </div>
            </div>
          )}
          {summary.activePlanTitle && summary.activePlanId && (
            <Link
              href={`/clinical/${summary.activePlanId}`}
              className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-4 transition hover:border-[var(--accent)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)]">
                <Stethoscope size={20} className="text-[var(--accent)]" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Активный план</p>
                <p className="mt-0.5 font-semibold text-[var(--text)]">{summary.activePlanTitle}</p>
                <p className="text-sm text-[var(--muted)]">Открыть план →</p>
              </div>
            </Link>
          )}
        </div>
      )}

      {patient.notes && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-muted)]/50 px-6 py-4 sm:px-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Заметка администратора</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{patient.notes}</p>
        </div>
      )}
    </div>
  );
}
