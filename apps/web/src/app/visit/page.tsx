'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Armchair } from 'lucide-react';
import { Protected } from '@/components/protected';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PatientAvatar } from '@/components/patient-avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { APPOINTMENT_STATUS, label } from '@/lib/format';

type Desk = {
  appointments: {
    id: string;
    startsAt: string;
    status: string;
    patient: { id: string; firstName: string; lastName: string };
    doctor?: { firstName: string; lastName: string } | null;
    service?: { name: string } | null;
  }[];
};

const STATUS_VARIANT: Record<string, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  SCHEDULED: 'default',
  CONFIRMED: 'accent',
  WAITING: 'warning',
  IN_PROGRESS: 'accent',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
};

export default function VisitListPage() {
  const { branchId } = useBranch();
  const [desk, setDesk] = useState<Desk | null>(null);

  const load = useCallback(() => {
    if (!branchId) return;
    api<Desk>(`/queue/reception-desk?branchId=${branchId}`).then(setDesk).catch(console.error);
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = desk?.appointments ?? [];

  return (
    <Protected>
      <PageHeader
        badge="Кресло"
        title="Приёмы сегодня"
        description="Откройте запись — зубная формула, план лечения и счёт в одном окне"
      />
      <div className="space-y-2">
        {rows.map((a) => (
          <div key={a.id} className="ds-card-hover flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-[56px] text-center">
              <p className="text-base font-semibold text-[var(--text)]">
                {new Date(a.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <PatientAvatar firstName={a.patient.firstName} lastName={a.patient.lastName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--text)]">
                {a.patient.lastName} {a.patient.firstName}
              </p>
              <p className="text-sm text-[var(--muted)]">
                {a.service?.name ?? 'Приём'}
                {a.doctor ? ` · ${a.doctor.lastName}` : ''}
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[a.status] ?? 'default'}>{label(APPOINTMENT_STATUS, a.status)}</Badge>
            <Link href={`/visit/${a.id}`}>
              <Button>
                <Armchair size={16} />
                Открыть приём
              </Button>
            </Link>
          </div>
        ))}
        {!rows.length && (
          <EmptyState icon={Armchair} title="На сегодня записей нет" description="Создайте запись в расписании" />
        )}
      </div>
    </Protected>
  );
}
